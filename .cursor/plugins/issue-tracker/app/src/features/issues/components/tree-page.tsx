import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { AlertTriangle, ListChecks, ListTree, Plus, Search } from "lucide-react";
import type { IssueRecord } from "@server/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils/cn";
import { useIssuesQuery } from "../api/queries";
import { IssueTree } from "./issue-tree";
import { ReadyView } from "./ready-view";
import { buildTree, filterToProject, parentOf } from "../lib/build-tree";
import { issueMatchesSearch } from "../lib/search";
import { useIssueUiStore, type IssueView } from "../store/use-issue-ui-store";

function filterWithAncestors(
  issues: IssueRecord[],
  query: string,
): IssueRecord[] {
  if (!query.trim()) return issues;

  const byId = new Map(issues.map((issue) => [issue.id, issue]));
  const keep = new Set<string>();
  const retain = (issue: IssueRecord): void => {
    let current: IssueRecord | undefined = issue;
    while (current && !keep.has(current.id)) {
      keep.add(current.id);
      // Retain the containment parent and, for a branch, the branch it forks
      // from, so a matched nested branch keeps its stack ancestors and nests.
      if (current.kind === "branch" && current.stackedOn) {
        const base = byId.get(current.stackedOn);
        if (base) retain(base);
      }
      const parent = parentOf(current);
      current = parent ? byId.get(parent) : undefined;
    }
  };
  for (const issue of issues) {
    if (!issueMatchesSearch(issue, query)) continue;
    retain(issue);
  }
  return issues.filter((issue) => keep.has(issue.id));
}

function ViewToggle({
  view,
  setView,
}: {
  view: IssueView;
  setView: (value: IssueView) => void;
}) {
  const options: { value: IssueView; label: string; Icon: typeof ListTree }[] = [
    { value: "tree", label: "Tree", Icon: ListTree },
    { value: "ready", label: "Ready", Icon: ListChecks },
  ];
  return (
    <div className="flex rounded-md border p-0.5">
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => setView(value)}
          className={cn(
            "flex items-center gap-1.5 rounded px-2.5 py-1 text-sm",
            view === value
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  );
}

export function TreePage() {
  const { projectId = "" } = useParams();
  const { data, isLoading, error } = useIssuesQuery();
  const openNew = useIssueUiStore((s) => s.openNew);
  const openProjectDialog = useIssueUiStore((s) => s.openProjectDialog);
  const search = useIssueUiStore((s) => s.search);
  const setSearch = useIssueUiStore((s) => s.setSearch);
  const view = useIssueUiStore((s) => s.view);
  const setView = useIssueUiStore((s) => s.setView);

  const issues = data?.issues ?? [];
  const project = useMemo(
    () =>
      issues.find(
        (issue) => issue.id === projectId && issue.kind === "project",
      ),
    [issues, projectId],
  );
  const scoped = useMemo(
    () => filterToProject(issues, projectId || null),
    [issues, projectId],
  );
  const filtered = useMemo(
    () => filterWithAncestors(scoped, search),
    [scoped, search],
  );
  const nodes = useMemo(() => buildTree(filtered), [filtered]);
  const problems = data?.problems ?? [];
  const derived = data?.derived ?? {};

  const hasProject = Boolean(project);
  const unknownProject = Boolean(data) && Boolean(projectId) && !hasProject;

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-4 px-6 py-8">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ml-1" />
          <div>
            <h1 className="text-xl font-semibold">
              {project?.title ?? "Issue Tracker"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {hasProject
                ? "Epic \u203a Branch \u203a Commit"
                : unknownProject
                  ? "Project not found"
                  : "Select or create a project"}
            </p>
          </div>
        </div>
        {hasProject ? (
          <Button
            size="sm"
            onClick={() =>
              openNew({ presetKind: "epic", presetParent: projectId })
            }
          >
            <Plus className="h-4 w-4" />
            New epic
          </Button>
        ) : (
          <Button size="sm" onClick={() => openProjectDialog()}>
            <Plus className="h-4 w-4" />
            New project
          </Button>
        )}
      </header>

      {unknownProject ? (
        <div className="rounded-lg border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
          No project with id <span className="font-mono">{projectId}</span>.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title or id"
                className="pl-9"
              />
            </div>
            <ViewToggle view={view} setView={setView} />
          </div>

          {error ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive-foreground">
              {error.message}
            </div>
          ) : null}

          {problems.length > 0 ? (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
              <div className="mb-1 flex items-center gap-2 font-medium [color:hsl(var(--warning))]">
                <AlertTriangle className="h-4 w-4" />
                {problems.length} problem{problems.length > 1 ? "s" : ""}
              </div>
              <ul className="list-inside list-disc text-muted-foreground">
                {problems.map((p) => (
                  <li key={`${p.id}:${p.message}`}>
                    <span className="font-mono">{p.id}</span>: {p.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="rounded-lg border bg-card p-2">
            {isLoading ? (
              <div className="space-y-2 p-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-11/12" />
                <Skeleton className="h-8 w-10/12" />
              </div>
            ) : view === "ready" && data ? (
              <ReadyView data={data} />
            ) : (
              <IssueTree nodes={nodes} derived={derived} issues={scoped} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
