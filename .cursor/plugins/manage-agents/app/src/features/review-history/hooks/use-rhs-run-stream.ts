import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RhsRunEvent } from "../types";
import { rhsKeys } from "../api/keys";

export function useRhsRunStream(
  sessionId: string | null,
  workerName: string | null,
  onEvent?: (event: RhsRunEvent) => void,
): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!sessionId) return;
    const url = `/api/review-history/sessions/${sessionId}/events`;
    const source = new EventSource(url);
    source.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as RhsRunEvent;
        onEvent?.(event);
        if (event.type === "finished" || event.type === "error" || event.type === "cancelled") {
          qc.invalidateQueries({
            queryKey: rhsKeys.edge(sessionId, event.targetNodeId),
          });
          qc.invalidateQueries({
            queryKey: rhsKeys.inProgressRefinement(sessionId),
          });
          qc.invalidateQueries({ queryKey: rhsKeys.graph(sessionId) });
          qc.invalidateQueries({ queryKey: rhsKeys.activeChain(sessionId) });
          qc.invalidateQueries({ queryKey: rhsKeys.validateHead(sessionId) });
          if (workerName) {
            qc.invalidateQueries({
              queryKey: rhsKeys.sessionForWorker(workerName),
            });
          }
        }
        if (event.type === "loop_progress") {
          qc.invalidateQueries({
            queryKey: rhsKeys.edge(sessionId, event.targetNodeId),
          });
          qc.invalidateQueries({ queryKey: rhsKeys.graph(sessionId) });
          qc.invalidateQueries({ queryKey: rhsKeys.activeChain(sessionId) });
        }
      } catch {
        // ignore malformed event payloads
      }
    };
    source.onerror = () => {
      // EventSource auto-reconnects; nothing to do.
    };
    return () => {
      source.close();
    };
  }, [sessionId, workerName, qc, onEvent]);
}
