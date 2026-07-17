import type { StoryStatus, TaskStatus, EpicStatus, SpecReviewStatus } from "@server/schemas";
import type { BadgeProps } from "@/components/ui/badge";

export const TASK_STATUS_CLASS: Record<TaskStatus, string> = {
  todo: "text-muted-foreground",
  "in-progress": "[color:hsl(var(--warning))]",
  done: "[color:hsl(var(--success))]",
};

export const STORY_STATUS_LABEL: Record<StoryStatus, string> = {
  "not-started": "not started",
  "in-progress": "in progress",
  "pr-open": "PR open",
  merged: "merged",
};

export const STORY_STATUS_CLASS: Record<StoryStatus, string> = {
  "not-started": "text-muted-foreground",
  "in-progress": "[color:hsl(var(--warning))]",
  "pr-open": "text-foreground",
  merged: "[color:hsl(var(--success))]",
};

export const EPIC_STATUS_LABEL: Record<EpicStatus, string> = {
  todo: "todo",
  "in-progress": "in progress",
  done: "done",
};

export const EPIC_STATUS_CLASS: Record<EpicStatus, string> = {
  todo: "text-muted-foreground",
  "in-progress": "[color:hsl(var(--warning))]",
  done: "[color:hsl(var(--success))]",
};

export const SPEC_REVIEW_LABEL: Record<SpecReviewStatus, string> = {
  passed: "passed",
  failed: "failed",
};

export const SPEC_REVIEW_BADGE_VARIANT: Record<
  SpecReviewStatus,
  NonNullable<BadgeProps["variant"]>
> = {
  passed: "done",
  failed: "destructive",
};
