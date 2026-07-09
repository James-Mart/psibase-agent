import { z } from "zod";
import type { ClearableKey } from "./fields.js";

export const KINDS = ["epic", "branch", "commit"] as const;
export const COMMIT_STATUSES = ["todo", "in-progress", "done"] as const;

const nonEmpty = z.string().min(1);

const mutableCommon = {
  title: nonEmpty,
  assignee: z.string().optional(),
  needsAttention: z.boolean().default(false),
  attentionReason: z.string().nullable().default(null),
};
const timestamps = {
  createdAt: nonEmpty,
  updatedAt: nonEmpty,
};

export const epicSchema = z.object({
  id: nonEmpty,
  kind: z.literal("epic"),
  ...mutableCommon,
  ...timestamps,
});

export const branchSchema = z.object({
  id: nonEmpty,
  kind: z.literal("branch"),
  partOf: nonEmpty,
  branchName: z.string().optional(),
  stackedOn: z.string().optional(),
  blockedBy: z.array(z.string()).default([]),
  prUrl: z.string().optional(),
  merged: z.boolean().default(false),
  ...mutableCommon,
  ...timestamps,
});

export const commitSchema = z.object({
  id: nonEmpty,
  kind: z.literal("commit"),
  partOf: nonEmpty,
  status: z.enum(COMMIT_STATUSES).default("todo"),
  commitSha: z.string().optional(),
  ...mutableCommon,
  ...timestamps,
});

export const issueSchema = z.discriminatedUnion("kind", [
  epicSchema,
  branchSchema,
  commitSchema,
]);

export type Issue = z.infer<typeof issueSchema>;
export type IssueKind = (typeof KINDS)[number];
export type CommitStatus = (typeof COMMIT_STATUSES)[number];

export const PARENT_KIND: Record<IssueKind, IssueKind | null> = {
  epic: null,
  branch: "epic",
  commit: "branch",
};

export const CHILD_KIND: Record<IssueKind, IssueKind | null> = {
  epic: "branch",
  branch: "commit",
  commit: null,
};

type IssueFields = Omit<z.infer<typeof epicSchema>, "kind"> &
  Omit<z.infer<typeof branchSchema>, "kind"> &
  Omit<z.infer<typeof commitSchema>, "kind">;

export type IssuePatch = Partial<
  Omit<IssueFields, "id" | "createdAt" | "updatedAt" | ClearableKey>
> & { description?: string } & Partial<Record<ClearableKey, string | null>>;

export type CreateInput = Pick<IssueFields, "title"> &
  Partial<Pick<IssueFields, "partOf" | "assignee" | "stackedOn">> & {
    kind: IssueKind;
    description?: string;
  };

export interface FilePresence {
  hasDescription: boolean;
  hasChat: boolean;
}

export type IssueRecord = Issue & FilePresence;

export type IssueDetail = IssueRecord & { description: string };

export interface Problem {
  id: string;
  message: string;
}

export interface IssuesResponse {
  issues: IssueRecord[];
  problems: Problem[];
}

export type ParseResult =
  | { ok: true; issue: Issue }
  | { ok: false; message: string };

function formatError(error: z.ZodError): string {
  const first = error.issues[0];
  if (!first) return "invalid issue.json";
  const path = first.path.join(".");
  return path ? `${path}: ${first.message}` : first.message;
}

export function parseIssue(raw: unknown): ParseResult {
  const result = issueSchema.safeParse(raw);
  if (result.success) return { ok: true, issue: result.data };
  return { ok: false, message: formatError(result.error) };
}
