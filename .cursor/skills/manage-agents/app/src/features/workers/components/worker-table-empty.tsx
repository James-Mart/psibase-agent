import { TableCell, TableRow } from "@/components/ui/table";

export function WorkerTableEmpty() {
  return (
    <TableRow>
      <TableCell
        colSpan={5}
        className="py-12 text-center text-sm text-muted-foreground"
      >
        No worktrees found.
      </TableCell>
    </TableRow>
  );
}
