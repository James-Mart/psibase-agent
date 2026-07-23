import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  ShellFaultDetail,
  ShellLoadingState,
  ShellState,
} from "@/app/shell-state";
import { useIssuesQuery } from "../api/queries";
import { issuesById, listProjects, projectIdOf } from "../lib/build-tree";
import { flowBuckets, type FlowItem } from "../lib/flow";
import { issuePath, projectPath } from "../lib/links";
import { useIssueUiStore } from "../store/use-issue-ui-store";
import { FlowBucketsSections } from "./flow-buckets-sections";
import { FlowRow } from "./flow-row";

function CockpitHeader() {
  return (
    <header className="flex items-center gap-2">
      <SidebarTrigger className="-ml-1" />
      <p className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--current))]">
        Cockpit
      </p>
    </header>
  );
}

function CockpitFlowRow({
  item,
  projectId,
  projectTitle,
}: {
  item: FlowItem;
  projectId: string;
  projectTitle: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Link
        to={issuePath(projectId, item.issue.id)}
        className="min-w-0 flex-1 text-inherit no-underline hover:no-underline"
      >
        <FlowRow item={item} />
      </Link>
      <Link
        to={projectPath(projectId)}
        className="shrink-0 truncate font-mono text-[11px] text-muted-foreground hover:text-foreground"
        title={projectTitle}
      >
        {projectTitle}
      </Link>
    </div>
  );
}

export function CockpitPage() {
  const { data, isLoading, error, refetch, isFetching } = useIssuesQuery();
  const openProjectDialog = useIssueUiStore((s) => s.openProjectDialog);

  const issues = data?.issues ?? [];
  const derived = data?.derived ?? {};
  const byId = useMemo(() => issuesById(issues), [issues]);
  const projects = useMemo(() => listProjects(issues), [issues]);
  const buckets = useMemo(
    () => flowBuckets(issues, derived, {}),
    [derived, issues],
  );

  if (isLoading) {
    return (
      <PageShell>
        <ShellLoadingState label="Loading the line…" />
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell>
        <ShellState
          tone="blocked"
          eyebrow="Fault"
          title="Couldn't load the line."
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

  return (
    <PageShell>
      <CockpitHeader />
      {projects.length === 0 ? (
        <ShellState
          eyebrow="Empty"
          title="No projects on the line."
          detail="Create a project to start planning."
          action={
            <Button
              size="sm"
              variant="primary"
              onClick={() => openProjectDialog()}
            >
              <Plus className="h-4 w-4" />
              New project
            </Button>
          }
        />
      ) : (
        <FlowBucketsSections
          buckets={buckets}
          idPrefix="cockpit"
          renderRow={(item) => {
            const projectId = projectIdOf(item.issue.id, byId);
            if (!projectId) return null;
            const project = byId.get(projectId);
            const projectTitle =
              project?.kind === "project" ? project.title : projectId;
            return (
              <CockpitFlowRow
                item={item}
                projectId={projectId}
                projectTitle={projectTitle}
              />
            );
          }}
        />
      )}
    </PageShell>
  );
}
