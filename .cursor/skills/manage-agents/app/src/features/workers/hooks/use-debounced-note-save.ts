import { useCallback, useEffect, useRef } from "react";
import { useSaveWorkerNote } from "../api/mutations";

interface UseDebouncedNoteSave {
  scheduleSave: (note: string) => void;
  flush: () => void;
  isError: boolean;
}

export function useDebouncedNoteSave(
  name: string | null,
  delayMs = 5000,
): UseDebouncedNoteSave {
  const mutation = useSaveWorkerNote();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ name: string; note: string } | null>(null);

  const flushNow = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pendingRef.current) {
      mutation.mutate(pendingRef.current);
      pendingRef.current = null;
    }
  }, [mutation]);

  // Flush pending save when the selected worker changes or on unmount
  useEffect(() => {
    return () => flushNow();
  }, [name, flushNow]);

  const scheduleSave = (note: string) => {
    if (!name) return;
    pendingRef.current = { name, note };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (pendingRef.current) {
        mutation.mutate(pendingRef.current);
        pendingRef.current = null;
      }
    }, delayMs);
  };

  return { scheduleSave, flush: flushNow, isError: mutation.isError };
}
