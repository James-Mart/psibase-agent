import {
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
  parseIssue,
  type CreateInput,
  type Issue,
  type IssueDetail,
  type IssuePatch,
  type IssueRecord,
  type IssuesResponse,
  type Problem,
} from "../schemas.js";
import { IssueError } from "./errors.js";
import { derive } from "./derive.js";
import { problemsFor } from "./integrity.js";
import { mergeIssue } from "./merge.js";
import { uniqueSlug } from "./slug.js";

let writeChain: Promise<unknown> = Promise.resolve();

function serialize<T>(fn: () => T): Promise<T> {
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

function readAll(): { issues: Issue[]; problems: Problem[] } {
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
  return {
    issues: issues.map(toRecord),
    problems: [...problems, ...derived.problems],
    derived: derived.byId,
    ready: derived.ready,
  };
}

function readDescription(id: string): string {
  const path = join(dirOf(id), "description.md");
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

// The version covers issue.json + description.md, the two files a user edits;
// chat.jsonl is intentionally excluded (M5 will fold it in).
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
      needsAttention: false,
      attentionReason: null,
      createdAt: now,
      updatedAt: now,
    };
    if (input.assignee) draft.assignee = input.assignee;
    if (input.kind !== "epic") {
      if (!input.partOf) {
        throw new IssueError(
          "validation",
          `a ${input.kind} must have a partOf parent`,
        );
      }
      draft.partOf = input.partOf;
    }
    if (input.kind === "branch") {
      draft.blockedBy = [];
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

export function remove(id: string): Promise<{ id: string }> {
  return serialize(() => {
    if (!existsSync(dirOf(id))) {
      throw new IssueError("not_found", `unknown issue "${id}"`);
    }
    rmSync(dirOf(id), { recursive: true, force: true });
    return { id };
  });
}
