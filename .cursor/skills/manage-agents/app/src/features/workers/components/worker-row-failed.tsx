import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils/cn";
import {
  branchToWorkerName,
  branchToWorktreePath,
} from "../lib/worker-paths";
import { useWorkerUiStore } from "../store/use-worker-ui-store";
import type { CreatePlaceholder } from "../types";

interface Props {
  placeholder: CreatePlaceholder;
}

export function WorkerRowFailed({ placeholder }: Props) {
  const selected = useWorkerUiStore((s) => s.selectedName === placeholder.id);
  const toggleSelected = useWorkerUiStore((s) => s.toggleSelected);
  return (
    <TableRow
      data-state={selected ? "selected" : undefined}
      className={cn("cursor-pointer")}
      onClick={() => toggleSelected(placeholder.id)}
    >
      <TableCell className="w-[130px]" />
      <TableCell className="w-8" />
      <TableCell>
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-sm">
            {branchToWorkerName(placeholder.branch)}
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {branchToWorktreePath(placeholder.branch)}
          </span>
        </div>
      </TableCell>
      <TableCell className="w-[180px]">
        <Badge variant="setupFailed">Setup failed</Badge>
      </TableCell>
      <TableCell className="w-[60px]" />
    </TableRow>
  );
}
