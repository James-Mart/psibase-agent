import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchWorkers,
  createWorker,
  startAgent,
  stopAgent,
  renameWorker,
  fetchWorkerDetails,
  saveWorkerNote,
  type WorkerInfo,
  type WorkerDetails,
  type FileEntry,
} from "./api";
import "./App.css";

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  isFile: boolean;
  status?: string;
}

function statusLabel(status: string): { letter: string; className: string } {
  switch (status) {
    case "M": return { letter: "M", className: "status-modified" };
    case "A": return { letter: "A", className: "status-added" };
    case "D": return { letter: "D", className: "status-deleted" };
    case "R": return { letter: "R", className: "status-renamed" };
    case "??": return { letter: "U", className: "status-untracked" };
    default: return { letter: status.charAt(0) || "?", className: "status-untracked" };
  }
}

function buildTree(files: FileEntry[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", children: [], isFile: false };
  for (const { path: p, status } of files) {
    const parts = p.split("/").filter(Boolean);
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      let child = current.children.find((c) => c.name === part && c.isFile === isFile);
      if (!child) {
        child = { name: part, path: parts.slice(0, i + 1).join("/"), children: [], isFile, status: isFile ? status : undefined };
        current.children.push(child);
      }
      current = child;
    }
  }
  root.children.sort((a, b) => {
    if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
  return root.children;
}

function FileTreeNode({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [open, setOpen] = useState(!node.isFile);
  if (node.isFile) {
    const s = statusLabel(node.status ?? "??");
    return (
      <div className="tree-leaf mono" style={{ paddingLeft: depth * 16 + 12 }}>
        <span className={`tree-status ${s.className}`}>{s.letter}</span>
        {node.name}
      </div>
    );
  }
  return (
    <div>
      <div
        className="tree-dir mono"
        style={{ paddingLeft: depth * 16 + 12 }}
        onClick={() => setOpen(!open)}
      >
        <span className="tree-arrow">{open ? "\u25BE" : "\u25B8"}</span>
        {node.name}/
      </div>
      {open && node.children
        .sort((a, b) => {
          if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
          return a.name.localeCompare(b.name);
        })
        .map((child) => (
          <FileTreeNode key={child.path} node={child} depth={depth + 1} />
        ))}
    </div>
  );
}

function FileTree({ files }: { files: FileEntry[] }) {
  const tree = buildTree(files);
  return (
    <div className="file-tree">
      {tree.map((node) => (
        <FileTreeNode key={node.path} node={node} />
      ))}
    </div>
  );
}

function App() {
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [branch, setBranch] = useState("");
  const [sourceBranch, setSourceBranch] = useState("");
  const [formStatus, setFormStatus] = useState<{
    type: "loading" | "error" | "success";
    message: string;
  } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [details, setDetails] = useState<WorkerDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [noteValue, setNoteValue] = useState("");
  const noteTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  const refresh = useCallback(async () => {
    try {
      setWorkers(await fetchWorkers());
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    refresh();
    pollRef.current = setInterval(refresh, 5000);
    return () => clearInterval(pollRef.current);
  }, [refresh]);

  const loadDetails = useCallback(async (name: string) => {
    setDetailsLoading(true);
    try {
      const d = await fetchWorkerDetails(name);
      setDetails(d);
      setNoteValue(d.note);
    } catch {
      setDetails(null);
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected) loadDetails(selected);
    else setDetails(null);
  }, [selected, loadDetails]);

  const handleNoteChange = (name: string, value: string) => {
    setNoteValue(value);
    if (noteTimerRef.current) clearTimeout(noteTimerRef.current);
    noteTimerRef.current = setTimeout(() => {
      saveWorkerNote(name, value).catch(() => {});
    }, 500);
  };

  const handleNoteBlur = (name: string) => {
    if (noteTimerRef.current) clearTimeout(noteTimerRef.current);
    saveWorkerNote(name, noteValue).catch(() => {});
  };

  const markBusy = (name: string, on: boolean) =>
    setBusy((prev) => {
      const next = new Set(prev);
      on ? next.add(name) : next.delete(name);
      return next;
    });

  const handleStart = async (name: string) => {
    markBusy(name, true);
    try {
      await startAgent(name);
      await refresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      markBusy(name, false);
    }
  };

  const handleStop = async (name: string) => {
    markBusy(name, true);
    try {
      await stopAgent(name);
      await new Promise((r) => setTimeout(r, 500));
      await refresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      markBusy(name, false);
    }
  };

  const handleRename = async (oldName: string) => {
    const newName = editValue.trim();
    if (!newName || newName === oldName) {
      setEditing(null);
      return;
    }
    markBusy(oldName, true);
    setEditing(null);
    try {
      await renameWorker(oldName, newName);
      if (selected === oldName) setSelected(newName);
      await refresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      markBusy(oldName, false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branch.trim()) return;

    setFormStatus({ type: "loading", message: "Creating worktree..." });
    try {
      const result = await createWorker(branch.trim(), sourceBranch.trim());
      setFormStatus({
        type: "success",
        message: `Created ${result.worktreeName} on branch ${result.branch}`,
      });
      setBranch("");
      setSourceBranch("");
      await refresh();
    } catch (err: any) {
      setFormStatus({ type: "error", message: err.message });
    }
  };

  const handleRowClick = (name: string, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, input")) return;
    setSelected(selected === name ? null : name);
  };

  const selectedWorker = workers.find((w) => w.name === selected);

  return (
    <div className="app">
      <div className="header-row">
        <h1>Agent Workers</h1>
        <button className="btn-add" onClick={() => setShowCreateModal(true)}>
          + Add Worker
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Branch</th>
              <th>Agent Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {workers.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={4}>No worktrees found</td>
              </tr>
            ) : (
              workers.map((w) => (
                <tr
                  key={w.name}
                  className={[
                    busy.has(w.name) ? "row-busy" : "",
                    "clickable",
                    selected === w.name ? "row-selected" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={(e) => handleRowClick(w.name, e)}
                >
                  <td className="mono">
                    {editing === w.name ? (
                      <span className="rename-inline">
                        <input
                          className="rename-input"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRename(w.name);
                            if (e.key === "Escape") setEditing(null);
                          }}
                          autoFocus
                        />
                        <button
                          className="btn-save"
                          onClick={() => handleRename(w.name)}
                        >
                          Save
                        </button>
                        <button
                          className="btn-cancel"
                          onClick={() => setEditing(null)}
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <span className="name-cell">
                        {w.name}
                        {!w.agentRunning && !busy.has(w.name) && (
                          <button
                            className="btn-edit"
                            onClick={() => {
                              setEditing(w.name);
                              setEditValue(w.name);
                            }}
                            title="Rename"
                          >
                            &#9998;
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="mono">{w.branch}</td>
                  <td>
                    {w.agentRunning ? (
                      <span className="badge badge-running">
                        Running (PID {w.agentPid})
                      </span>
                    ) : (
                      <span className="badge badge-stopped">Stopped</span>
                    )}
                  </td>
                  <td>
                    {w.agentRunning ? (
                      <button
                        className="btn-stop"
                        disabled={busy.has(w.name)}
                        onClick={() => handleStop(w.name)}
                      >
                        Stop
                      </button>
                    ) : (
                      <button
                        className="btn-start"
                        disabled={busy.has(w.name)}
                        onClick={() => handleStart(w.name)}
                      >
                        Start
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected && selectedWorker && (
        <div className="detail-pane">
          <div className="detail-header">
            <h2>{selectedWorker.name}</h2>
            <span className="detail-branch mono">{selectedWorker.branch}</span>
          </div>

          <div className="detail-section">
            <h3>Git Status</h3>
            {detailsLoading ? (
              <p className="text-muted">Loading...</p>
            ) : details && details.unstagedFiles.length > 0 ? (
              <FileTree files={details.unstagedFiles} />
            ) : (
              <p className="text-muted">Clean working tree</p>
            )}
          </div>

          <div className="detail-section">
            <h3>Note</h3>
            <textarea
              className="note-area"
              value={noteValue}
              onChange={(e) => handleNoteChange(selected, e.target.value)}
              onBlur={() => handleNoteBlur(selected)}
              placeholder="What are you working on in this worktree?"
              rows={4}
            />
          </div>
        </div>
      )}

      {showCreateModal && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreateModal(false);
          }}
        >
          <div className="modal">
            <div className="modal-header">
              <h2>Create Worker</h2>
              <button
                className="btn-close"
                onClick={() => setShowCreateModal(false)}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleCreate}>
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
                  <label htmlFor="source">Source branch</label>
                  <input
                    id="source"
                    value={sourceBranch}
                    onChange={(e) => setSourceBranch(e.target.value)}
                    placeholder="origin/main"
                  />
                </div>
              </div>
              <div className="modal-footer">
                {formStatus && (
                  <div className={`form-status ${formStatus.type}`}>
                    {formStatus.message}
                  </div>
                )}
                <button
                  type="submit"
                  className="btn-create"
                  disabled={formStatus?.type === "loading"}
                >
                  {formStatus?.type === "loading" ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
