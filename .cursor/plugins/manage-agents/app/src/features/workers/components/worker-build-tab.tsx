import { useCallback, useEffect, useRef, useState } from "react";
import { Hammer, Loader2, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchBuildLog, type BuildInfo } from "@/lib/api/builds";
import { cn } from "@/lib/utils/cn";
import {
  useBuildStatusQuery,
  useCancelBuild,
  useStartBuild,
} from "../api/builds";
import { LogPane, type FetchLogFn, type LogStream } from "./log-pane";

interface Props {
  name: string;
}

function formatElapsed(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function elapsedMs(info: BuildInfo, now: number): number {
  if (!info.startedAt) return 0;
  const start = Date.parse(info.startedAt);
  const end = info.finishedAt ? Date.parse(info.finishedAt) : now;
  return end - start;
}

function statusBadge(info: BuildInfo) {
  switch (info.status) {
    case "running":
      return <Badge variant="running">Running</Badge>;
    case "success":
      return <Badge variant="running">Succeeded</Badge>;
    case "failed":
      return <Badge variant="setupFailed">Failed</Badge>;
    case "cancelled":
      return <Badge variant="stopped">Cancelled</Badge>;
    default:
      return null;
  }
}

function statusText(info: BuildInfo, elapsed: number): string {
  switch (info.status) {
    case "running":
      return `Running... ${formatElapsed(elapsed)}`;
    case "success":
      return `Built in ${formatElapsed(elapsed)}`;
    case "failed":
      return `Failed after ${formatElapsed(elapsed)}${
        info.exitCode != null ? ` (exit ${info.exitCode})` : ""
      }`;
    case "cancelled":
      return `Cancelled after ${formatElapsed(elapsed)}`;
    default:
      return "Never run";
  }
}

function useNow(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [running]);
  return now;
}

function BuildActionButton({ name, running }: { name: string; running: boolean }) {
  const start = useStartBuild();
  const cancel = useCancelBuild();

  if (running) {
    return (
      <Button
        type="button"
        size="sm"
        variant="destructive"
        disabled={cancel.isPending}
        onClick={() => cancel.mutate(name)}
      >
        <Square className="h-3 w-3" />
        Cancel build
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      disabled={start.isPending}
      onClick={() => start.mutate(name)}
    >
      {start.isPending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Hammer className="h-3 w-3" />
      )}
      Build
    </Button>
  );
}

export function WorkerBuildTab({ name }: Props) {
  const statusQuery = useBuildStatusQuery(name);
  const prevStatusRef = useRef<string | null>(null);
  const [stream, setStream] = useState<LogStream>("stdout");

  const info = statusQuery.data;
  const running = info?.status === "running";
  const now = useNow(!!running);

  useEffect(() => {
    if (!info) return;
    const prev = prevStatusRef.current;
    prevStatusRef.current = info.status;
    if (prev !== "running" && info.status === "running") {
      setStream("stdout");
    } else if (
      prev === "running" &&
      (info.status === "failed" || info.status === "cancelled")
    ) {
      setStream("stderr");
    }
  }, [info]);

  const fetchLog: FetchLogFn = useCallback(
    (s, offset) => fetchBuildLog(name, s, offset),
    [name],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <BuildActionButton name={name} running={!!running} />
        {info && info.buildId !== null && statusBadge(info)}
      </div>

      {info && info.buildId !== null && (
        <>
          <p
            className={cn(
              "text-sm",
              info.status === "failed" && "text-destructive",
              info.status === "success" && "text-[hsl(var(--success))]",
              info.status === "running" && "text-muted-foreground",
            )}
          >
            {statusText(info, elapsedMs(info, now))}
          </p>
          <LogPane
            fetchLog={fetchLog}
            runId={info.buildId}
            stdoutSize={info.stdoutSize}
            stderrSize={info.stderrSize}
            running={!!running}
            stream={stream}
            onStreamChange={setStream}
          />
        </>
      )}
    </div>
  );
}
