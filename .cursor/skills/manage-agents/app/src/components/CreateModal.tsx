import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { DEFAULT_SOURCE_BRANCH } from "../api";

interface CreateModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (branch: string, sourceBranch: string) => void;
}

export function CreateModal({ open, onClose, onSubmit }: CreateModalProps) {
  const [branch, setBranch] = useState("");
  const [sourceBranch, setSourceBranch] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = branch.trim();
    if (!trimmed) return;
    onSubmit(trimmed, sourceBranch);
    setBranch("");
    setSourceBranch("");
  };

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal">
          <div className="modal-header">
            <Dialog.Title asChild>
              <h2>Create Worker</h2>
            </Dialog.Title>
            <Dialog.Close className="btn-close" aria-label="Close">
              &times;
            </Dialog.Close>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              <div className="field">
                <label htmlFor="branch">Branch name</label>
                <input
                  id="branch"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="my-feature-branch"
                  required
                  autoFocus
                />
              </div>
              <div className="field">
                <label htmlFor="source">Source branch (optional)</label>
                <input
                  id="source"
                  value={sourceBranch}
                  onChange={(e) => setSourceBranch(e.target.value)}
                  placeholder={DEFAULT_SOURCE_BRANCH}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="submit" className="btn-create">
                Create
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
