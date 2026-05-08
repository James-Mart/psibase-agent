import { create } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";
import type { WorkerInfo } from "@/lib/api/types";
import type { CreatePlaceholder } from "../types";

interface UiState {
  selectedName: string | null;
  editingName: string | null;
  editValue: string;
  showCreateDialog: boolean;
  deleteTarget: WorkerInfo | null;
  busyWorkers: Set<string>;
  createPlaceholders: CreatePlaceholder[];

  selectWorker: (name: string | null) => void;

  startEditing: (name: string) => void;
  setEditValue: (value: string) => void;
  cancelEditing: () => void;

  openCreateDialog: () => void;
  closeCreateDialog: () => void;

  setDeleteTarget: (worker: WorkerInfo | null) => void;

  markBusy: (name: string, busy: boolean) => void;

  addPlaceholder: (placeholder: CreatePlaceholder) => void;
  failPlaceholder: (
    id: string,
    err: { message: string; extra?: string },
  ) => void;
  removePlaceholder: (id: string) => void;

  /** Used by the rename mutation to keep selection on the new name. */
  renameSelected: (oldName: string, newName: string) => void;
}

export const useWorkerUiStore = create<UiState>()(
  subscribeWithSelector(
    persist(
      (set) => ({
        selectedName: null,
        editingName: null,
        editValue: "",
        showCreateDialog: false,
        deleteTarget: null,
        busyWorkers: new Set<string>(),
        createPlaceholders: [],

        selectWorker: (name) => set({ selectedName: name }),

        startEditing: (name) => set({ editingName: name, editValue: name }),
        setEditValue: (value) => set({ editValue: value }),
        cancelEditing: () => set({ editingName: null, editValue: "" }),

        openCreateDialog: () => set({ showCreateDialog: true }),
        closeCreateDialog: () => set({ showCreateDialog: false }),

        setDeleteTarget: (worker) => set({ deleteTarget: worker }),

        markBusy: (name, busy) =>
          set((s) => {
            const next = new Set(s.busyWorkers);
            if (busy) next.add(name);
            else next.delete(name);
            return { busyWorkers: next };
          }),

        addPlaceholder: (placeholder) =>
          set((s) => ({
            createPlaceholders: [...s.createPlaceholders, placeholder],
          })),

        failPlaceholder: (id, err) =>
          set((s) => ({
            createPlaceholders: s.createPlaceholders.map((p) =>
              p.id === id
                ? {
                    ...p,
                    phase: "failed",
                    errorMessage: err.message,
                    errorExtra: err.extra,
                  }
                : p,
            ),
          })),

        removePlaceholder: (id) =>
          set((s) => ({
            createPlaceholders: s.createPlaceholders.filter((p) => p.id !== id),
            selectedName: s.selectedName === id ? null : s.selectedName,
          })),

        renameSelected: (oldName, newName) =>
          set((s) =>
            s.selectedName === oldName ? { selectedName: newName } : {},
          ),
      }),
      {
        name: "manage-agents:worker-ui",
        partialize: (state) => ({ selectedName: state.selectedName }),
      },
    ),
  ),
);
