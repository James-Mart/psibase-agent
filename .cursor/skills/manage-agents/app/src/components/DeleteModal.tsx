import type { WorkerInfo } from "../api";

interface DeleteModalProps {
  worker: WorkerInfo;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteModal({ worker, onClose, onConfirm }: DeleteModalProps) {
  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal modal-confirm-delete">
        <div className="modal-header">
          <h2>Delete worker?</h2>
          <button
            type="button"
            className="btn-close"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <div className="modal-body">
          <p className="delete-confirm-lead">
            This will permanently remove{" "}
            <strong className="mono">{worker.name}</strong> and its worktree.
          </p>
          <ul className="delete-confirm-steps">
            <li>Stop the agent if it is running</li>
            <li>
              Delete the <code className="mono">{worker.branch}</code> branch
            </li>
          </ul>
          <p className="text-muted delete-confirm-warning">
            Uncommitted changes in the worktree will be lost.
          </p>
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="btn-cancel-modal"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={onConfirm}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
