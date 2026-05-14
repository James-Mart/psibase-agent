import { create } from "zustand";
import type { RhsRunPhasePayload } from "../types";

export type RhsRunPhaseEntry = RhsRunPhasePayload & { phaseStartedAtMs: number };

interface RhsUiState {
  selectedNodeId: string | null;
  showRunStream: boolean;
  innerTab: "diff" | "refine";
  runPhases: Record<number, RhsRunPhaseEntry>;
  setSelectedNode: (nodeId: string | null) => void;
  toggleRunStream: () => void;
  setInnerTab: (tab: RhsUiState["innerTab"]) => void;
  setRunPhase: (runId: number, payload: RhsRunPhasePayload) => void;
  clearRunPhase: (runId: number) => void;
}

export const useRhsUiStore = create<RhsUiState>((set) => ({
  selectedNodeId: null,
  showRunStream: false,
  innerTab: "diff",
  runPhases: {},
  setSelectedNode: (nodeId) => set({ selectedNodeId: nodeId }),
  toggleRunStream: () => set((s) => ({ showRunStream: !s.showRunStream })),
  setInnerTab: (tab) => set({ innerTab: tab }),
  setRunPhase: (runId, payload) =>
    set((s) => ({
      runPhases: {
        ...s.runPhases,
        [runId]: { ...payload, phaseStartedAtMs: Date.now() },
      },
    })),
  clearRunPhase: (runId) =>
    set((s) => {
      if (!(runId in s.runPhases)) return s;
      const next = { ...s.runPhases };
      delete next[runId];
      return { runPhases: next };
    }),
}));
