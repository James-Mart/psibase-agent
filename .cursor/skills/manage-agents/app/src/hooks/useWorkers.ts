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
  saveWorkerStatus,
  type WorkerInfo,
  type WorkerDetails,
  type WorkerStatus,
} from "../api";
import type { CreatePlaceholder } from "../components/DetailPane";
import { toast } from "sonner";

const branchToWorkerName = (branch: string) => branch.replace(/\//g, "-");

export { branchToWorkerName };

const WORKTREES_DIR = "/root/psibase.worktrees";

export const branchToWorktreePath = (branch: string) =>
  `${WORKTREES_DIR}/${branchToWorkerName(branch)}`;

export function useWorkers() {
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
  const pendingStatusRef = useRef<Map<string, WorkerStatus>>(new Map());

  const refresh = useCallback(async () => {
    try {
      const fetched = await fetchWorkers();
      const pending = pendingStatusRef.current;
      if (pending.size > 0) {
        for (const [name, status] of pending) {
          const match = fetched.find((w) => w.name === name);
          if (match && match.status === status) pending.delete(name);
        }
      }
      setWorkers(
        pending.size === 0
          ? fetched
          : fetched.map((w) => {
              const override = pending.get(w.name);
              return override !== undefined ? { ...w, status: override } : w;
            }),
      );
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
    setWorkerDetails(null);
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
      toast.error(err instanceof Error ? err.message : String(err));
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
      toast.error(err instanceof Error ? err.message : String(err));
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
        toast.info(result.branchDeleteMessage);
      }
      if (selectedName === name) setSelectedName(null);
      await refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
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
      toast.error(err instanceof Error ? err.message : String(err));
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
    if ((e.target as HTMLElement).closest("button, input, select")) return;
    setSelectedName(selectedName === name ? null : name);
  };

  const handleStatusChange = (name: string, status: WorkerStatus) => {
    pendingStatusRef.current.set(name, status);
    setWorkers((prev) =>
      prev.map((w) => (w.name === name ? { ...w, status } : w)),
    );
    saveWorkerStatus(name, status).catch((err: unknown) => {
      pendingStatusRef.current.delete(name);
      toast.error(err instanceof Error ? err.message : String(err));
      refresh();
    });
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

  return {
    workers,
    initialLoading,
    apiError,
    busyWorkers,
    editing,
    editValue,
    setEditing,
    setEditValue,
    showCreateModal,
    setShowCreateModal,
    deleteTarget,
    setDeleteTarget,
    createPlaceholders,
    selectedName,
    selectedWorker,
    selectedFailedCreate,
    workerDetails,
    detailsLoading,
    noteValue,
    noteSaveError,
    copied,
    handleStart,
    handleStop,
    handleConfirmDelete,
    handleRename,
    handleCreate,
    handleRowClick,
    handleStatusChange,
    handleCopy,
    handleNoteChange,
    handleNoteBlur,
  };
}
