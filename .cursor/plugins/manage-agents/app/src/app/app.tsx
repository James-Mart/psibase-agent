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
        <div className="flex min-h-svh w-full flex-col gap-4 px-6 py-6">
          <ApiErrorBanner />
          <div className="flex-1">
            <WorkerDetailPane />
          </div>
        </div>
      </SidebarInset>
      <WorkerCreateDialog />
      <WorkerDeleteDialog />
    </SidebarProvider>
  );
}
