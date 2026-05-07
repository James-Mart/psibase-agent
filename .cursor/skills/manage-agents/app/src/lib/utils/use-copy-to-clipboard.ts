import { useCallback, useEffect, useRef, useState } from "react";

interface UseCopyToClipboard {
  copiedKey: string | null;
  copy: (value: string, key?: string) => Promise<void>;
}

export function useCopyToClipboard(resetMs = 1500): UseCopyToClipboard {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const copy = useCallback(
    async (value: string, key?: string) => {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key ?? value);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopiedKey(null), resetMs);
    },
    [resetMs],
  );

  return { copiedKey, copy };
}
