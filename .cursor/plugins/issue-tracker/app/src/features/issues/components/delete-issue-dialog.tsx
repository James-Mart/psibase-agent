import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDeleteIssue } from "../api/mutations";
import { useIssueUiStore } from "../store/use-issue-ui-store";

export function DeleteIssueDialog() {
  const targetId = useIssueUiStore((s) => s.deleteTarget);
  const clearDelete = useIssueUiStore((s) => s.clearDelete);
  const deleteIssue = useDeleteIssue();

  const confirm = () => {
    if (!targetId) return;
    deleteIssue.mutate(targetId, { onSuccess: () => clearDelete() });
  };

  return (
    <Dialog
      open={Boolean(targetId)}
      onOpenChange={(open) => !open && clearDelete()}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete issue</DialogTitle>
          <DialogDescription>
            Permanently delete <span className="font-mono">{targetId}</span> and
            its files? Any child issues will be left dangling.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => clearDelete()}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={confirm}
            disabled={deleteIssue.isPending}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
