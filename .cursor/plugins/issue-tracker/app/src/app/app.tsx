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
import { PageShell } from "@/components/page-shell";
import {
  ShellFaultDetail,
  ShellLoadingState,
  ShellState,
} from "./shell-state";

const LEGACY_SELECTED_PROJECT_KEY = "issue-tracker.selectedProject";

function HomeRedirect() {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch, isFetching } = useIssuesQuery();
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
      <PageShell>
        <ShellLoadingState label="Loading the plan…" />
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell>
        <ShellState
          tone="blocked"
          eyebrow="Fault"
          title="Couldn't load the plan."
          detail={
            <ShellFaultDetail
              message={error.message}
              hint="Check the server, then reload."
            />
          }
          action={
            <Button
              variant="primary"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              Reload
            </Button>
          }
        />
      </PageShell>
    );
  }

  if (firstProjectId) {
    return null;
  }

  return (
    <PageShell>
      <header className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--current))]">
          Cockpit
        </p>
      </header>
      <ShellState
        eyebrow="Empty"
        title="No projects on the line."
        detail="Create a project to start planning."
        action={
          <Button size="sm" variant="primary" onClick={() => openProjectDialog()}>
            <Plus className="h-4 w-4" />
            New project
          </Button>
        }
      />
    </PageShell>
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
