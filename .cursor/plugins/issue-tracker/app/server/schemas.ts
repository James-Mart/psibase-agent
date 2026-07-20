import { z } from "zod";
import type { ClearableKey } from "./fields.js";

export const KINDS = ["project", "epic", "idea", "story", "task"] as const;
export const TASK_STATUSES = ["todo", "in-progress", "fixing", "done"] as const;
export const QA_STATUSES = ["reviewing", "changes-requested", "passed"] as const;
export const RETRO_STATUSES = ["in-progress", "done"] as const;
export const MERGE_POLICIES = ["merge", "pull-request", "manual"] as const;
export const SPEC_REVIEW_STATUSES = ["passed", "failed"] as const;

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
  // Explicit visibility flag (not auto-derived from Done). Absent parses as false.
  archived: z.boolean().default(false),
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
  workspace: z.string().optional(),
  mergePolicy: z.enum(MERGE_POLICIES).default("manual"),
  ...orderField,
  ...timestamps,
});

export const epicSchema = z.object({
  id: nonEmpty,
  kind: z.literal("epic"),
  partOf: nonEmpty,
  blockedBy: z.array(z.string()).default([]),
  retro: z.enum(RETRO_STATUSES).optional(),
  ...mutableCommon,
  ...orderField,
  ...timestamps,
});

// An Idea is a Project-level capture item: title/description/archive only —
// no assignee, needs-attention, or work-status fields.
export const ideaSchema = z.object({
  id: nonEmpty,
  kind: z.literal("idea"),
  partOf: nonEmpty,
  title: nonEmpty,
  archived: z.boolean().default(false),
  ...orderField,
  ...timestamps,
});

export const storySchema = z.object({
  id: nonEmpty,
  kind: z.literal("story"),
  partOf: nonEmpty,
  branchName: z.string().optional(),
  // Git ref this Story forks from / merges into. Set at create/apply (root →
  // `main`; stacked child → parent's `branchName` when known). Absent until the
  // parent is named for a child created before that. Never silently re-derived
  // from `stackedOn` at git/spawn time — see stored `mergeBase` / derived `base`.
  mergeBase: z.string().min(1).optional(),
  stackedOn: z.string().optional(),
  prUrl: z.string().optional(),
  merged: z.boolean().default(false),
  specReview: z.enum(SPEC_REVIEW_STATUSES).optional(),
  ...mutableCommon,
  ...orderField,
  ...timestamps,
});

export const taskSchema = z.object({
  id: nonEmpty,
  kind: z.literal("task"),
  partOf: nonEmpty,
  status: z.enum(TASK_STATUSES).default("todo"),
  qa: z.enum(QA_STATUSES).optional(),
  commitSha: z.string().optional(),
  noDiff: z.boolean().optional(),
  ...mutableCommon,
  ...orderField,
  ...timestamps,
});

export const issueSchema = z.discriminatedUnion("kind", [
  projectSchema,
  epicSchema,
  ideaSchema,
  storySchema,
  taskSchema,
]);

export type Issue = z.infer<typeof issueSchema>;
export type IssueKind = (typeof KINDS)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type QaStatus = (typeof QA_STATUSES)[number];
export type RetroStatus = (typeof RETRO_STATUSES)[number];
export type MergePolicy = (typeof MERGE_POLICIES)[number];
export type SpecReviewStatus = (typeof SPEC_REVIEW_STATUSES)[number];

export const PARENT_KIND: Record<IssueKind, IssueKind | null> = {
  project: null,
  epic: "project",
  idea: "project",
  story: "epic",
  task: "story",
};

export const CHILD_KIND: Record<IssueKind, IssueKind | null> = {
  project: "epic",
  epic: "story",
  idea: null,
  story: "task",
  task: null,
};

type IssueFields = Omit<z.infer<typeof projectSchema>, "kind"> &
  Omit<z.infer<typeof epicSchema>, "kind"> &
  Omit<z.infer<typeof ideaSchema>, "kind"> &
  Omit<z.infer<typeof storySchema>, "kind"> &
  Omit<z.infer<typeof taskSchema>, "kind">;

export type IssuePatch = Partial<
  Omit<IssueFields, "id" | "createdAt" | "updatedAt" | ClearableKey>
> & { description?: string } & Partial<Record<ClearableKey, string | null>>;

export type CreateInput = Pick<IssueFields, "title"> &
  Partial<
    Pick<
      IssueFields,
      "partOf" | "assignee" | "stackedOn" | "workspace" | "mergePolicy"
    >
  > & {
    kind: IssueKind;
    description?: string;
  };

export type IssueRecord = Issue;

export type IssueDetail = IssueRecord & {
  description: string;
  version: string;
};

export interface Problem {
  id: string;
  message: string;
}

export type IssueEventType = "add" | "change" | "unlink" | "unlink-dir";
export type IssueEventScope = "issue" | "chat" | "attachments";

export interface IssueEvent {
  type: IssueEventType;
  id: string;
  scope: IssueEventScope;
}

export type StoryStatus = "not-started" | "in-progress" | "pr-open" | "merged";
export type EpicStatus = "todo" | "in-progress" | "done";

export interface DerivedState {
  blocked: boolean;
  storyStatus?: StoryStatus;
  epicStatus?: EpicStatus;
  base?: string;
}

export interface IssuesResponse {
  issues: IssueRecord[];
  problems: Problem[];
  derived: Record<string, DerivedState>;
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
