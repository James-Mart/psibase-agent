import { GitFork } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkersQuery, useWorkerDetailsQuery } from "../api/queries";
import { useWorkerUiStore } from "../store/use-worker-ui-store";
import { FileTree } from "./file-tree/file-tree";
import { WorkerDetailFailed } from "./worker-detail-failed";
import { WorkerNoteEditor } from "./worker-note-editor";
import { WorkerPrLink } from "./worker-pr-link";

export function WorkerDetailPane() {
  const selectedName = useWorkerUiStore((s) => s.selectedName);
  const placeholders = useWorkerUiStore((s) => s.createPlaceholders);
  const failedPlaceholder = placeholders.find(
    (p) => p.id === selectedName && p.phase === "failed",
  );
  const workersQuery = useWorkersQuery();
  const selectedWorker = workersQuery.data?.find((w) => w.name === selectedName);
  const detailsName =
    selectedName && !failedPlaceholder ? selectedName : null;
  const detailsQuery = useWorkerDetailsQuery(detailsName);

  if (!selectedName) return null;
  if (failedPlaceholder) {
    return (
      <Section>
        <WorkerDetailFailed placeholder={failedPlaceholder} />
      </Section>
    );
  }
  if (!selectedWorker) return null;

  if (detailsQuery.isPending) {
    return (
      <Section>
        <div className="space-y-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-32 w-full" />
        </div>
      </Section>
    );
  }

  if (detailsQuery.isError || !detailsQuery.data) {
    return (
      <Section>
        <p className="text-sm text-destructive">
          Failed to load details: {detailsQuery.error?.message ?? "unknown error"}
        </p>
      </Section>
    );
  }

  const details = detailsQuery.data;

  return (
    <Section>
      <header className="space-y-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          {selectedWorker.name}
          <WorkerPrLink pr={details.pr} />
        </h2>
        {details.sourceBranch && (
          <p className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
            <GitFork className="h-3 w-3" /> {details.sourceBranch}
          </p>
        )}
      </header>

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

      <section className="space-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Note
        </h3>
        <WorkerNoteEditor name={selectedName} initialNote={details.note} />
      </section>
    </Section>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <aside className="mt-4 space-y-4 rounded-lg border bg-card p-5">
      {children}
    </aside>
  );
}
