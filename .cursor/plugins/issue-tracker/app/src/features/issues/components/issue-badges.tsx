import { AlertTriangle, User } from "lucide-react";
import type { IssueRecord } from "@server/schemas";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";

export function IssueBadges({
  issue,
  compact = false,
  className,
}: {
  issue: Pick<IssueRecord, "assignee" | "needsAttention" | "attentionReason">;
  compact?: boolean;
  className?: string;
}) {
  if (!issue.assignee && !issue.needsAttention) return null;
  return (
    <span className={cn("flex items-center gap-1.5", className)}>
      {issue.needsAttention ? (
        <Badge
          variant="warning"
          className="gap-1"
          title={issue.attentionReason ?? "needs attention"}
        >
          <AlertTriangle className="h-3 w-3" />
          {compact
            ? "attention"
            : (issue.attentionReason ?? "needs attention")}
        </Badge>
      ) : null}
      {issue.assignee ? (
        <Badge variant="secondary" className="gap-1">
          <User className="h-3 w-3" />
          {issue.assignee}
        </Badge>
      ) : null}
    </span>
  );
}
