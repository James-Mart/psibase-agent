import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  branchToWorkerName,
  branchToWorktreePath,
} from "../lib/worker-paths";
import type { CreatePlaceholder } from "../types";

interface Props {
  placeholder: CreatePlaceholder;
}

export function WorkerRowCreating({ placeholder }: Props) {
  return (
    <TableRow aria-busy="true" className="opacity-70">
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
        <Badge variant="settingUp">Setting up</Badge>
      </TableCell>
      <TableCell className="w-[60px]" />
    </TableRow>
  );
}
