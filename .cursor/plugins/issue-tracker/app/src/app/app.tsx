import { Route, Routes, useNavigate } from "react-router-dom";
import { useEffect, useLayoutEffect, useMemo } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TreePage } from "@/features/issues/components/tree-page";
import { IssueDetailPage } from "@/features/issues/components/issue-detail-page";
import { NewIssueDialog } from "@/features/issues/components/new-issue-dialog";
import { DeleteIssueDialog } from "@/features/issues/components/delete-issue-dialog";
import { ProjectSidebar } from "@/features/issues/components/project-sidebar";
import { ProjectDialog } from "@/features/issues/components/project-dialog";
import { TopBar } from "@/features/issues/components/top-bar";
import { useIssueEvents } from "@/features/issues/hooks/use-issue-events";
import { useIssuesQuery } from "@/features/issues/api/queries";
import { useIssueUiStore } from "@/features/issues/store/use-issue-ui-store";
import { listProjects } from "@/features/issues/lib/build-tree";
import { projectPath } from "@/features/issues/lib/links";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const LEGACY_SELECTED_PROJECT_KEY = "issue-tracker.selectedProject";

function HomeRedirect() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useIssuesQuery();
  const openProjectDialog = useIssueUiStore((s) => s.openProjectDialog);

  const firstProjectId = useMemo(
    () => listProjects(data?.issues ?? [])[0]?.id ?? null,
    [data?.issues],
  );

  useLayoutEffect(() => {
    if (firstProjectId) {
      navigate(projectPath(firstProjectId), { replace: true });
    }
  }, [firstProjectId, navigate]);

  if (isLoading) {
    return (
      <div className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-4 px-6 py-8">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-4 px-6 py-8">
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive-foreground">
          {error.message}
        </div>
      </div>
    );
  }

  if (firstProjectId) {
    return null;
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-4 px-6 py-8">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ml-1" />
          <div>
            <h1 className="text-xl font-semibold">Issue Tracker</h1>
            <p className="text-sm text-muted-foreground">
              Create a project to get started
            </p>
          </div>
        </div>
        <Button size="sm" variant="primary" onClick={() => openProjectDialog()}>
          <Plus className="h-4 w-4" />
          New project
        </Button>
      </header>
      <div className="rounded-lg border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
        No projects yet.
      </div>
    </div>
  );
}

export function App() {
  useIssueEvents();
  useEffect(() => {
    localStorage.removeItem(LEGACY_SELECTED_PROJECT_KEY);
  }, []);

  return (
    <SidebarProvider>
      <ProjectSidebar />
      <SidebarInset>
        <TopBar />
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/projects/:projectId" element={<TreePage />} />
          <Route
            path="/projects/:projectId/issues/:id"
            element={<IssueDetailPage />}
          />
        </Routes>
      </SidebarInset>
      <NewIssueDialog />
      <DeleteIssueDialog />
      <ProjectDialog />
    </SidebarProvider>
  );
}
