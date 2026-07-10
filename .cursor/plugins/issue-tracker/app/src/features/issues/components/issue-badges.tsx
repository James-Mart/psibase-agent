import { AlertTriangle, User } from "lucide-react";
import type { IssueRecord } from "@server/schemas";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";

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
  const assignee = "assignee" in issue ? issue.assignee : undefined;
  const needsAttention = "needsAttention" in issue ? issue.needsAttention : false;
  const attentionReason =
    "attentionReason" in issue ? issue.attentionReason : null;

  if (!assignee && !needsAttention) return null;
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
    </span>
  );
}
