import { create } from "zustand";
import type { IssueKind } from "@server/schemas";

interface NewIssueTarget {
  presetKind?: IssueKind;
  presetParent?: string;
  presetStackedOn?: string;
}

// The project-create/rename dialog target. `id` present => rename that project.
export interface ProjectDialogTarget {
  id?: string;
  title?: string;
}

export type IssueView = "tree" | "ready";

interface IssueUiState {
  view: IssueView;
  setView: (value: IssueView) => void;
  search: string;
  setSearch: (value: string) => void;
  expanded: Record<string, boolean>;
  toggle: (id: string) => void;
  projectDialog: ProjectDialogTarget | null;
  openProjectDialog: (target?: ProjectDialogTarget) => void;
  closeProjectDialog: () => void;
  newIssue: NewIssueTarget | null;
  openNew: (target?: NewIssueTarget) => void;
  closeNew: () => void;
  deleteTarget: string | null;
  requestDelete: (id: string) => void;
  clearDelete: () => void;
}

export const useIssueUiStore = create<IssueUiState>((set) => ({
  view: "tree",
  setView: (value) => set({ view: value }),
  search: "",
  setSearch: (value) => set({ search: value }),
  expanded: {},
  toggle: (id) =>
    set((state) => ({
      expanded: { ...state.expanded, [id]: !(state.expanded[id] ?? true) },
    })),
  projectDialog: null,
  openProjectDialog: (target) => set({ projectDialog: target ?? {} }),
  closeProjectDialog: () => set({ projectDialog: null }),
  newIssue: null,
  openNew: (target) => set({ newIssue: target ?? {} }),
  closeNew: () => set({ newIssue: null }),
  deleteTarget: null,
  requestDelete: (id) => set({ deleteTarget: id }),
  clearDelete: () => set({ deleteTarget: null }),
}));
