import { ApiErrorBanner } from "@/features/workers/components/api-error-banner";
import { WorkerCreateDialog } from "@/features/workers/components/worker-create-dialog";
import { WorkerDeleteDialog } from "@/features/workers/components/worker-delete-dialog";
import { WorkerDetailPane } from "@/features/workers/components/worker-detail-pane";
import { WorkerSidebar } from "@/features/workers/components/worker-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export function App() {
  return (
    <SidebarProvider>
      <WorkerSidebar />
      <SidebarInset>
        <div className="mx-auto w-full max-w-3xl px-6 py-6">
          <ApiErrorBanner />
          <WorkerDetailPane />
        </div>
      </SidebarInset>
      <WorkerCreateDialog />
      <WorkerDeleteDialog />
    </SidebarProvider>
  );
}
