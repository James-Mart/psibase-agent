import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { DerivedState, IssueRecord } from "@server/schemas";
import { PageShell } from "@/components/page-shell";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { IssuesQueryShell, ShellState } from "@/app/shell-state";
import { cn } from "@/lib/utils/cn";
import { useIssuesQuery } from "../api/queries";
import { flowBuckets, type FlowItem } from "../lib/flow";
import { issuePath } from "../lib/links";
import {
  OVERVIEW_LENS_OPTIONS,
  parseOverviewLens,
  writeOverviewLensParam,
  type OverviewLens,
} from "../lib/overview-lens";
import { FlowBucketsSections } from "./flow-buckets-sections";
import { FlowRow } from "./flow-row";

function OverviewHeader({ title }: { title: string }) {
  return (
    <header className="flex items-center gap-2">
      <SidebarTrigger className="-ml-1" />
      <div className="min-w-0">
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--current))]">
          Overview
        </p>
        <h1 className="truncate text-base font-semibold tracking-tight text-foreground">
          {title}
        </h1>
      </div>
    </header>
  );
}

function LensSwitcher({
  value,
  onChange,
}: {
  value: OverviewLens;
  onChange: (lens: OverviewLens) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Overview lens"
      className="flex flex-wrap items-center gap-0.5 rounded-md border border-border p-0.5"
    >
      {OVERVIEW_LENS_OPTIONS.map(({ id, label }) => {
        const selected = value === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={selected}
            id={`overview-lens-tab-${id}`}
            aria-controls={`overview-lens-panel-${id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(id)}
            className={cn(
              "rounded-[calc(var(--radius)-2px)] px-3 py-1.5 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** Project-scoped Flow lens (filters land in overview-flow-lens). */
function OverviewFlowLens({
  projectId,
  issues,
  derived,
}: {
  projectId: string;
  issues: IssueRecord[];
  derived: Record<string, DerivedState>;
}) {
  const buckets = useMemo(
    () => flowBuckets(issues, derived, { projectId }),
    [derived, issues, projectId],
  );

  return (
    <div
      role="tabpanel"
      id="overview-lens-panel-flow"
      aria-labelledby="overview-lens-tab-flow"
    >
      <FlowBucketsSections
        buckets={buckets}
        idPrefix="overview-flow"
        renderRow={(item: FlowItem) => (
          <Link
            to={issuePath(projectId, item.issue.id)}
            className="block text-inherit no-underline hover:no-underline"
          >
            <FlowRow item={item} />
          </Link>
        )}
      />
    </div>
  );
}

/**
 * Per-project overview shell: lens switcher (`?lens=`) + Flow lens.
 * Structure and Dependencies are mount points for stacked Stories.
 */
export function OverviewPage() {
  const { projectId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const lens = parseOverviewLens(searchParams.get("lens"));
  const { data, isLoading, error, refetch, isFetching } = useIssuesQuery();

  const issues = data?.issues ?? [];
  const derived = data?.derived ?? {};
  const project = useMemo(
    () =>
      issues.find(
        (issue) => issue.id === projectId && issue.kind === "project",
      ),
    [issues, projectId],
  );

  const setLens = (next: OverviewLens) => {
    setSearchParams((prev) => writeOverviewLensParam(prev, next), {
      replace: true,
    });
  };

  return (
    <IssuesQueryShell
      isLoading={isLoading}
      error={error}
      isFetching={isFetching}
      onReload={() => void refetch()}
      loadingLabel="Loading overview…"
      errorTitle="Couldn't load the overview."
    >
      {!project ? (
        <PageShell>
          <OverviewHeader title="Project not found" />
          <ShellState
            tone="blocked"
            eyebrow="Missing"
            title="No project with that id."
            detail={
              <span className="font-mono text-xs">
                {projectId || "(empty)"}
              </span>
            }
          />
        </PageShell>
      ) : (
        <PageShell>
          <OverviewHeader title={project.title} />
          <LensSwitcher value={lens} onChange={setLens} />

          {lens === "flow" ? (
            <OverviewFlowLens
              projectId={projectId}
              issues={issues}
              derived={derived}
            />
          ) : null}

          {/* Mount point: Structure lens — surfaces-overview-structure */}
          {lens === "structure" ? (
            <div
              role="tabpanel"
              id="overview-lens-panel-structure"
              aria-labelledby="overview-lens-tab-structure"
              data-lens-mount="structure"
            />
          ) : null}

          {/* Mount point: Dependencies lens — surfaces-overview-dependency-map */}
          {lens === "dependencies" ? (
            <div
              role="tabpanel"
              id="overview-lens-panel-dependencies"
              aria-labelledby="overview-lens-tab-dependencies"
              data-lens-mount="dependencies"
            />
          ) : null}
        </PageShell>
      )}
    </IssuesQueryShell>
  );
}
