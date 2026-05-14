import { create } from "zustand";

interface RhsUiState {
  selectedNodeId: string | null;
  showRunStream: boolean;
  innerTab: "diff" | "refine";
  setSelectedNode: (nodeId: string | null) => void;
  toggleRunStream: () => void;
  setInnerTab: (tab: RhsUiState["innerTab"]) => void;
}

export const useRhsUiStore = create<RhsUiState>((set) => ({
  selectedNodeId: null,
  showRunStream: false,
  innerTab: "diff",
  setSelectedNode: (nodeId) => set({ selectedNodeId: nodeId }),
  toggleRunStream: () => set((s) => ({ showRunStream: !s.showRunStream })),
  setInnerTab: (tab) => set({ innerTab: tab }),
}));
