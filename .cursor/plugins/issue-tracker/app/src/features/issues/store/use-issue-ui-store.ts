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

const SELECTED_PROJECT_KEY = "issue-tracker.selectedProject";

function loadSelectedProject(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(SELECTED_PROJECT_KEY);
}

interface IssueUiState {
  view: IssueView;
  setView: (value: IssueView) => void;
  search: string;
  setSearch: (value: string) => void;
  expanded: Record<string, boolean>;
  toggle: (id: string) => void;
  selectedProjectId: string | null;
  selectProject: (id: string | null) => void;
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
  selectedProjectId: loadSelectedProject(),
  selectProject: (id) => {
    if (typeof localStorage !== "undefined") {
      if (id) localStorage.setItem(SELECTED_PROJECT_KEY, id);
      else localStorage.removeItem(SELECTED_PROJECT_KEY);
    }
    set({ selectedProjectId: id });
  },
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
