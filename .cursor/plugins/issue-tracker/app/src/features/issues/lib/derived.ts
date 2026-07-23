import type {
  StoryStatus,
  TaskStatus,
  EpicStatus,
  SpecReviewStatus,
  QaStatus,
  RetroStatus,
  IssueRecord,
  DerivedState,
} from "@server/schemas";
import type { BadgeProps } from "@/components/ui/badge";

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "todo",
  "in-progress": "in progress",
  fixing: "fixing",
  done: "done",
};

export const TASK_STATUS_BADGE_VARIANT: Record<
  TaskStatus,
  NonNullable<BadgeProps["variant"]>
> = {
  todo: "todo",
  "in-progress": "inProgress",
  fixing: "current",
  done: "done",
};

export const QA_STATUS_LABEL: Record<QaStatus, string> = {
  reviewing: "reviewing",
  "changes-requested": "changes requested",
  passed: "passed",
};

export const QA_STATUS_BADGE_VARIANT: Record<
  QaStatus,
  NonNullable<BadgeProps["variant"]>
> = {
  reviewing: "inProgress",
  "changes-requested": "destructive",
  passed: "done",
};

export const STORY_STATUS_LABEL: Record<StoryStatus, string> = {
  "not-started": "not started",
  "in-progress": "in progress",
  "pr-open": "PR open",
  merged: "merged",
};

export const STORY_STATUS_BADGE_VARIANT: Record<
  StoryStatus,
  NonNullable<BadgeProps["variant"]>
> = {
  "not-started": "todo",
  "in-progress": "inProgress",
  "pr-open": "outline",
  merged: "done",
};

export const EPIC_STATUS_LABEL: Record<EpicStatus, string> = {
  todo: "todo",
  "in-progress": "in progress",
  done: "done",
};

export const EPIC_STATUS_BADGE_VARIANT: Record<
  EpicStatus,
  NonNullable<BadgeProps["variant"]>
> = {
  todo: "todo",
  "in-progress": "inProgress",
  done: "done",
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

export const RETRO_LABEL: Record<RetroStatus, string> = {
  "in-progress": "in progress",
  done: "done",
};

export const RETRO_BADGE_VARIANT: Record<
  RetroStatus,
  NonNullable<BadgeProps["variant"]>
> = {
  "in-progress": "inProgress",
  done: "done",
};

/** True when work is actively in flight on this issue. */
export function isInFlight(
  issue: IssueRecord,
  state: DerivedState | undefined,
): boolean {
  if (
    issue.kind === "task" &&
    (issue.status === "in-progress" || issue.status === "fixing")
  ) {
    return true;
  }
  return (
    state?.storyStatus === "in-progress" ||
    state?.epicStatus === "in-progress"
  );
}

/** True when any issue in the set has active in-flight work. */
export function hasInFlightWork(
  issues: IssueRecord[],
  derived: Record<string, DerivedState>,
): boolean {
  return issues.some((issue) => isInFlight(issue, derived[issue.id]));
}
