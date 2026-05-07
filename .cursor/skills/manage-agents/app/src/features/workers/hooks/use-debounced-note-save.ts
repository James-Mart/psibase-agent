import { useEffect, useRef } from "react";
import { useSaveWorkerNote } from "../api/mutations";

interface UseDebouncedNoteSave {
  scheduleSave: (note: string) => void;
  flush: (note: string) => void;
  isError: boolean;
}

export function useDebouncedNoteSave(
  name: string | null,
  delayMs = 500,
): UseDebouncedNoteSave {
  const mutation = useSaveWorkerNote();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const scheduleSave = (note: string) => {
    if (!name) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      mutation.mutate({ name, note });
    }, delayMs);
  };

  const flush = (note: string) => {
    if (!name) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    mutation.mutate({ name, note });
  };

  return { scheduleSave, flush, isError: mutation.isError };
}
