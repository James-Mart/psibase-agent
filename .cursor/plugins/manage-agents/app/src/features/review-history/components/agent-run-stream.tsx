import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useRhsRunStream } from "../hooks/use-rhs-run-stream";
import type { RhsRunEvent } from "../types";

interface Props {
  workerName: string;
  sessionId: string;
}

interface FormattedEvent {
  tag: string;
  kind: "assistant" | "other";
  prefix: string;
  body: string;
}

type StreamLine = FormattedEvent;

export function AgentRunStream({ workerName, sessionId }: Props) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<StreamLine[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useRhsRunStream(sessionId, workerName, (event) => {
    setLines((prev) => appendEvent(prev, formatEvent(event)));
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div className="rounded-md border bg-card text-xs">
      <button
        type="button"
        className="flex w-full items-center justify-between p-2 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-2 font-medium">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          Agent run stream
        </span>
      </button>
      {open && (
        <div
          ref={scrollRef}
          className="max-h-64 overflow-auto border-t bg-background p-2 font-mono text-[11px]"
        >
          {lines.length === 0 ? (
            <p className="text-muted-foreground">(no events yet)</p>
          ) : (
            lines.map((line, idx) => (
              <div key={idx} className="whitespace-pre-wrap break-all">
                {line.prefix}
                {line.body}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const MAX_LINES = 300;

function appendEvent(prev: StreamLine[], next: FormattedEvent): StreamLine[] {
  const last = prev[prev.length - 1];
  if (
    last &&
    last.kind === "assistant" &&
    next.kind === "assistant" &&
    last.tag === next.tag
  ) {
    const merged: StreamLine = { ...last, body: last.body + next.body };
    return [...prev.slice(0, -1), merged].slice(-MAX_LINES);
  }
  return [...prev, next].slice(-MAX_LINES);
}

function formatEvent(event: RhsRunEvent): FormattedEvent {
  const tag = `#${event.runId}@${event.targetNodeId.slice(0, 8)}`;
  if (event.type === "sdk_message") {
    const msg = event.payload as
      | { type?: string; message?: { content?: Array<{ type: string; text?: string }> } }
      | undefined;
    if (msg?.type === "assistant" && msg.message?.content) {
      const text = msg.message.content
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("");
      return {
        tag,
        kind: "assistant",
        prefix: `[${tag} assistant] `,
        body: text,
      };
    }
    if (msg?.type === "tool_call") {
      const tc = event.payload as { name?: string; status?: string };
      return {
        tag,
        kind: "other",
        prefix: `[${tag} tool ${tc.status ?? ""}] `,
        body: tc.name ?? "",
      };
    }
    return { tag, kind: "other", prefix: `[${tag} ${msg?.type ?? "msg"}]`, body: "" };
  }
  if (event.type === "loop_progress") {
    return {
      tag,
      kind: "other",
      prefix: `[${tag} loop] `,
      body: JSON.stringify(event.payload ?? {}),
    };
  }
  if (event.type === "phase") {
    const p = event.payload as
      | { phase?: string; label?: string; elapsedMs?: number; phaseMs?: number; detail?: string }
      | undefined;
    const stamp = p?.phaseMs != null ? `+${p.phaseMs}ms` : `${p?.elapsedMs ?? 0}ms`;
    const detail = p?.detail ? ` (${p.detail})` : "";
    return {
      tag,
      kind: "other",
      prefix: `[${tag} phase ${stamp}] `,
      body: `${p?.label ?? p?.phase ?? ""}${detail}`,
    };
  }
  return {
    tag,
    kind: "other",
    prefix: `[${tag} ${event.type}] `,
    body: JSON.stringify(event.payload ?? {}),
  };
}
