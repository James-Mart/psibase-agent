import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { createHash } from "crypto";
import { join } from "path";
import { issuesDir } from "../config.js";
import {
  parseChatMessage,
  parseChatMessageInput,
  parseIssue,
  PARENT_KIND,
  type ChatMessage,
  type ChatMessageInput,
  type ChatResponse,
  type CreateInput,
  type Issue,
  type IssueDetail,
  type IssuePatch,
  type IssueRecord,
  type IssuesResponse,
  type Problem,
} from "../schemas.js";
import { IssueError } from "./errors.js";
import { nextSiblingOrder, siblingGroupKey } from "../order.js";
import { derive } from "./derive.js";
import { checkIntegrity, problemsFor } from "./integrity.js";
import { mergeIssue } from "./merge.js";
import { planDeletion, type DeletionResult } from "./deletion.js";
import { uniqueSlug } from "./slug.js";

let writeChain: Promise<unknown> = Promise.resolve();

// Exported, with `readAll`/`readDescription`/`commitIssueBatch`, so sibling
// writers in the service layer (e.g. `apply`) can read the current graph and
// commit a validated batch inside this same in-process write chain, and so
// cannot race HTTP/CLI writes. These four are the whole seam: the low-level FS
// primitives stay private to this module.
export function serialize<T>(fn: () => T): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function dirOf(id: string): string {
  return join(issuesDir, id);
}

function jsonPathOf(id: string): string {
  return join(dirOf(id), "issue.json");
}

function chatPathOf(id: string): string {
  return join(dirOf(id), "chat.jsonl");
}

function scanIds(): string[] {
  if (!existsSync(issuesDir)) return [];
  return readdirSync(issuesDir).filter((entry) =>
    statSync(dirOf(entry)).isDirectory(),
  );
}

function readRaw(id: string): {
  issue?: Issue;
  problem?: Problem;
  text?: string;
} {
  const jsonPath = jsonPathOf(id);
  if (!existsSync(jsonPath)) {
    return { problem: { id, message: "missing issue.json" } };
  }
  const text = readFileSync(jsonPath, "utf8");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { problem: { id, message: `invalid issue.json: ${detail}` }, text };
  }
  const parsed = parseIssue(raw);
  if (!parsed.ok) {
    return { problem: { id, message: parsed.message }, text };
  }
  if (parsed.issue.id !== id) {
    return {
      issue: { ...parsed.issue, id },
      problem: {
        id,
        message: `issue.json id "${parsed.issue.id}" does not match directory name`,
      },
      text,
    };
  }
  return { issue: parsed.issue, text };
}

function toRecord(issue: Issue): IssueRecord {
  const dir = dirOf(issue.id);
  return {
    ...issue,
    hasDescription: existsSync(join(dir, "description.md")),
    hasChat: existsSync(join(dir, "chat.jsonl")),
  };
}

export function readAll(): { issues: Issue[]; problems: Problem[] } {
  const issues: Issue[] = [];
  const problems: Problem[] = [];
  for (const id of scanIds()) {
    const { issue, problem } = readRaw(id);
    if (issue) issues.push(issue);
    if (problem) problems.push(problem);
  }
  return { issues, problems };
}

export function list(): IssuesResponse {
  const { issues, problems } = readAll();
  const derived = derive(issues);
  // Parse each chat.jsonl so out-of-band corruption surfaces in the tree/CLI,
  // not just the chat panel. Chats are small local files, so the extra reads
  // are cheap; list() is not invalidated on every chat append (see events).
  const chatProblems = issues.flatMap((issue) => readChat(issue.id).problems);
  return {
    issues: issues.map(toRecord),
    problems: [...problems, ...chatProblems, ...derived.problems],
    derived: derived.byId,
    ready: derived.ready,
  };
}

export function readDescription(id: string): string {
  const path = join(dirOf(id), "description.md");
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

// True when the on-disk issue.json carries keys the current schema no longer
// recognizes (e.g. a Branch's pre-migration `blockedBy`). `parseIssue` strips
// such keys on read, so a parsed issue never reflects them; comparing the raw
// top-level keys against the parsed issue's is the only way to see the drift.
// `apply` uses this so a re-apply reconciles stale fields off disk instead of
// treating a semantically-unchanged-but-stale file as a no-op.
export function onDiskHasUnknownKeys(issue: Issue): boolean {
  const path = jsonPathOf(issue.id);
  if (!existsSync(path)) return false;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return false;
  }
  if (!raw || typeof raw !== "object") return false;
  const known = new Set(Object.keys(issue));
  return Object.keys(raw as Record<string, unknown>).some((key) => !known.has(key));
}

// The version covers issue.json + description.md, the two files the edit form
// mutates. chat.jsonl is excluded on purpose: append-only chat updates live
// through its own SSE-fed query and must not trip the external-edit banner.
export function versionOf(jsonText: string, description: string): string {
  return createHash("sha1")
    .update(jsonText)
    .update("\0")
    .update(description)
    .digest("hex");
}

