import { Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkerInfo } from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";
import { useStartAgent, useStopAgent } from "../api/mutations";

interface Props {
  worker: WorkerInfo;
  busy: boolean;
}

export function WorkerAgentToggle({ worker, busy }: Props) {
  const start = useStartAgent();
  const stop = useStopAgent();
  const pending = busy || start.isPending || stop.isPending;
  const running = worker.agentRunning;

  return (
    <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className={cn(
          "[&>svg]:size-4 [&>svg]:fill-current [&>svg]:stroke-0",
          running
            ? "text-red-500 hover:text-red-400 hover:bg-red-500/10"
            : "text-green-500 hover:text-green-400 hover:bg-green-500/10",
        )}
        disabled={pending}
        onClick={() =>
          running ? stop.mutate(worker.name) : start.mutate(worker.name)
        }
        aria-label={running ? "Stop worker" : "Start worker"}
        title={running ? "Stop worker" : "Start worker"}
      >
        {running ? <Square /> : <Play />}
      </Button>
    </div>
  );
}
