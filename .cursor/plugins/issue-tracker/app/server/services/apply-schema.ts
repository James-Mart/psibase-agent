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

const projectNode = z
  .object({
    id: idField,
    title: titleField,
    description: descriptionField,
    epics: z.array(epicNode).optional(),
  })
  .strict();

export const applyDocSchema = z
  .object({
    project: projectNode,
  })
  .strict();

export type ApplyDoc = z.infer<typeof applyDocSchema>;

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
  const visitBranch = (branch: BranchNode): void => {
    ids.push(branch.id);
    for (const commit of branch.commits ?? []) ids.push(commit.id);
    for (const stacked of branch.stacked ?? []) visitBranch(stacked);
  };
  ids.push(doc.project.id);
  for (const epic of doc.project.epics ?? []) {
    ids.push(epic.id);
    for (const branch of epic.branches ?? []) visitBranch(branch);
  }
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
  const result = applyDocSchema.safeParse(raw);
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
    branch: BranchNode,
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
    // `stackedOn` reflects the nesting under this branch.
    for (const stacked of branch.stacked ?? []) {
      emitBranch(stacked, epicId, branch.id);
    }
  };

  const project = doc.project;
  desired.push({
    id: project.id,
    kind: "project",
    title: project.title,
    ...(project.description !== undefined
      ? { description: project.description }
      : {}),
  });
  for (const epic of project.epics ?? []) {
    desired.push({
      id: epic.id,
      kind: "epic",
      title: epic.title,
      partOf: project.id,
      ...(epic.description !== undefined
        ? { description: epic.description }
        : {}),
    });
    for (const branch of epic.branches ?? []) {
      emitBranch(branch, epic.id, undefined);
    }
  }

  return desired;
}