function toDetail(issue: Issue, jsonText: string, description: string): IssueDetail {
  return {
    ...toRecord(issue),
    description,
    version: versionOf(jsonText, description),
  };
}

export function read(id: string): IssueDetail {
  if (!existsSync(dirOf(id))) {
    throw new IssueError("not_found", `unknown issue "${id}"`);
  }
  const { issue, problem, text } = readRaw(id);
  if (!issue || text === undefined) {
    throw new IssueError("validation", problem?.message ?? `invalid issue "${id}"`);
  }
  return toDetail(issue, text, readDescription(id));
}

function readIssueOrThrow(id: string): Issue {
  if (!existsSync(dirOf(id))) {
    throw new IssueError("not_found", `unknown issue "${id}"`);
  }
  const { issue, problem } = readRaw(id);
  if (!issue) {
    throw new IssueError("validation", problem?.message ?? `invalid issue "${id}"`);
  }
  return issue;
}

function serializeIssue(issue: Issue): string {
  return `${JSON.stringify(issue, null, 2)}\n`;
}

function persist(issue: Issue, jsonText: string): void {
  const dir = dirOf(issue.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(jsonPathOf(issue.id), jsonText);
}

// A single issue to (re)write: its parsed record plus, when provided, the
// description.md body to overwrite. An `undefined` description leaves any
// existing description.md untouched.
export interface IssueWrite {
  issue: Issue;
  description?: string;
}

// Commit a validated batch of issue writes and directory deletions in one shot.
// This keeps the raw filesystem layout (issue.json / description.md paths and
// recursive directory removal) private to this module, so sibling writers like
// `apply` stay off the low-level `persist`/`dirOf`/`rmSync` primitives and there
// is still exactly one place that touches issue storage. Callers must run this
// inside `serialize`, and only after the whole prospective set has passed
// `checkIntegrity` — this function performs no validation of its own.
export function commitIssueBatch(writes: IssueWrite[], deletes: string[]): void {
  for (const { issue, description } of writes) {
    persist(issue, serializeIssue(issue));
    if (description !== undefined) {
      writeFileSync(join(dirOf(issue.id), "description.md"), description);
    }
  }
  for (const id of deletes) {
    rmSync(dirOf(id), { recursive: true, force: true });
  }
}

function assertWritable(target: Issue, all: Issue[]): void {
  const others = all.filter((issue) => issue.id !== target.id);
  const problems = problemsFor(target.id, [...others, target]);
  if (problems.length > 0) {
    throw new IssueError("validation", problems.map((p) => p.message).join("; "));
  }
}

export function create(input: CreateInput): Promise<IssueRecord> {
  return serialize(() => {
    const title = input.title?.trim();
    if (!title) throw new IssueError("validation", "title is required");

    const { issues } = readAll();
    const id = uniqueSlug(
      title,
      issues.map((issue) => issue.id),
    );
    const now = new Date().toISOString();

    const draft: Record<string, unknown> = {
      id,
      kind: input.kind,
      title,
      order: nextSiblingOrder(
        issues,
        input.kind,
        input.partOf,
        input.stackedOn,
      ),
      createdAt: now,
      updatedAt: now,
    };
    // A Project carries none of the common status/assignee/attention fields.
    if (input.kind !== "project") {
      draft.needsAttention = false;
      draft.attentionReason = null;
      if (input.assignee) draft.assignee = input.assignee;
    }
    if (PARENT_KIND[input.kind]) {
      if (!input.partOf) {
        throw new IssueError(
          "validation",
          `a ${input.kind} must have a partOf parent`,
        );
      }
      draft.partOf = input.partOf;
    }
    if (input.kind === "epic") draft.blockedBy = [];
    if (input.kind === "branch") {
      draft.merged = false;
      if (input.stackedOn) draft.stackedOn = input.stackedOn;
    }
    if (input.kind === "commit") draft.status = "todo";

    const parsed = parseIssue(draft);
    if (!parsed.ok) throw new IssueError("validation", parsed.message);

    assertWritable(parsed.issue, issues);
    persist(parsed.issue, serializeIssue(parsed.issue));
    writeFileSync(
      join(dirOf(id), "description.md"),
      input.description ?? `# ${title}\n`,
    );
    return toRecord(parsed.issue);
  });
}

export function update(id: string, patch: IssuePatch): Promise<IssueDetail> {
  return serialize(() => {
    const existing = readIssueOrThrow(id);
    const { issues } = readAll();

    const { description, ...jsonPatch } = patch;
    const merged = mergeIssue(existing, jsonPatch);

    const parsed = parseIssue(merged);
    if (!parsed.ok) throw new IssueError("validation", parsed.message);

    const stripped = Object.keys(merged).filter(
      (key) => !(key in parsed.issue),
    );
    if (stripped.length > 0) {
      throw new IssueError(
        "validation",
        `field(s) not valid for a ${existing.kind}: ${stripped.join(", ")}`,
      );
    }

    // Moving a node to a new sibling group (a reparent via `partOf`, or a Branch
    // restack/unstack via `stackedOn`) can leave its old `order` colliding in the
    // new group; re-append there unless the caller set `order` explicitly. Keyed
    // off the one `siblingGroupKey` definition so it stays in lockstep with the
    // integrity duplicate-order check. This runs before the no-op check, but a
    // group change already makes the issue differ, so the unchanged path is safe.
    const next = parsed.issue;
    const orderPatched = "order" in jsonPatch;
    if (!orderPatched && siblingGroupKey(next) !== siblingGroupKey(existing)) {
      const partOf = "partOf" in next ? next.partOf : undefined;
      const stackedOn = next.kind === "branch" ? next.stackedOn : undefined;
      next.order = nextSiblingOrder(issues, next.kind, partOf, stackedOn, id);
    }

    const jsonUnchanged =
      JSON.stringify(parsed.issue) === JSON.stringify(existing);
    if (jsonUnchanged && description === undefined) {
      return read(id);
    }

    parsed.issue.updatedAt = new Date().toISOString();
    assertWritable(parsed.issue, issues);
    const jsonText = serializeIssue(parsed.issue);
    persist(parsed.issue, jsonText);
    if (description !== undefined) {
      writeFileSync(join(dirOf(id), "description.md"), description);
    }
    const finalDescription =
      description !== undefined ? description : readDescription(id);
    return toDetail(parsed.issue, jsonText, finalDescription);
  });
}

export function readChat(id: string): ChatResponse {
  if (!existsSync(dirOf(id))) {
    throw new IssueError("not_found", `unknown issue "${id}"`);
  }
  const path = chatPathOf(id);
  if (!existsSync(path)) return { messages: [], problems: [] };

  const messages: ChatMessage[] = [];
  const problems: Problem[] = [];
  const lines = readFileSync(path, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      problems.push({ id, message: `chat.jsonl line ${index + 1}: ${detail}` });
      return;
    }
    const parsed = parseChatMessage(raw);
    if (parsed.ok) messages.push(parsed.message);
    else problems.push({ id, message: `chat.jsonl line ${index + 1}: ${parsed.message}` });
  });
  return { messages, problems };
}

