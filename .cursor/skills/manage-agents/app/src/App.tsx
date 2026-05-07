import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchWorkers,
  createWorker,
  CreateWorkerError,
  startAgent,
  stopAgent,
  renameWorker,
  deleteWorker,
  fetchWorkerDetails,
  saveWorkerNote,
  type WorkerInfo,
  type WorkerDetails,
} from "./api";
import { CopyIcon, TrashIcon } from "./components/Icons";
import { CreateModal } from "./components/CreateModal";
import { DeleteModal } from "./components/DeleteModal";
import { DetailPane, type CreatePlaceholder } from "./components/DetailPane";
import { ToastContainer, useToast } from "./components/Toast";
import "./App.css";

const branchToWorkerName = (branch: string) => branch.replace(/\//g, "-");
const WORKTREES_DIR = "/root/psibase.worktrees";
const branchToWorktreePath = (branch: string) =>
  `${WORKTREES_DIR}/${branchToWorkerName(branch)}`;

function App() {
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [busyWorkers, setBusyWorkers] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorkerInfo | null>(null);
  const [createPlaceholders, setCreatePlaceholders] = useState<CreatePlaceholder[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [workerDetails, setWorkerDetails] = useState<WorkerDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [noteValue, setNoteValue] = useState("");
  const [noteSaveError, setNoteSaveError] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const noteTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  const { toasts, addToast, removeToast } = useToast();

  const refresh = useCallback(async () => {
    try {
      setWorkers(await fetchWorkers());
      setApiError(null);
    } catch {
      setApiError("Unable to reach backend");
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    pollRef.current = setInterval(refresh, 5000);
    return () => clearInterval(pollRef.current);
  }, [refresh]);

  const prevSelectedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedName) {
      setWorkerDetails(null);
      setDetailsLoading(false);
      prevSelectedRef.current = null;
      return;
    }
    const isFailedPlaceholder = createPlaceholders.some(
      (placeholder) => placeholder.id === selectedName && placeholder.phase === "failed",
    );
    if (isFailedPlaceholder) {
      setWorkerDetails(null);
      setDetailsLoading(false);
      prevSelectedRef.current = selectedName;
      return;
    }
    if (prevSelectedRef.current === selectedName) return;
    prevSelectedRef.current = selectedName;
    setDetailsLoading(true);
    fetchWorkerDetails(selectedName)
      .then((d) => {
        setWorkerDetails(d);
        setNoteValue(d.note);
      })
      .catch(() => setWorkerDetails(null))
      .finally(() => setDetailsLoading(false));
  }, [selectedName, createPlaceholders]);

  const handleNoteChange = (value: string) => {
    setNoteValue(value);
    setNoteSaveError(false);
    if (noteTimerRef.current) clearTimeout(noteTimerRef.current);
    noteTimerRef.current = setTimeout(() => {
      if (selectedName) {
        saveWorkerNote(selectedName, value).catch(() => setNoteSaveError(true));
      }
    }, 500);
  };

  const handleNoteBlur = () => {
    if (noteTimerRef.current) clearTimeout(noteTimerRef.current);
    if (selectedName) {
      saveWorkerNote(selectedName, noteValue).catch(() => setNoteSaveError(true));
    }
  };

  const markBusy = (name: string, on: boolean) =>
    setBusyWorkers((prev) => {
      const next = new Set(prev);
      on ? next.add(name) : next.delete(name);
      return next;
    });

  const handleStart = async (name: string) => {
    markBusy(name, true);
    try {
      await startAgent(name);
      await refresh();
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : String(err));
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
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : String(err));
    } finally {
      markBusy(name, false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const name = deleteTarget.name;
    setDeleteTarget(null);
    markBusy(name, true);
    try {
      const result = await deleteWorker(name);
      if (result.branchDeleteMessage) {
        addToast(result.branchDeleteMessage, "info");
      }
      if (selectedName === name) setSelectedName(null);
      await refresh();
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : String(err));
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
      if (selectedName === oldName) setSelectedName(newName);
      await refresh();
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : String(err));
    } finally {
      markBusy(oldName, false);
    }
  };

  const handleCreate = (branch: string, sourceBranch: string) => {
    const id = crypto.randomUUID();
    setCreatePlaceholders((prev) => [
      ...prev,
      { id, branch, phase: "creating" },
    ]);
    setShowCreateModal(false);

    void (async () => {
      try {
        await createWorker(branch, sourceBranch);
        setCreatePlaceholders((prev) => prev.filter((placeholder) => placeholder.id !== id));
        await refresh();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        let extra = "";
        if (err instanceof CreateWorkerError) {
          extra = [err.stderr, err.output].filter(Boolean).join("\n\n");
        }
        setCreatePlaceholders((prev) =>
          prev.map((placeholder) =>
            placeholder.id === id
              ? { ...placeholder, phase: "failed" as const, errorMessage: message, errorExtra: extra || undefined }
              : placeholder,
          ),
        );
      }
    })();
  };

  const handleRowClick = (name: string, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, input")) return;
    setSelectedName(selectedName === name ? null : name);
  };

  const handleCopy = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopied(path);
    setTimeout(() => setCopied(null), 1500);
  };

  const selectedWorker = workers.find((w) => w.name === selectedName);
  const selectedFailedCreate = createPlaceholders.find(
    (placeholder) => placeholder.id === selectedName && placeholder.phase === "failed",
  );

  const creatingRows = createPlaceholders.filter((placeholder) => placeholder.phase === "creating");
  const failedRows = createPlaceholders.filter((placeholder) => placeholder.phase === "failed");

  return (
    <div className="app">
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      <div className="header-row">
        <h1>Agent Workers</h1>
        <button className="btn-add" onClick={() => setShowCreateModal(true)}>
          + Add Worker
        </button>
      </div>

      {apiError && (
        <div className="api-error-banner">{apiError}</div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Agent Status</th>
              <th className="actions-col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {initialLoading ? (
              <tr className="empty-row">
                <td colSpan={3}>Loading...</td>
              </tr>
            ) : workers.length === 0 && createPlaceholders.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={3}>No worktrees found</td>
              </tr>
            ) : (
              <>
                {creatingRows.map((placeholder) => (
                  <tr key={placeholder.id} className="row-pending" aria-busy="true">
                    <td className="mono">
                      <span className="name-cell">
                        <span className="name-row">{branchToWorkerName(placeholder.branch)}</span>
                        <span className="name-path mono">{branchToWorktreePath(placeholder.branch)}</span>
                      </span>
                    </td>
                    <td>
                      <div className="status-cell">
                        <span className="badge badge-setting-up">Setting up</span>
                      </div>
                    </td>
                    <td className="actions-cell" />
                  </tr>
                ))}
                {failedRows.map((placeholder) => (
                  <tr
                    key={placeholder.id}
                    className={[
                      "clickable row-failed-create",
                      selectedName === placeholder.id ? "row-selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={(e) => handleRowClick(placeholder.id, e)}
                  >
                    <td className="mono">
                      <span className="name-cell">
                        <span className="name-row">{branchToWorkerName(placeholder.branch)}</span>
                        <span className="name-path mono">{branchToWorktreePath(placeholder.branch)}</span>
                      </span>
                    </td>
                    <td>
                      <div className="status-cell">
                        <span className="badge badge-setup-failed">Setup failed</span>
                      </div>
                    </td>
                    <td className="actions-cell" />
                  </tr>
                ))}
                {workers.map((w) => (
                  <tr
                    key={w.name}
                    className={[
                      busyWorkers.has(w.name) ? "row-busy" : "",
                      "clickable",
                      selectedName === w.name ? "row-selected" : "",
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
                          <button className="btn-save" onClick={() => handleRename(w.name)}>
                            Save
                          </button>
                          <button className="btn-cancel" onClick={() => setEditing(null)}>
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <span className="name-cell">
                          <span className="name-row">
                            {w.name}
                            {!w.agentRunning && !busyWorkers.has(w.name) && (
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
                          <span className="name-path mono">
                            {w.path}
                            <button
                              type="button"
                              className={`btn-copy${copied === w.path ? " btn-copy-active" : ""}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopy(w.path);
                              }}
                              title={copied === w.path ? "Copied!" : "Copy path"}
                              aria-label="Copy path"
                            >
                              <CopyIcon />
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
                            disabled={busyWorkers.has(w.name)}
                            onClick={() => handleStop(w.name)}
                            aria-label="Stop agent"
                            title="Stop agent"
                          >
                            &#9209;
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-start btn-media"
                            disabled={busyWorkers.has(w.name)}
                            onClick={() => handleStart(w.name)}
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
                        disabled={busyWorkers.has(w.name)}
                        onClick={() => setDeleteTarget(w)}
                        aria-label={`Delete worker ${w.name}`}
                        title="Delete worktree"
                      >
                        <TrashIcon />
                      </button>
                    </td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      {selectedName && (selectedFailedCreate || selectedWorker) && (
        <DetailPane
          selectedWorker={selectedWorker}
          selectedFailedCreate={selectedFailedCreate}
          workerDetails={workerDetails}
          detailsLoading={detailsLoading}
          noteValue={noteValue}
          noteSaveError={noteSaveError}
          onNoteChange={handleNoteChange}
          onNoteBlur={handleNoteBlur}
        />
      )}

      {deleteTarget && (
        <DeleteModal
          worker={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => void handleConfirmDelete()}
        />
      )}

      {showCreateModal && (
        <CreateModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreate}
        />
      )}
    </div>
  );
}

export default App;
