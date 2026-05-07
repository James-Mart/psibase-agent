import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";

export function WorkerTableLoading() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell className="w-[130px]">
            <Skeleton className="h-8 w-[110px]" />
          </TableCell>
          <TableCell className="w-8">
            <Skeleton className="h-4 w-4 rounded-full" />
          </TableCell>
          <TableCell>
            <div className="flex flex-col gap-1">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-64" />
            </div>
          </TableCell>
          <TableCell className="w-[180px]">
            <Skeleton className="h-7 w-32" />
          </TableCell>
          <TableCell className="w-[60px]">
            <Skeleton className="h-7 w-7" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}
