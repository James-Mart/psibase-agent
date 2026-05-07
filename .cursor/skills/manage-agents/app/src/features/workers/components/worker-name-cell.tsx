import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkerInfo } from "@/lib/api/types";
import { useWorkerUiStore } from "../store/use-worker-ui-store";
import { WorkerCopyPathButton } from "./worker-copy-path-button";
import { WorkerRenameInput } from "./worker-rename-input";

interface Props {
  worker: WorkerInfo;
  busy: boolean;
}

export function WorkerNameCell({ worker, busy }: Props) {
  const editingName = useWorkerUiStore((s) => s.editingName);
  const startEditing = useWorkerUiStore((s) => s.startEditing);

  if (editingName === worker.name) {
    return <WorkerRenameInput name={worker.name} />;
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-sm">{worker.name}</span>
        {!worker.agentRunning && !busy && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="Rename"
            aria-label="Rename worker"
            onClick={(e) => {
              e.stopPropagation();
              startEditing(worker.name);
            }}
          >
            <Pencil />
          </Button>
        )}
      </div>
      <div className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
        <span className="truncate">{worker.path}</span>
        <WorkerCopyPathButton path={worker.path} />
      </div>
    </div>
  );
}
