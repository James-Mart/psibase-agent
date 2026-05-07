import { FileTree } from "./FileTree";
import type { WorkerInfo, WorkerDetails } from "../api";

interface CreatePlaceholder {
  id: string;
  branch: string;
  phase: "creating" | "failed";
  errorMessage?: string;
  errorExtra?: string;
}

interface DetailPaneProps {
  selectedWorker: WorkerInfo | undefined;
  selectedFailedCreate: CreatePlaceholder | undefined;
  workerDetails: WorkerDetails | null;
  detailsLoading: boolean;
  noteValue: string;
  noteSaveError: boolean;
  onNoteChange: (value: string) => void;
  onNoteBlur: () => void;
}

export function DetailPane({
  selectedWorker,
  selectedFailedCreate,
  workerDetails,
  detailsLoading,
  noteValue,
  noteSaveError,
  onNoteChange,
  onNoteBlur,
}: DetailPaneProps) {
  if (selectedFailedCreate) {
    return (
      <div className="detail-pane">
        <div className="detail-header">
          <h2>Create worker failed</h2>
          <span className="detail-branch mono">
            {selectedFailedCreate.branch}
          </span>
        </div>

        <div className="detail-section">
          <h3>Error</h3>
          <p className="create-error-message">
            {selectedFailedCreate.errorMessage ?? "Unknown error"}
          </p>
        </div>

        {selectedFailedCreate.errorExtra ? (
          <div className="detail-section">
            <h3>Output</h3>
            <pre className="create-error-output mono">
              {selectedFailedCreate.errorExtra}
            </pre>
          </div>
        ) : null}
      </div>
    );
  }

  if (!selectedWorker) return null;

  return (
    <div className="detail-pane">
      <div className="detail-header">
        <h2>{selectedWorker.name}</h2>
        <span className="detail-branch mono">{selectedWorker.branch}</span>
      </div>

      <div className="detail-section">
        <h3>Git Status</h3>
        {detailsLoading ? (
          <p className="text-muted">Loading...</p>
        ) : workerDetails && workerDetails.unstagedFiles.length > 0 ? (
          <FileTree files={workerDetails.unstagedFiles} />
        ) : (
          <p className="text-muted">Clean working tree</p>
        )}
      </div>

      <div className="detail-section">
        <h3>Note</h3>
        <textarea
          className={`note-area${noteSaveError ? " note-area-error" : ""}`}
          value={noteValue}
          onChange={(e) => onNoteChange(e.target.value)}
          onBlur={onNoteBlur}
          placeholder="What are you working on in this worktree?"
          rows={4}
        />
        {noteSaveError && (
          <span className="note-save-error">Save failed</span>
        )}
      </div>
    </div>
  );
}

export type { CreatePlaceholder };
