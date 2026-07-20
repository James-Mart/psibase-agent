import { useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  AlertTriangle,
  Archive,
  GitBranch,
  Layers,
  Lightbulb,
  Plus,
  Search,
  Tags,
} from "lucide-react";
import type { IssueRecord, ProjectLabel } from "@server/schemas";
import { visibleIssues } from "@server/services/archived-visibility";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useIssuesQuery } from "../api/queries";
import { IssueTree } from "./issue-tree";
import { buildTree, filterToProject } from "../lib/build-tree";
import type { BoardKindFilter } from "../lib/board-kind-filter";
import { filterWithAncestors } from "../lib/filter-with-ancestors";
import {
  issueMatchesLabelFilter,
  toggleAssignmentId,
} from "../lib/project-labels";
import { projectBoardRoots } from "../lib/project-board-roots";
import { issueMatchesSearch } from "../lib/search";
import { useIssueUiStore } from "../store/use-issue-ui-store";
import { ProjectLabelChip } from "./project-label-chip";

const BOARD_FILTER_OPTIONS: {
  value: BoardKindFilter;
  label: string;
  icon: typeof Layers;
}[] = [
  { value: "both", label: "All", icon: Layers },
  { value: "epic", label: "Epics", icon: Layers },
  { value: "idea", label: "Ideas", icon: Lightbulb },
  { value: "story", label: "Stories", icon: GitBranch },
];

function LabelFilterControl({
  catalog,
  selected,
  onChange,
}: {
  catalog: ProjectLabel[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const selectedInCatalog = selected.filter((id) =>
    catalog.some((label) => label.id === id),
  );
  const active = selectedInCatalog.length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={active ? "secondary" : "outline"}
          size="sm"
          className="shrink-0"
          disabled={catalog.length === 0}
          aria-label="Filter by label"
          title={
            catalog.length === 0
              ? "No labels in project catalog"
              : "Filter by label"
          }
        >
          <Tags className="h-4 w-4" />
          Labels
          {active ? (
            <span className="ml-1 tabular-nums text-muted-foreground">
              ({selectedInCatalog.length})
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Filter by label (OR)</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {catalog.map((label) => (
          <DropdownMenuCheckboxItem
            key={label.id}
            checked={selected.includes(label.id)}
            onCheckedChange={() =>
              onChange(toggleAssignmentId(selected, label.id))
            }
            onSelect={(event) => event.preventDefault()}
          >
            <ProjectLabelChip label={label} />
          </DropdownMenuCheckboxItem>
        ))}
        {active ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange([])}>
              Clear labels
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TreePage() {
  const { projectId = "" } = useParams();
  const { data, isLoading, error } = useIssuesQuery();
  const openNew = useIssueUiStore((s) => s.openNew);
  const openProjectDialog = useIssueUiStore((s) => s.openProjectDialog);
  const search = useIssueUiStore((s) => s.search);
  const setSearch = useIssueUiStore((s) => s.setSearch);
  const labelFilter = useIssueUiStore((s) => s.labelFilter);
  const setLabelFilter = useIssueUiStore((s) => s.setLabelFilter);
  const boardKindFilter = useIssueUiStore((s) => s.boardKindFilter);
  const setBoardKindFilter = useIssueUiStore((s) => s.setBoardKindFilter);
  const showArchived = useIssueUiStore((s) => s.showArchived);
  const setShowArchived = useIssueUiStore((s) => s.setShowArchived);

  const issues = data?.issues ?? [];
  const project = useMemo(
    () =>
      issues.find(
        (issue) => issue.id === projectId && issue.kind === "project",
      ),
    [issues, projectId],
  );
  const catalog = project?.kind === "project" ? (project.labels ?? []) : [];
  const scoped = useMemo(
    () =>
      visibleIssues(
        filterToProject(issues, projectId || null),
        showArchived,
      ),
    [issues, projectId, showArchived],
  );
  const filtered = useMemo(() => {
    let next: IssueRecord[] = scoped;
    if (search.trim()) {
      next = filterWithAncestors(next, (issue) =>
        issueMatchesSearch(issue, search),
      );
    }
    if (labelFilter.length > 0) {
      next = filterWithAncestors(next, (issue) =>
        issueMatchesLabelFilter(issue, labelFilter),
      );
    }
    return next;
  }, [scoped, search, labelFilter]);
  const nodes = useMemo(() => {
    const roots = projectBoardRoots(filtered, boardKindFilter);
    return buildTree(filtered, roots);
  }, [filtered, boardKindFilter]);
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
                ? "Epic / Idea \u203a Branch \u203a Commit"
                : unknownProject
                  ? "Project not found"
                  : "Select or create a project"}
            </p>
          </div>
        </div>
        {hasProject ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                openNew({ presetKind: "idea", presetParent: projectId })
              }
            >
              <Lightbulb className="h-4 w-4" />
              New idea
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                openNew({ presetKind: "story", presetParent: projectId })
              }
            >
              <GitBranch className="h-4 w-4" />
              New story
            </Button>
            <Button
              size="sm"
              onClick={() =>
                openNew({ presetKind: "epic", presetParent: projectId })
              }
            >
              <Plus className="h-4 w-4" />
              New epic
            </Button>
          </div>
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
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title or id"
                className="pl-9"
              />
            </div>
            <LabelFilterControl
              catalog={catalog}
              selected={labelFilter}
              onChange={setLabelFilter}
            />
            <div
              className="flex shrink-0 items-center rounded-md border p-0.5"
              role="group"
              aria-label="Filter by kind"
            >
              {BOARD_FILTER_OPTIONS.map(({ value, label, icon: Icon }) => (
                <Button
                  key={value}
                  type="button"
                  variant={boardKindFilter === value ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 px-2"
                  aria-pressed={boardKindFilter === value}
                  onClick={() => setBoardKindFilter(value)}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </Button>
              ))}
            </div>
            <Button
              type="button"
              variant={showArchived ? "secondary" : "outline"}
              size="sm"
              className="shrink-0"
              aria-pressed={showArchived}
              title={
                showArchived
                  ? "Hide archived issues"
                  : "Show archived issues"
              }
              onClick={() => setShowArchived(!showArchived)}
            >
              <Archive className="h-4 w-4" />
              Show archived
            </Button>
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
            ) : (
              <IssueTree
                nodes={nodes}
                derived={derived}
                issues={scoped}
                catalog={catalog}
                projectId={projectId}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