export function appendMessage(
  id: string,
  input: ChatMessageInput,
): Promise<ChatMessage> {
  return serialize(() => {
    readIssueOrThrow(id);
    const parsed = parseChatMessageInput(input);
    if (!parsed.ok) throw new IssueError("validation", parsed.message);
    const message: ChatMessage = { ...parsed.input, at: new Date().toISOString() };
    appendFileSync(chatPathOf(id), `${JSON.stringify(message)}\n`);
    return message;
  });
}

// Deleting an issue removes the whole containment subtree (the issue plus every
// descendant `partOf` it) and repairs every surviving foreign reference into it:
// a branch stacked on a deleted branch is spliced to the deleted branch's own
// fork point, and deleted ids are dropped from any branch's `blockedBy`. The
// prospective surviving set is validated before anything is written, so a
// deletion that could not leave the graph valid is refused without side effects.
export function remove(id: string): Promise<DeletionResult> {
  return serialize(() => {
    if (!existsSync(dirOf(id))) {
      throw new IssueError("not_found", `unknown issue "${id}"`);
    }

    const { issues } = readAll();
    const plan = planDeletion(issues, id);
    const deleteSet = new Set(plan.deleteIds);

    const patchOf = new Map<string, IssuePatch>();
    for (const { id: bid, to } of plan.repoint) {
      const patch = patchOf.get(bid) ?? {};
      patch.stackedOn = to ?? null;
      patchOf.set(bid, patch);
    }
    for (const { id: bid, blockedBy } of plan.unblock) {
      const patch = patchOf.get(bid) ?? {};
      patch.blockedBy = blockedBy;
      patchOf.set(bid, patch);
    }

    const now = new Date().toISOString();
    const survivors: Issue[] = [];
    const toPersist: Issue[] = [];
    for (const issue of issues) {
      if (deleteSet.has(issue.id)) continue;
      const patch = patchOf.get(issue.id);
      if (!patch) {
        survivors.push(issue);
        continue;
      }
      const parsed = parseIssue(mergeIssue(issue, patch));
      if (!parsed.ok) throw new IssueError("validation", parsed.message);
      parsed.issue.updatedAt = now;
      survivors.push(parsed.issue);
      toPersist.push(parsed.issue);
    }

    const problems = checkIntegrity(survivors);
    if (problems.length > 0) {
      throw new IssueError("validation", problems.map((p) => p.message).join("; "));
    }

    for (const issue of toPersist) persist(issue, serializeIssue(issue));
    for (const delId of plan.deleteIds) {
      rmSync(dirOf(delId), { recursive: true, force: true });
    }

    return {
      deleted: plan.deleteIds,
      repointed: plan.repoint,
      unblocked: plan.unblock,
    };
  });
}
