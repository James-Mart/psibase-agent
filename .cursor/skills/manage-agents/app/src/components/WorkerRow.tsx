import { Check, Copy, GitPullRequest, Trash2 } from "lucide-react";
import type { WorkerInfo, WorkerStatus } from "../api";

interface WorkerRowProps {
  worker: WorkerInfo;
  busy: boolean;
  selected: boolean;
  editing: boolean;
  editValue: string;
  copied: boolean;
  onRowClick: (name: string, e: React.MouseEvent) => void;
  onStatusChange: (name: string, status: WorkerStatus) => void;
  onStart: (name: string) => void;
  onStop: (name: string) => void;
  onDelete: (worker: WorkerInfo) => void;
  onEditStart: (name: string) => void;
  onEditChange: (value: string) => void;
  onEditSave: (name: string) => void;
  onEditCancel: () => void;
  onCopy: (path: string) => void;
}

export function WorkerRow({
  worker: w,
  busy,
  selected,
  editing,
  editValue,
  copied,
  onRowClick,
  onStatusChange,
  onStart,
  onStop,
  onDelete,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  onCopy,
}: WorkerRowProps) {
  return (
    <tr
      className={[busy ? "row-busy" : "", "clickable", selected ? "row-selected" : ""]
        .filter(Boolean)
        .join(" ")}
      onClick={(e) => onRowClick(w.name, e)}
    >
      <td className="worker-status-cell">
        <select
          className={`status-select status-select-${w.status}`}
          value={w.status}
          onChange={(e) => onStatusChange(w.name, e.target.value as WorkerStatus)}
          onClick={(e) => e.stopPropagation()}
        >
          <option value="active">Active</option>
          <option value="blocked">Blocked</option>
          <option value="inactive">Inactive</option>
        </select>
      </td>
      <td className="pr-cell">
        {w.pr && (
          <a
            href={w.pr.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`pr-icon pr-${w.pr.state}`}
            title={`PR ${w.pr.state}`}
            onClick={(e) => e.stopPropagation()}
          >
            <GitPullRequest size={16} />
          </a>
        )}
      </td>
      <td className="mono">
        {editing ? (
          <span className="rename-inline">
            <input
              className="rename-input"
              value={editValue}
              onChange={(e) => onEditChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onEditSave(w.name);
                if (e.key === "Escape") onEditCancel();
              }}
              autoFocus
            />
            <button className="btn-save" onClick={() => onEditSave(w.name)}>
              Save
            </button>
            <button className="btn-cancel" onClick={() => onEditCancel()}>
              Cancel
            </button>
          </span>
        ) : (
          <span className="name-cell">
            <span className="name-row">
              {w.name}
              {!w.agentRunning && !busy && (
                <button
                  className="btn-edit"
                  onClick={() => onEditStart(w.name)}
                  title="Rename"
                >
                  &#9998;
                </button>
              )}
            </span>
            <span className="name-path mono">
              {w.path}
              <button
                type="button"
                className="btn-copy"
                onClick={(e) => {
                  e.stopPropagation();
                  onCopy(w.path);
                }}
                title={copied ? "Copied!" : "Copy path"}
                aria-label="Copy path"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </span>
          </span>
        )}
      </td>
      <td>
        <div className="status-cell">
          {w.agentRunning ? (
            <span className="badge badge-running">Running</span>
          ) : (
            <span className="badge badge-stopped">Stopped</span>
          )}
          {w.agentRunning ? (
            <button
              type="button"
              className="btn-stop btn-media"
              disabled={busy}
              onClick={() => onStop(w.name)}
              aria-label="Stop agent"
              title="Stop agent"
            >
              &#9209;
            </button>
          ) : (
            <button
              type="button"
              className="btn-start btn-media"
              disabled={busy}
              onClick={() => onStart(w.name)}
              aria-label="Start agent"
              title="Start agent"
            >
              &#9654;
            </button>
          )}
        </div>
      </td>
      <td className="actions-cell">
        <button
          type="button"
          className="btn-delete-wt btn-media"
          disabled={busy}
          onClick={() => onDelete(w)}
          aria-label={`Delete worker ${w.name}`}
          title="Delete worktree"
        >
          <Trash2 size={18} />
        </button>
      </td>
    </tr>
  );
}
