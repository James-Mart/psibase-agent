import { GitFork, HardDrive, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkerDetailsQuery, useWorkersQuery, useWorktreeDiskSizeQuery } from "../api/queries";
import { useWorkerUiStore } from "../store/use-worker-ui-store";
import { FileTree } from "./file-tree/file-tree";
import { WorkerDetailFailed } from "./worker-detail-failed";
import { WorkerDetailHeader } from "./worker-detail-header";
import { WorkerNoteEditor } from "./worker-note-editor";
import { WorkerToolsTabs } from "./worker-tools-tabs";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  for (const unit of units) {
    value /= 1024;
    if (value < 1024 || unit === "TB") return `${value.toFixed(1)} ${unit}`;
  }
  return `${value.toFixed(1)} TB`;
}

export function WorkerDetailPane() {
  const selectedName = useWorkerUiStore((s) => s.selectedName);
  const placeholders = useWorkerUiStore((s) => s.createPlaceholders);
  const busy = useWorkerUiStore(
    (s) => !!selectedName && s.busyWorkers.has(selectedName),
  );
  const failedPlaceholder = placeholders.find(
    (p) => p.id === selectedName && p.phase === "failed",
  );
  const workersQuery = useWorkersQuery();
  const selectedWorker = workersQuery.data?.find((w) => w.name === selectedName);
  const detailsName =
    selectedName && !failedPlaceholder ? selectedName : null;
  const detailsQuery = useWorkerDetailsQuery(detailsName);
  const diskSizeQuery = useWorktreeDiskSizeQuery(detailsName);

  if (!selectedName) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Select a worker to see details.
        </p>
      </div>
    );
  }

  if (failedPlaceholder) {
    return <WorkerDetailFailed placeholder={failedPlaceholder} />;
  }

  if (!selectedWorker) return null;

  if (detailsQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (detailsQuery.isError || !detailsQuery.data) {
    return (
      <p className="text-sm text-destructive">
        Failed to load details: {detailsQuery.error?.message ?? "unknown error"}
      </p>
    );
  }

  const details = detailsQuery.data;

  return (
    <div className="space-y-4">
      <WorkerDetailHeader worker={selectedWorker} busy={busy} pr={details.pr} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-muted-foreground">
        {details.sourceBranch && (
          <span className="flex items-center gap-1">
            <GitFork className="h-3 w-3" /> {details.sourceBranch}
          </span>
        )}
        <span className="flex items-center gap-1">
          <HardDrive className="h-3 w-3" />
          {diskSizeQuery.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : diskSizeQuery.data ? (
            formatBytes(diskSizeQuery.data.size)
          ) : (
            "\u2014"
          )}
        </span>
      </div>

      <WorkerToolsTabs name={selectedName} />

      <section className="space-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Note
        </h3>
        <WorkerNoteEditor name={selectedName} initialNote={details.note} />
      </section>

      <section className="space-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Git Status
        </h3>
        {details.unstagedFiles.length > 0 ? (
          <FileTree files={details.unstagedFiles} />
        ) : (
          <p className="text-sm text-muted-foreground">Clean working tree.</p>
        )}
      </section>
    </div>
  );
}
