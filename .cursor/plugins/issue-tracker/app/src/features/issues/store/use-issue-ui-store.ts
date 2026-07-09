import { create } from "zustand";
import type { IssueKind } from "@server/schemas";

interface NewIssueTarget {
  presetKind?: IssueKind;
  presetParent?: string;
}

interface IssueUiState {
  search: string;
  setSearch: (value: string) => void;
  expanded: Record<string, boolean>;
  toggle: (id: string) => void;
  newIssue: NewIssueTarget | null;
  openNew: (target?: NewIssueTarget) => void;
  closeNew: () => void;
  deleteTarget: string | null;
  requestDelete: (id: string) => void;
  clearDelete: () => void;
}

export const useIssueUiStore = create<IssueUiState>((set) => ({
  search: "",
  setSearch: (value) => set({ search: value }),
  expanded: {},
  toggle: (id) =>
    set((state) => ({
      expanded: { ...state.expanded, [id]: !(state.expanded[id] ?? true) },
    })),
  newIssue: null,
  openNew: (target) => set({ newIssue: target ?? {} }),
  closeNew: () => set({ newIssue: null }),
  deleteTarget: null,
  requestDelete: (id) => set({ deleteTarget: id }),
  clearDelete: () => set({ deleteTarget: null }),
}));
