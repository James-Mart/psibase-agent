import { useState } from "react";
import { DEFAULT_SOURCE_BRANCH } from "../api";

interface CreateModalProps {
  onClose: () => void;
  onSubmit: (branch: string, sourceBranch: string) => void;
}

export function CreateModal({ onClose, onSubmit }: CreateModalProps) {
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
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <div className="modal-header">
          <h2>Create Worker</h2>
          <button className="btn-close" onClick={onClose}>
            &times;
          </button>
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
      </div>
    </div>
  );
}
