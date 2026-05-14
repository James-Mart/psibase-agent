import { Button } from "@/components/ui/button";
import { useDeleteSession } from "../api/mutations";
import type { RhsSession } from "../types";

interface Props {
  workerName: string;
  session: RhsSession;
  currentBranch: string;
}

export function SessionBranchMismatchCard({
  workerName,
  session,
  currentBranch,
}: Props) {
  const del = useDeleteSession(workerName);
  return (
    <div className="space-y-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
      <p className="font-medium">Worker is on a different branch</p>
      <p className="text-muted-foreground">
        This worktree is on{" "}
        <code className="rounded bg-muted px-1">{currentBranch}</code>; the session
        is locked to{" "}
        <code className="rounded bg-muted px-1">{session.workerBranch}</code>. Switch
        the worktree back to that branch to continue, or delete the session.
      </p>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        onClick={() => del.mutate()}
        disabled={del.isPending}
      >
        Delete session
      </Button>
    </div>
  );
}
