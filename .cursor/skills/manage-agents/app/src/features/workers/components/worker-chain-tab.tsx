import { useCallback, useEffect, useRef, useState } from "react";
import { Globe, Loader2, Play, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchChainLog, type ChainInfo } from "@/lib/api/chains";
import { cn } from "@/lib/utils/cn";
import { useChainStatusQuery, useCancelChain, useStartChain } from "../api/chains";
import { useLogTail, type FetchLogFn } from "./log-pane";

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

function elapsedMs(info: ChainInfo, now: number): number {
  if (!info.launchStartedAt) return 0;
  const start = Date.parse(info.launchStartedAt);
  const end = info.launchFinishedAt ? Date.parse(info.launchFinishedAt) : now;
  return end - start;
}

function statusBadge(info: ChainInfo) {
  switch (info.status) {
    case "launching":
      return <Badge variant="running">Launching</Badge>;
    case "booting":
      return <Badge variant="running">Booting</Badge>;
    case "ready":
      return <Badge variant="running">Ready</Badge>;
    case "boot-failed":
      return <Badge variant="setupFailed">Boot Failed</Badge>;
    case "failed":
      return <Badge variant="setupFailed">Failed</Badge>;
    case "stopped":
      return <Badge variant="stopped">Stopped</Badge>;
    default:
      return null;
  }
}

function statusText(info: ChainInfo, elapsed: number): string {
  switch (info.status) {
    case "launching":
      return `Launching... ${formatElapsed(elapsed)}`;
    case "booting":
      return `Booting... ${formatElapsed(elapsed)}`;
    case "ready":
      return `Up ${formatElapsed(elapsed)}`;
    case "boot-failed":
      return `Boot failed${info.bootExitCode != null ? ` (exit ${info.bootExitCode})` : ""}`;
    case "failed":
      return `Failed after ${formatElapsed(elapsed)}${
        info.launchExitCode != null ? ` (exit ${info.launchExitCode})` : ""
      }`;
    case "stopped":
      return `Stopped after ${formatElapsed(elapsed)}`;
    default:
      return "Never started";
  }
}

const RUNNING_STATUSES = new Set(["launching", "booting", "ready", "boot-failed"]);

function isRunning(info: ChainInfo | undefined): boolean {
  return !!info && RUNNING_STATUSES.has(info.status);
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function ChainActionButton({
  name,
  running,
  disabled,
}: {
  name: string;
  running: boolean;
  disabled: boolean;
}) {
  const start = useStartChain();
  const cancel = useCancelChain();

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
        Stop
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      disabled={disabled || start.isPending}
      onClick={() => start.mutate(name)}
    >
      {start.isPending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Play className="h-3 w-3" />
      )}
      Start Chain
    </Button>
  );
}

type ErrorPhase = "launch" | "boot";

function ErrorLogDialog({
  open,
  onOpenChange,
  name,
  phase,
  chainId,
  stderrSize,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  phase: ErrorPhase;
  chainId: number | null;
  stderrSize: number;
}) {
  const fetchLog: FetchLogFn = useCallback(
    (_s, offset) => fetchChainLog(name, phase, "stderr", offset),
    [name, phase],
  );

  const { content } = useLogTail({
    fetchLog,
    stream: "stderr",
    runId: open ? chainId : null,
    initialSize: stderrSize,
    running: false,
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {phase === "launch" ? "Launch" : "Boot"} Error Output
          </DialogTitle>
        </DialogHeader>
        <pre className="max-h-96 overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-xs whitespace-pre-wrap break-all">
          {content || <span className="text-muted-foreground">(no stderr output)</span>}
        </pre>
      </DialogContent>
    </Dialog>
  );
}

export function WorkerChainTab({ name }: Props) {
  const statusQuery = useChainStatusQuery(name);
  const prevStatusRef = useRef<string | null>(null);
  const [errorDialogPhase, setErrorDialogPhase] = useState<ErrorPhase | null>(null);

  const info = statusQuery.data;
  const running = isRunning(info);
  const now = useNow(running);
  const psinodeAvailable = info?.psinodeAvailable ?? false;

  useEffect(() => {
    if (!info) return;
    prevStatusRef.current = info.status;
  }, [info]);

  const chainUrl = info?.port ? `http://psibase.localhost:${info.port}` : null;
  const hasFailed = info?.status === "failed" || info?.status === "boot-failed";
  const failedPhase: ErrorPhase | null =
    info?.status === "boot-failed" ? "boot" : info?.status === "failed" ? "launch" : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ChainActionButton name={name} running={running} disabled={!psinodeAvailable} />
        {info && info.status !== "idle" && statusBadge(info)}
        {chainUrl && info?.status === "ready" && (
          <a
            href={chainUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Globe className="h-3.5 w-3.5" />
            Open
          </a>
        )}
      </div>

      {!psinodeAvailable && !running && (
        <p className="text-xs text-muted-foreground">
          No psinode binary found. Run a full build first.
        </p>
      )}

      {info && info.status !== "idle" && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p
            className={cn(
              "text-sm",
              (info.status === "failed" || info.status === "boot-failed") && "text-destructive",
              info.status === "ready" && "text-foreground",
              (info.status === "launching" || info.status === "booting") && "text-muted-foreground",
            )}
          >
            {statusText(info, elapsedMs(info, now))}
          </p>
          {hasFailed && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-auto px-1.5 py-0.5 text-xs text-destructive"
              onClick={() => setErrorDialogPhase(failedPhase)}
            >
              View Error
            </Button>
          )}
        </div>
      )}

      {info && errorDialogPhase && (
        <ErrorLogDialog
          open={!!errorDialogPhase}
          onOpenChange={(open) => { if (!open) setErrorDialogPhase(null); }}
          name={name}
          phase={errorDialogPhase}
          chainId={info.chainId}
          stderrSize={
            errorDialogPhase === "launch" ? info.launchStderrSize : info.bootStderrSize
          }
        />
      )}
    </div>
  );
}
