import { planDeletion } from "@server/services/deletion";
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
import { useIssuesQuery } from "../api/queries";
import { useIssueUiStore } from "../store/use-issue-ui-store";

export function DeleteIssueDialog() {
  const targetId = useIssueUiStore((s) => s.deleteTarget);
  const clearDelete = useIssueUiStore((s) => s.clearDelete);
  const deleteIssue = useDeleteIssue();
  const { data } = useIssuesQuery();

  const plan =
    targetId && data ? planDeletion(data.issues, targetId) : undefined;
  const alsoDeleted = plan ? plan.deleteIds.length - 1 : 0;

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
            its files?
          </DialogDescription>
        </DialogHeader>
        {plan && (alsoDeleted > 0 || plan.repoint.length > 0 || plan.unblock.length > 0) ? (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {alsoDeleted > 0 ? (
              <li>
                Also deletes {alsoDeleted} contained issue
                {alsoDeleted === 1 ? "" : "s"}.
              </li>
            ) : null}
            {plan.repoint.length > 0 ? (
              <li>
                Repoints {plan.repoint.length} branch
                {plan.repoint.length === 1 ? "" : "es"} to a new fork point.
              </li>
            ) : null}
            {plan.unblock.length > 0 ? (
              <li>
                Drops this from {plan.unblock.length} branch
                {plan.unblock.length === 1 ? "'s" : "es'"} blockedBy list.
              </li>
            ) : null}
          </ul>
        ) : null}
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
