import { useMemo } from "react";
import { AlertTriangle, Plus, Search } from "lucide-react";
import type { IssueRecord } from "@server/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useIssuesQuery } from "../api/queries";
import { IssueTree } from "./issue-tree";
import { buildTree, parentOf } from "../lib/build-tree";
import { useIssueUiStore } from "../store/use-issue-ui-store";

function filterWithAncestors(
  issues: IssueRecord[],
  query: string,
): IssueRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return issues;

  const byId = new Map(issues.map((issue) => [issue.id, issue]));
  const keep = new Set<string>();
  for (const issue of issues) {
    const hit =
      issue.title.toLowerCase().includes(q) ||
      issue.id.toLowerCase().includes(q);
    if (!hit) continue;
    let current: IssueRecord | undefined = issue;
    while (current && !keep.has(current.id)) {
      keep.add(current.id);
      const parent = parentOf(current);
      current = parent ? byId.get(parent) : undefined;
    }
  }
  return issues.filter((issue) => keep.has(issue.id));
}

export function TreePage() {
  const { data, isLoading, error } = useIssuesQuery();
  const openNew = useIssueUiStore((s) => s.openNew);
  const search = useIssueUiStore((s) => s.search);
  const setSearch = useIssueUiStore((s) => s.setSearch);

  const issues = data?.issues ?? [];
  const filtered = useMemo(
    () => filterWithAncestors(issues, search),
    [issues, search],
  );
  const nodes = useMemo(() => buildTree(filtered), [filtered]);
  const problems = data?.problems ?? [];

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-4 px-6 py-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Issue Tracker</h1>
          <p className="text-sm text-muted-foreground">
            Epic &rsaquo; Branch &rsaquo; Commit
          </p>
        </div>
        <Button size="sm" onClick={() => openNew()}>
          <Plus className="h-4 w-4" />
          New
        </Button>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title or id"
          className="pl-9"
        />
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
          <IssueTree nodes={nodes} />
        )}
      </div>
    </div>
  );
}
