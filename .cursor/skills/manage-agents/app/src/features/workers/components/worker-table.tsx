import { Fragment, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { WorkerInfo, WorkerStatus } from "@/lib/api/types";
import { useWorkersQuery } from "../api/queries";
import { useWorkerUiStore } from "../store/use-worker-ui-store";
import { WorkerRow } from "./worker-row";
import { WorkerRowCreating } from "./worker-row-creating";
import { WorkerRowFailed } from "./worker-row-failed";
import { WorkerTableEmpty } from "./worker-table-empty";
import { WorkerTableLoading } from "./worker-table-loading";

const STATUS_ORDER: readonly WorkerStatus[] = [
  "active",
  "blocked",
  "inactive",
] as const;

const STATUS_LABEL: Record<WorkerStatus, string> = {
  active: "Active",
  blocked: "Blocked",
  inactive: "Inactive",
};

interface Group {
  status: WorkerStatus;
  workers: WorkerInfo[];
}

const groupByStatus = (workers: WorkerInfo[]): Group[] =>
  STATUS_ORDER.map((status) => ({
    status,
    workers: workers.filter((w) => w.status === status),
  })).filter((g) => g.workers.length > 0);

export function WorkerTable() {
  const query = useWorkersQuery();
  const placeholders = useWorkerUiStore((s) => s.createPlaceholders);

  const groups = useMemo(
    () => (query.data ? groupByStatus(query.data) : []),
    [query.data],
  );

  const showEmpty =
    !query.isPending &&
    (query.data?.length ?? 0) === 0 &&
    placeholders.length === 0;

  const creating = placeholders.filter((p) => p.phase === "creating");
  const failed = placeholders.filter((p) => p.phase === "failed");

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[130px]">Status</TableHead>
            <TableHead className="w-20">
              <span className="sr-only">PR</span>
            </TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="w-[180px]">Agent</TableHead>
            <TableHead className="w-[60px] text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.isPending && <WorkerTableLoading />}
          {showEmpty && <WorkerTableEmpty />}
          {creating.map((p) => (
            <WorkerRowCreating key={p.id} placeholder={p} />
          ))}
          {failed.map((p) => (
            <WorkerRowFailed key={p.id} placeholder={p} />
          ))}
          {groups.map((group) => (
            <Fragment key={group.status}>
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={5}
                  className="bg-muted/40 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {STATUS_LABEL[group.status]}
                  <span className="ml-2 text-muted-foreground/70">
                    {group.workers.length}
                  </span>
                </TableCell>
              </TableRow>
              {group.workers.map((w) => (
                <WorkerRow key={w.name} worker={w} />
              ))}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
