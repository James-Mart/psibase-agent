import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createWorker,
  deleteWorker,
  renameWorker,
  saveWorkerNote,
  saveWorkerStatus,
  startAgent,
  stopAgent,
} from "@/lib/api/workers";
import type {
  CreateWorkerResult,
  DeleteWorkerResult,
  WorkerDetails,
  WorkerInfo,
  WorkerStatus,
} from "@/lib/api/types";
import { useWorkerUiStore } from "../store/use-worker-ui-store";
import { workersKeys } from "./keys";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const messageOf = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

export function useStartAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => startAgent(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: workersKeys.list() }),
    onError: (err) => toast.error(messageOf(err)),
  });
}

export function useStopAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      await stopAgent(name);
      await sleep(500);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workersKeys.list() }),
    onError: (err) => toast.error(messageOf(err)),
  });
}

interface DeleteContext {
  previous?: WorkerInfo[];
}

export function useDeleteWorker() {
  const qc = useQueryClient();
  return useMutation<DeleteWorkerResult, Error, string, DeleteContext>({
    mutationFn: (name) => deleteWorker(name),
    onMutate: async (name) => {
      await qc.cancelQueries({ queryKey: workersKeys.list() });
      const previous = qc.getQueryData<WorkerInfo[]>(workersKeys.list());
      if (previous) {
        qc.setQueryData<WorkerInfo[]>(
          workersKeys.list(),
          previous.filter((w) => w.name !== name),
        );
      }
      return { previous };
    },
    onSuccess: (result, name) => {
      const { selectedName, selectWorker } = useWorkerUiStore.getState();
      if (selectedName === name) selectWorker(null);
      if (result.branchDeleteMessage) toast.info(result.branchDeleteMessage);
    },
    onError: (err, _name, ctx) => {
      if (ctx?.previous) qc.setQueryData(workersKeys.list(), ctx.previous);
      toast.error(messageOf(err));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: workersKeys.all }),
  });
}

export function useRenameWorker() {
  const qc = useQueryClient();
  return useMutation<
    { ok: true; newName: string },
    Error,
    { name: string; newName: string }
  >({
    mutationFn: ({ name, newName }) => renameWorker(name, newName),
    onSuccess: () => qc.invalidateQueries({ queryKey: workersKeys.all }),
    onError: (err) => toast.error(messageOf(err)),
  });
}

export function useSaveWorkerNote() {
  const qc = useQueryClient();
  return useMutation<void, Error, { name: string; note: string }>({
    mutationFn: ({ name, note }) => saveWorkerNote(name, note),
    onMutate: ({ name, note }) => {
      const key = workersKeys.details(name);
      const prev = qc.getQueryData<WorkerDetails>(key);
      if (prev) qc.setQueryData<WorkerDetails>(key, { ...prev, note });
    },
  });
}

interface StatusContext {
  previous?: WorkerInfo[];
}

export function useSaveWorkerStatus() {
  const qc = useQueryClient();
  return useMutation<
    void,
    Error,
    { name: string; status: WorkerStatus },
    StatusContext
  >({
    mutationFn: ({ name, status }) => saveWorkerStatus(name, status),
    onMutate: async ({ name, status }) => {
      await qc.cancelQueries({ queryKey: workersKeys.list() });
      const previous = qc.getQueryData<WorkerInfo[]>(workersKeys.list());
      if (previous) {
        qc.setQueryData<WorkerInfo[]>(
          workersKeys.list(),
          previous.map((w) => (w.name === name ? { ...w, status } : w)),
        );
      }
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(workersKeys.list(), ctx.previous);
      toast.error(messageOf(err));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: workersKeys.list() }),
  });
}

export interface CreateWorkerVars {
  branch: string;
  sourceBranch?: string;
  existingBranch?: boolean;
  remoteOnly?: boolean;
}

export function useCreateWorker() {
  const qc = useQueryClient();
  return useMutation<CreateWorkerResult, Error, CreateWorkerVars>({
    mutationFn: ({ branch, sourceBranch, existingBranch, remoteOnly }) =>
      createWorker(branch, { sourceBranch, existingBranch, remoteOnly }),
    onSuccess: () => qc.invalidateQueries({ queryKey: workersKeys.list() }),
  });
}
