import { z } from "zod";
import type { Issue } from "../schemas.js";
import { formatZodError } from "../schemas.js";
import { SLUG_RE } from "./slug.js";

// The declarative `apply` doc describes a whole Project > Epic > Branch > Commit
// tree in one nested document. Kind is implied by the child key (`epics` /
// `branches` / `commits` / `stacked`) and is never written. `partOf` is inferred
// from the enclosing container and `stackedOn` from being nested under another
// branch; only `blockedBy` uses explicit id references. Every node carries a
// mandatory author-chosen kebab `id` so re-apply is stable across retitles.

// Ids must be slug-safe: the same shape `slugify()` produces (see `SLUG_RE` in
// slug.ts), so auto-slugs and author-chosen ids stay aligned.
const idField = z
  .string()
  .regex(
    SLUG_RE,
    "id must be kebab-case (lowercase letters and digits, single hyphens, no leading/trailing hyphen)",
  );
const titleField = z.string().min(1, "title is required");
const descriptionField = z.string().optional();

const commitNode = z
  .object({
    id: idField,
    title: titleField,
    description: descriptionField,
  })
  .strict();

export type CommitNode = z.infer<typeof commitNode>;

// A branch may be stacked under another branch to any depth, so its node is
// recursive; the explicit interface pins the type for `z.lazy`.
export interface BranchNode {
  id: string;
  title: string;
  description?: string;
  blockedBy?: string[];
  commits?: CommitNode[];
  stacked?: BranchNode[];
}

const branchNode: z.ZodType<BranchNode> = z.lazy(() =>
  z
    .object({
      id: idField,
      title: titleField,
      description: descriptionField,
      // `blockedBy` references other node ids, so hold it to the same kebab rule.
      blockedBy: z.array(idField).optional(),
      commits: z.array(commitNode).optional(),
      stacked: z.array(branchNode).optional(),
    })
    .strict(),
);

const epicNode = z
  .object({
    id: idField,
    title: titleField,
    description: descriptionField,
    branches: z.array(branchNode).optional(),
  })
  .strict();

export type EpicNode = z.infer<typeof epicNode>;

// A branch-rooted doc reconciles only the branch's own subtree (the branch plus
// its commits). Stacked children live under the *Epic* (`partOf` the Epic, not
// the branch), so they are outside a branch's subtree and cannot be declared
// here — hence a non-recursive node with no `stacked` key.
const rootBranchNode = z
  .object({
    id: idField,
    title: titleField,
    description: descriptionField,
    blockedBy: z.array(idField).optional(),
    commits: z.array(commitNode).optional(),
  })
  .strict();

export type RootBranchNode = z.infer<typeof rootBranchNode>;

const projectNode = z
  .object({
    id: idField,
    title: titleField,
    description: descriptionField,
    epics: z.array(epicNode).optional(),
  })
  .strict();

// The doc may be rooted at a Project, an Epic, or a Branch. The root node is
// upserted and pruned within its own subtree; any enclosing parent (named by id)
// is a reference that must already exist and is never upserted or pruned. Forms
// are told apart by which root key holds an object (see `parseApplyDoc`).
const projectApplyDoc = z.object({ project: projectNode }).strict();
const epicApplyDoc = z.object({ project: idField, epic: epicNode }).strict();
const branchApplyDoc = z
  .object({ project: idField, epic: idField, branch: rootBranchNode })
  .strict();

export type ProjectApplyDoc = z.infer<typeof projectApplyDoc>;
export type EpicApplyDoc = z.infer<typeof epicApplyDoc>;
export type BranchApplyDoc = z.infer<typeof branchApplyDoc>;
export type ApplyDoc = ProjectApplyDoc | EpicApplyDoc | BranchApplyDoc;

// A branch-rooted doc is the only one with a `branch` key; an epic-rooted doc
// is the only remaining one with an `epic` key. Anything else is project-rooted.
export function isBranchDoc(doc: ApplyDoc): doc is BranchApplyDoc {
  return "branch" in doc;
}
export function isEpicDoc(doc: ApplyDoc): doc is EpicApplyDoc {
  return "epic" in doc && !("branch" in doc);
}

// The doc-owned subset of each Issue kind (the fields `apply` is allowed to
// write), derived from the canonical `Issue` union so it can never drift from
// the stored schema. `apply` never touches runtime/progress fields.
type DocKeys = "id" | "kind" | "title" | "partOf" | "stackedOn" | "blockedBy";
export type DesiredIssue = Issue extends infer T
  ? T extends Issue
    ? Pick<T, Extract<keyof T, DocKeys>> & { description?: string }
    : never
  : never;

