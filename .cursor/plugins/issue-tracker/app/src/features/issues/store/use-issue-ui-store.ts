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

const EXPANDED_KEY = "issue-tracker.expanded";

function loadExpanded(): Record<string, boolean> {
  if (typeof localStorage === "undefined") return {};
  const raw = localStorage.getItem(EXPANDED_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const expanded: Record<string, boolean> = {};
      for (const [id, value] of Object.entries(parsed)) {
        if (value === false) expanded[id] = false;
      }
      return expanded;
    }
  } catch {
    // ignore invalid stored value
  }
  return {};
}

function saveExpanded(expanded: Record<string, boolean>): void {
  if (typeof localStorage === "undefined") return;
  if (Object.keys(expanded).length === 0) {
    localStorage.removeItem(EXPANDED_KEY);
  } else {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify(expanded));
  }
}

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
  expanded: loadExpanded(),
  toggle: (id) =>
    set((state) => {
      const nextExpanded = !(state.expanded[id] ?? true);
      const expanded = { ...state.expanded };
      if (nextExpanded) {
        delete expanded[id];
      } else {
        expanded[id] = false;
      }
      saveExpanded(expanded);
      return { expanded };
    }),
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
