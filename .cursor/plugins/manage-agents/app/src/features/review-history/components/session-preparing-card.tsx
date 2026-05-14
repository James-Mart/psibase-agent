import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDeleteSession } from "../api/mutations";
import type { RhsSession } from "../types";

interface Props {
  workerName: string;
  session: RhsSession;
}

export function SessionPreparingCard({ workerName, session }: Props) {
  const del = useDeleteSession(workerName);
  const isPreparing = session.prepStatus === "preparing";
  return (
    <div className="space-y-2 rounded-md border bg-card p-3 text-xs">
      <div className="flex items-center gap-2">
        {isPreparing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        <p className="font-medium">
          {isPreparing ? "Preparing synthesis worktree..." : "Preparation failed"}
        </p>
      </div>
      <p className="text-muted-foreground">
        Synthesis worktree: <code className="break-all">{session.synthesisWorktree}</code>
      </p>
      {session.prepStatus === "failed" && session.prepError && (
        <pre className="max-h-40 overflow-auto rounded bg-destructive/10 p-2 text-destructive">
          {session.prepError}
        </pre>
      )}
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
