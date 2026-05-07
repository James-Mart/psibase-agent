import { GitPullRequest } from "lucide-react";
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

export function WorkerPrLink({ pr, size = 16, className }: Props) {
  if (!pr) return null;
  return (
    <a
      href={pr.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`PR ${pr.state}`}
      className={cn("inline-flex items-center", stateClass[pr.state], className)}
      onClick={(e) => e.stopPropagation()}
    >
      <GitPullRequest size={size} />
    </a>
  );
}
