import { Play, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { WorkerInfo } from "@/lib/api/types";
import { useStartAgent, useStopAgent } from "../api/mutations";

interface Props {
  worker: WorkerInfo;
  busy: boolean;
}

export function WorkerAgentToggle({ worker, busy }: Props) {
  const start = useStartAgent();
  const stop = useStopAgent();
  const pending = busy || start.isPending || stop.isPending;

  return (
    <div
      className="flex items-center gap-2"
      onClick={(e) => e.stopPropagation()}
    >
      {worker.agentRunning ? (
        <>
          <Badge variant="running">Running</Badge>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            disabled={pending}
            onClick={() => stop.mutate(worker.name)}
            aria-label="Stop agent"
            title="Stop agent"
          >
            <Square />
          </Button>
        </>
      ) : (
        <>
          <Badge variant="stopped">Stopped</Badge>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            disabled={pending}
            onClick={() => start.mutate(worker.name)}
            aria-label="Start agent"
            title="Start agent"
          >
            <Play />
          </Button>
        </>
      )}
    </div>
  );
}
