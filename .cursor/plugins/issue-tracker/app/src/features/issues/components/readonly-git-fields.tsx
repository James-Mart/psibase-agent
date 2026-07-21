import { GitPullRequest } from "lucide-react";
import { CHIP_UNSET } from "@server/fields";

export function CommitShaDisplay({ commitSha }: { commitSha?: string }) {
  return commitSha ? (
    <span className="font-mono">{commitSha}</span>
  ) : (
    <span className="text-muted-foreground">not committed</span>
  );
}

export function BranchNameDisplay({ branchName }: { branchName?: string }) {
  return branchName ? (
    <span className="font-mono">{branchName}</span>
  ) : (
    <span className="text-muted-foreground">{CHIP_UNSET}</span>
  );
}

export function PrUrlDisplay({ prUrl }: { prUrl?: string }) {
  return prUrl ? (
    <a
      href={prUrl}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-primary hover:underline"
    >
      <GitPullRequest className="h-3.5 w-3.5" />
      {prUrl}
    </a>
  ) : (
    <span className="text-muted-foreground">no PR</span>
  );
}
