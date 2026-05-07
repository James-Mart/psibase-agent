import { memo } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import type { WorkerInfo } from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";
import { useWorkerUiStore } from "../store/use-worker-ui-store";
import { WorkerAgentToggle } from "./worker-agent-toggle";
import { WorkerDeleteButton } from "./worker-delete-button";
import { WorkerNameCell } from "./worker-name-cell";
import { WorkerPrLink } from "./worker-pr-link";
import { WorkerStatusSelect } from "./worker-status-select";

interface Props {
  worker: WorkerInfo;
}

const isInteractive = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  !!target.closest("button, input, select, [role='combobox'], a");

export const WorkerRow = memo(function WorkerRow({ worker }: Props) {
  const selected = useWorkerUiStore((s) => s.selectedName === worker.name);
  const busy = useWorkerUiStore((s) => s.busyWorkers.has(worker.name));
  const toggleSelected = useWorkerUiStore((s) => s.toggleSelected);

  return (
    <TableRow
      data-state={selected ? "selected" : undefined}
      className={cn(
        "cursor-pointer",
        busy && "opacity-60",
      )}
      onClick={(e) => {
        if (isInteractive(e.target)) return;
        toggleSelected(worker.name);
      }}
    >
      <TableCell className="w-[130px]">
        <WorkerStatusSelect worker={worker} />
      </TableCell>
      <TableCell className="w-8">
        <WorkerPrLink pr={worker.pr} />
      </TableCell>
      <TableCell>
        <WorkerNameCell worker={worker} busy={busy} />
      </TableCell>
      <TableCell className="w-[180px]">
        <WorkerAgentToggle worker={worker} busy={busy} />
      </TableCell>
      <TableCell className="w-[60px] text-right">
        <WorkerDeleteButton worker={worker} busy={busy} />
      </TableCell>
    </TableRow>
  );
});
