import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PrInfo, WorkerInfo } from "@/lib/api/types";
import { useWorkerUiStore } from "../store/use-worker-ui-store";
import { WorkerCopyPathButton } from "./worker-copy-path-button";
import { WorkerPrLink } from "./worker-pr-link";
import { WorkerRenameInput } from "./worker-rename-input";

interface Props {
  worker: WorkerInfo;
  busy: boolean;
  pr: PrInfo | null;
}

export function WorkerDetailHeader({ worker, busy, pr }: Props) {
  const editingName = useWorkerUiStore((s) => s.editingName);
  const startEditing = useWorkerUiStore((s) => s.startEditing);
  const editing = editingName === worker.name;
  const canRename = !worker.isMain && !worker.agentRunning && !busy;

  return (
    <header className="space-y-1">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        {editing ? (
          <WorkerRenameInput name={worker.name} />
        ) : (
          <>
            <span className="font-mono">{worker.branch}</span>
            {canRename && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                title="Rename"
                aria-label="Rename worker"
                onClick={() => startEditing(worker.name)}
              >
                <Pencil />
              </Button>
            )}
            <WorkerPrLink pr={pr} />
          </>
        )}
      </h2>
      <div className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
        <span className="truncate">{worker.path}</span>
        <WorkerCopyPathButton path={worker.path} />
      </div>
    </header>
  );
}
