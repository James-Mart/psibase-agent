import { ApiErrorBanner } from "@/features/workers/components/api-error-banner";
import { CreateWorkerButton } from "@/features/workers/components/create-worker-button";
import { WorkerCreateDialog } from "@/features/workers/components/worker-create-dialog";
import { WorkerDeleteDialog } from "@/features/workers/components/worker-delete-dialog";
import { WorkerDetailPane } from "@/features/workers/components/worker-detail-pane";
import { WorkerTable } from "@/features/workers/components/worker-table";

export function App() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Workers</h1>
        <CreateWorkerButton />
      </header>
      <ApiErrorBanner />
      <WorkerTable />
      <WorkerDetailPane />
      <WorkerCreateDialog />
      <WorkerDeleteDialog />
    </main>
  );
}
