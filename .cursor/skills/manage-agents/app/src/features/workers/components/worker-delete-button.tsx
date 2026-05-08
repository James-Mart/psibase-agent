import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkerInfo } from "@/lib/api/types";
import { useWorkerUiStore } from "../store/use-worker-ui-store";

interface Props {
  worker: WorkerInfo;
  busy: boolean;
}

export function WorkerDeleteButton({ worker, busy }: Props) {
  const setDeleteTarget = useWorkerUiStore((s) => s.setDeleteTarget);
  if (worker.isMain) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      disabled={busy}
      aria-label={`Delete worker ${worker.name}`}
      title="Delete worktree"
      onClick={(e) => {
        e.stopPropagation();
        setDeleteTarget(worker);
      }}
    >
      <Trash2 />
    </Button>
  );
}
