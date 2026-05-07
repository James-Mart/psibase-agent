import * as Dialog from "@radix-ui/react-dialog";
import type { WorkerInfo } from "../api";

interface DeleteModalProps {
  worker: WorkerInfo | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteModal({ worker, onClose, onConfirm }: DeleteModalProps) {
  return (
    <Dialog.Root open={!!worker} onOpenChange={(v) => { if (!v) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal modal-confirm-delete">
          <div className="modal-header">
            <Dialog.Title asChild>
              <h2>Delete worker?</h2>
            </Dialog.Title>
            <Dialog.Close className="btn-close" aria-label="Close">
              &times;
            </Dialog.Close>
          </div>
          <div className="modal-body">
            <p className="delete-confirm-lead">
              This will permanently remove{" "}
              <strong className="mono">{worker?.name}</strong> and its worktree.
            </p>
            <ul className="delete-confirm-steps">
              <li>Stop the agent if it is running</li>
              <li>
                Delete the <code className="mono">{worker?.branch}</code> branch
              </li>
            </ul>
            <p className="text-muted delete-confirm-warning">
              Uncommitted changes in the worktree will be lost.
            </p>
          </div>
          <div className="modal-footer">
            <Dialog.Close asChild>
              <button type="button" className="btn-cancel-modal">
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              className="btn-danger"
              onClick={onConfirm}
            >
              Delete
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
