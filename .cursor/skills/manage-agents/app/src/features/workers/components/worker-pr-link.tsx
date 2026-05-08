import { AlertCircle, CheckCircle2, GitPullRequest, MessageSquare } from "lucide-react";
import type { PrInfo } from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";

interface Props {
  pr: PrInfo | null;
  size?: number;
  className?: string;
}

const stateClass: Record<PrInfo["state"], string> = {
  open: "[color:hsl(var(--success))]",
  merged: "[color:hsl(280_60%_70%)]",
  closed: "[color:hsl(var(--destructive))]",
};

function buildTitle(pr: PrInfo): string {
  const parts = [`PR ${pr.state}`];
  if (pr.reviewDecision === "approved") parts.push("approved");
  else if (pr.reviewDecision === "changes_requested") parts.push("changes requested");
  if (pr.unresolvedThreads > 0) parts.push(`${pr.unresolvedThreads} unresolved`);
  return parts.join(" · ");
}

export function WorkerPrLink({ pr, size = 16, className }: Props) {
  if (!pr) return null;
  return (
    <a
      href={pr.url}
      target="_blank"
      rel="noopener noreferrer"
      title={buildTitle(pr)}
      className={cn("inline-flex items-center gap-1", stateClass[pr.state], className)}
      onClick={(e) => e.stopPropagation()}
    >
      <GitPullRequest size={size} />
      {pr.reviewDecision === "approved" && (
        <CheckCircle2 size={12} className="[color:hsl(var(--success))]" />
      )}
      {pr.reviewDecision === "changes_requested" && (
        <AlertCircle size={12} className="[color:hsl(var(--warning))]" />
      )}
      {pr.unresolvedThreads > 0 && (
        <span className="inline-flex items-center gap-px text-muted-foreground">
          <MessageSquare size={12} />
          <span className="text-xs">{pr.unresolvedThreads}</span>
        </span>
      )}
    </a>
  );
}
