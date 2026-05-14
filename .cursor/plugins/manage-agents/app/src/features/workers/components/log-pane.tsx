import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { messageOf } from "@/lib/utils/error-message";

export type LogStream = "stdout" | "stderr";

export interface LogChunk {
  content: string;
  nextOffset: number;
  totalSize: number;
  eof: boolean;
}

export type FetchLogFn = (stream: LogStream, offset: number) => Promise<LogChunk>;

const TAIL_BYTES = 256 * 1024;
const POLL_MS = 2_000;
const MAX_CATCHUP_ITERS = 64;

export interface UseLogTailArgs {
  fetchLog: FetchLogFn;
  stream: LogStream;
  runId: number | string | null;
  initialSize: number;
  running: boolean;
  enabled: boolean;
}

export function useLogTail({
  fetchLog,
  stream,
  runId,
  initialSize,
  running,
  enabled,
}: UseLogTailArgs) {
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const offsetRef = useRef(0);
  const tickingRef = useRef(false);
  const sizeRef = useRef(initialSize);

  useEffect(() => {
    sizeRef.current = initialSize;
  }, [initialSize]);

  useEffect(() => {
    if (!enabled || runId === null) {
      setContent("");
      setError(null);
      return;
    }
    offsetRef.current = Math.max(0, sizeRef.current - TAIL_BYTES);
    setContent("");
    setError(null);
  }, [enabled, runId, stream]);

  useEffect(() => {
    if (!enabled || runId === null) return;

    let cancelled = false;

    const tick = async () => {
      if (tickingRef.current) return;
      tickingRef.current = true;
      try {
        let buffer = "";
        for (let i = 0; i < MAX_CATCHUP_ITERS; i++) {
          if (cancelled) return;
          let chunk: LogChunk;
          try {
            chunk = await fetchLog(stream, offsetRef.current);
          } catch (err) {
            if (!cancelled) setError(messageOf(err));
            return;
          }
          if (cancelled) return;
          buffer += chunk.content;
          offsetRef.current = chunk.nextOffset;
          if (chunk.eof) break;
        }
        if (!cancelled && buffer) {
          setContent((prev) => prev + buffer);
        }
      } finally {
        tickingRef.current = false;
      }
    };

    void tick();
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    if (!running) {
      return () => {
        cancelled = true;
        document.removeEventListener("visibilitychange", onVisible);
      };
    }

    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, fetchLog, stream, runId, running]);

  return { content, error };
}

export interface LogPaneProps {
  fetchLog: FetchLogFn;
  runId: number | string | null;
  stdoutSize: number;
  stderrSize: number;
  running: boolean;
  stream: LogStream;
  onStreamChange: (s: LogStream) => void;
}

export function LogPane({
  fetchLog,
  runId,
  stdoutSize,
  stderrSize,
  running,
  stream,
  onStreamChange,
}: LogPaneProps) {
  const initialSize = stream === "stdout" ? stdoutSize : stderrSize;
  const { content, error } = useLogTail({
    fetchLog,
    stream,
    runId,
    initialSize,
    running,
    enabled: true,
  });

  const preRef = useRef<HTMLPreElement | null>(null);
  const userScrolledRef = useRef(false);

  useEffect(() => {
    const el = preRef.current;
    if (!el) return;
    if (userScrolledRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [content]);

  const onScroll = () => {
    const el = preRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 16;
    userScrolledRef.current = !atBottom;
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        <Button
          type="button"
          size="sm"
          variant={stream === "stdout" ? "secondary" : "ghost"}
          onClick={() => onStreamChange("stdout")}
        >
          stdout
        </Button>
        <Button
          type="button"
          size="sm"
          variant={stream === "stderr" ? "secondary" : "ghost"}
          onClick={() => onStreamChange("stderr")}
        >
          stderr
        </Button>
      </div>
      {error && (
        <p className="text-xs text-destructive">Log read failed: {error}</p>
      )}
      <pre
        ref={preRef}
        onScroll={onScroll}
        className="max-h-80 overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-xs whitespace-pre-wrap break-all"
      >
        {content || (
          <span className="text-muted-foreground">(no output yet)</span>
        )}
      </pre>
    </div>
  );
}
