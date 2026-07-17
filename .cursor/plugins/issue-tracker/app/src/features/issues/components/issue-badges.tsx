import { AlertTriangle, CircleSlash, ClipboardCheck, User } from "lucide-react";
import type { IssueRecord } from "@server/schemas";
import { assigneeOf } from "@server/assignee";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import {
  SPEC_REVIEW_BADGE_VARIANT,
  SPEC_REVIEW_LABEL,
} from "../lib/derived";

// A Project carries none of the attention/assignee fields, so read them defensively.
export function IssueBadges({
  issue,
  compact = false,
  className,
}: {
  issue: IssueRecord;
  compact?: boolean;
  className?: string;
}) {
  const assignee = assigneeOf(issue);
  const needsAttention = "needsAttention" in issue ? issue.needsAttention : false;
  const attentionReason =
    "attentionReason" in issue ? issue.attentionReason : null;
  const specReview =
    !compact && issue.kind === "story" ? issue.specReview : undefined;
  const noDiff =
    !compact && issue.kind === "task" ? issue.noDiff : undefined;

  if (!assignee && !needsAttention && !specReview && !noDiff) return null;
  return (
    <span className={cn("flex items-center gap-1.5", className)}>
      {needsAttention ? (
        <Badge
          variant="warning"
          className="gap-1"
          title={attentionReason ?? "needs attention"}
        >
          <AlertTriangle className="h-3 w-3" />
          {compact ? "attention" : (attentionReason ?? "needs attention")}
        </Badge>
      ) : null}
      {assignee ? (
        <Badge variant="secondary" className="gap-1">
          <User className="h-3 w-3" />
          {assignee}
        </Badge>
      ) : null}
      {specReview ? (
        <Badge variant={SPEC_REVIEW_BADGE_VARIANT[specReview]} className="gap-1">
          <ClipboardCheck className="h-3 w-3" />
          {SPEC_REVIEW_LABEL[specReview]}
        </Badge>
      ) : null}
      {noDiff ? (
        <Badge variant="secondary" className="gap-1" title="Intentional empty implementor diff">
          <CircleSlash className="h-3 w-3" />
          no diff
        </Badge>
      ) : null}
    </span>
  );
}
