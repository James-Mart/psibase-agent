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
  WorkerInfo,
  WorkerStatus,
} from "@/lib/api/types";
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

export function useDeleteWorker() {
  const qc = useQueryClient();
  return useMutation<DeleteWorkerResult, Error, string>({
    mutationFn: (name) => deleteWorker(name),
    onSuccess: (result) => {
      if (result.branchDeleteMessage) toast.info(result.branchDeleteMessage);
      qc.invalidateQueries({ queryKey: workersKeys.all });
    },
    onError: (err) => toast.error(messageOf(err)),
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
    onSuccess: (_data, { name }) =>
      qc.invalidateQueries({ queryKey: workersKeys.details(name) }),
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

export function useCreateWorker() {
  const qc = useQueryClient();
  return useMutation<
    CreateWorkerResult,
    Error,
    { branch: string; sourceBranch: string }
  >({
    mutationFn: ({ branch, sourceBranch }) =>
      createWorker(branch, sourceBranch),
    onSuccess: () => qc.invalidateQueries({ queryKey: workersKeys.list() }),
  });
}
