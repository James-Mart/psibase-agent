import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDeleteWorker } from "../api/mutations";
import { useWorkerUiStore } from "../store/use-worker-ui-store";

export function WorkerDeleteDialog() {
  const target = useWorkerUiStore((s) => s.deleteTarget);
  const setDeleteTarget = useWorkerUiStore((s) => s.setDeleteTarget);
  const selectWorker = useWorkerUiStore((s) => s.selectWorker);
  const selectedName = useWorkerUiStore((s) => s.selectedName);
  const del = useDeleteWorker();

  const close = () => setDeleteTarget(null);

  const onConfirm = () => {
    if (!target) return;
    const name = target.name;
    setDeleteTarget(null);
    del.mutate(name, {
      onSuccess: () => {
        if (selectedName === name) selectWorker(null);
      },
    });
  };

  return (
    <Dialog
      open={!!target}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete worker?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p>
            This will permanently remove{" "}
            <strong className="font-mono">{target?.name}</strong> and its
            worktree.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Stop the agent if it is running</li>
            <li>
              Delete the{" "}
              <code className="font-mono text-foreground">{target?.branch}</code>{" "}
              branch
            </li>
          </ul>
          <p className="text-xs text-muted-foreground">
            Uncommitted changes in the worktree will be lost.
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
