import { z } from "zod";
import type { ClearableKey } from "./fields.js";

export const KINDS = ["project", "epic", "branch", "commit"] as const;
export const COMMIT_STATUSES = ["todo", "in-progress", "done"] as const;

const nonEmpty = z.string().min(1);

export const chatMessageSchema = z.object({
  role: nonEmpty,
  name: z.string().optional(),
  body: nonEmpty,
  at: nonEmpty,
});

// The write-time input is the stored shape minus the server-stamped `at`.
export const chatMessageInputSchema = chatMessageSchema.omit({ at: true });

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatMessageInput = z.infer<typeof chatMessageInputSchema>;

export interface ChatResponse {
  messages: ChatMessage[];
  problems: Problem[];
}

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
const orderField = { order: z.number().int().nonnegative().default(0) };

// A Project is a minimal organizational container: no status, no assignee, and
// no needs-attention. Deliberately does not spread `mutableCommon`.
export const projectSchema = z.object({
  id: nonEmpty,
  kind: z.literal("project"),
  title: nonEmpty,
  ...orderField,
  ...timestamps,
});

export const epicSchema = z.object({
  id: nonEmpty,
  kind: z.literal("epic"),
  partOf: nonEmpty,
  ...mutableCommon,
  ...orderField,
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
  ...orderField,
  ...timestamps,
});

export const commitSchema = z.object({
  id: nonEmpty,
  kind: z.literal("commit"),
  partOf: nonEmpty,
  status: z.enum(COMMIT_STATUSES).default("todo"),
  commitSha: z.string().optional(),
  ...mutableCommon,
  ...orderField,
  ...timestamps,
});

export const issueSchema = z.discriminatedUnion("kind", [
  projectSchema,
  epicSchema,
  branchSchema,
  commitSchema,
]);

export type Issue = z.infer<typeof issueSchema>;
export type IssueKind = (typeof KINDS)[number];
export type CommitStatus = (typeof COMMIT_STATUSES)[number];

export const PARENT_KIND: Record<IssueKind, IssueKind | null> = {
  project: null,
  epic: "project",
  branch: "epic",
  commit: "branch",
};

export const CHILD_KIND: Record<IssueKind, IssueKind | null> = {
  project: "epic",
  epic: "branch",
  branch: "commit",
  commit: null,
};

type IssueFields = Omit<z.infer<typeof projectSchema>, "kind"> &
  Omit<z.infer<typeof epicSchema>, "kind"> &
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

export type IssueDetail = IssueRecord & {
  description: string;
  version: string;
};

export interface Problem {
  id: string;
  message: string;
}

export type IssueEventType = "add" | "change" | "unlink" | "unlink-dir";
export type IssueEventScope = "issue" | "chat";

export interface IssueEvent {
  type: IssueEventType;
  id: string;
  scope: IssueEventScope;
}

export type BranchStatus = "not-started" | "in-progress" | "pr-open" | "merged";
export type EpicStatus = "todo" | "in-progress" | "done";

export interface DerivedState {
  ready: boolean;
  blocked: boolean;
  branchStatus?: BranchStatus;
  epicStatus?: EpicStatus;
  base?: string;
}

export interface IssuesResponse {
  issues: IssueRecord[];
  problems: Problem[];
  derived: Record<string, DerivedState>;
  ready: string[];
}

export type ParseResult =
  | { ok: true; issue: Issue }
  | { ok: false; message: string };

// Render the first zod issue as `path: message` (or just the message at the
// root). Shared by every parser here and by the `apply` doc schema so error
// shapes stay uniform; `fallback` names the doc when there is no issue.
export function formatZodError(
  error: z.ZodError,
  fallback = "invalid input",
): string {
  const first = error.issues[0];
  if (!first) return fallback;
  const path = first.path.join(".");
  return path ? `${path}: ${first.message}` : first.message;
}

export function parseIssue(raw: unknown): ParseResult {
  const result = issueSchema.safeParse(raw);
  if (result.success) return { ok: true, issue: result.data };
  return { ok: false, message: formatZodError(result.error, "invalid issue.json") };
}

export type ChatParseResult =
  | { ok: true; message: ChatMessage }
  | { ok: false; message: string };

export function parseChatMessage(raw: unknown): ChatParseResult {
  const result = chatMessageSchema.safeParse(raw);
  if (result.success) return { ok: true, message: result.data };
  return { ok: false, message: formatZodError(result.error, "invalid issue.json") };
}

export type ChatInputParseResult =
  | { ok: true; input: ChatMessageInput }
  | { ok: false; message: string };

export function parseChatMessageInput(raw: unknown): ChatInputParseResult {
  const result = chatMessageInputSchema.safeParse(raw);
  if (result.success) return { ok: true, input: result.data };
  return { ok: false, message: formatZodError(result.error, "invalid issue.json") };
}