export type ApplyParseResult =
  | { ok: true; doc: ApplyDoc }
  | { ok: false; message: string };

function collectIds(doc: ApplyDoc): string[] {
  const ids: string[] = [];
  const visitBranch = (branch: BranchNode | RootBranchNode): void => {
    ids.push(branch.id);
    for (const commit of branch.commits ?? []) ids.push(commit.id);
    for (const stacked of ("stacked" in branch ? branch.stacked : undefined) ??
      [])
      visitBranch(stacked);
  };
  const visitEpic = (epic: EpicNode): void => {
    ids.push(epic.id);
    for (const branch of epic.branches ?? []) visitBranch(branch);
  };
  if (isBranchDoc(doc)) {
    visitBranch(doc.branch);
    return ids;
  }
  if (isEpicDoc(doc)) {
    visitEpic(doc.epic);
    return ids;
  }
  ids.push(doc.project.id);
  for (const epic of doc.project.epics ?? []) visitEpic(epic);
  return ids;
}

function firstDuplicate(ids: string[]): string | undefined {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) return id;
    seen.add(id);
  }
  return undefined;
}

// Parse + validate an already-decoded (e.g. from YAML) doc value: shape, kebab
// ids, and cross-doc id uniqueness. Returns a clear message instead of throwing
// so callers can surface it verbatim.
export function parseApplyDoc(raw: unknown): ApplyParseResult {
  // Route to the specific form by root-key shape before parsing so validation
  // errors point at the intended form rather than a noisy union aggregate.
  const keyed = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const schema =
    "branch" in keyed ? branchApplyDoc : "epic" in keyed ? epicApplyDoc : projectApplyDoc;
  const result = schema.safeParse(raw);
  if (!result.success) {
    return { ok: false, message: formatZodError(result.error, "invalid apply doc") };
  }
  const duplicate = firstDuplicate(collectIds(result.data));
  if (duplicate) {
    return { ok: false, message: `duplicate id "${duplicate}"` };
  }
  return { ok: true, doc: result.data };
}

// Flatten the nested doc into the desired `Issue[]`, inferring `kind` from the
// child key, `partOf` from the enclosing container, and `stackedOn` from being
// nested under another branch. `blockedBy` is carried through verbatim.
export function flattenApplyDoc(doc: ApplyDoc): DesiredIssue[] {
  const desired: DesiredIssue[] = [];

  const emitBranch = (
    branch: BranchNode | RootBranchNode,
    epicId: string,
    stackedOn: string | undefined,
  ): void => {
    desired.push({
      id: branch.id,
      kind: "branch",
      title: branch.title,
      partOf: epicId,
      ...(stackedOn ? { stackedOn } : {}),
      blockedBy: branch.blockedBy ?? [],
      ...(branch.description !== undefined
        ? { description: branch.description }
        : {}),
    });
    for (const commit of branch.commits ?? []) {
      desired.push({
        id: commit.id,
        kind: "commit",
        title: commit.title,
        partOf: branch.id,
        ...(commit.description !== undefined
          ? { description: commit.description }
          : {}),
      });
    }
    // A stacked branch lives in the same Epic as its fork point; only its
    // `stackedOn` reflects the nesting under this branch. A `RootBranchNode`
    // (branch-rooted doc) has no `stacked`, so this is a no-op there.
    for (const stacked of ("stacked" in branch ? branch.stacked : undefined) ??
      []) {
      emitBranch(stacked, epicId, branch.id);
    }
  };

  const emitEpic = (epic: EpicNode, projectId: string): void => {
    desired.push({
      id: epic.id,
      kind: "epic",
      title: epic.title,
      partOf: projectId,
      ...(epic.description !== undefined
        ? { description: epic.description }
        : {}),
    });
    for (const branch of epic.branches ?? []) {
      emitBranch(branch, epic.id, undefined);
    }
  };

  // A branch- or epic-rooted doc names its enclosing parent(s) by id only; the
  // parent issues already exist and are not part of the desired set. `stackedOn`
  // for a branch-rooted branch is intentionally omitted here and preserved from
  // disk by `apply` (a branch doc never moves its fork point).
  if (isBranchDoc(doc)) {
    emitBranch(doc.branch, doc.epic, undefined);
    return desired;
  }
  if (isEpicDoc(doc)) {
    emitEpic(doc.epic, doc.project);
    return desired;
  }

  const project = doc.project;
  desired.push({
    id: project.id,
    kind: "project",
    title: project.title,
    ...(project.description !== undefined
      ? { description: project.description }
      : {}),
  });
  for (const epic of project.epics ?? []) emitEpic(epic, project.id);

  return desired;
}
