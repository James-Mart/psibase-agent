import { useMemo } from "react";
import { Link } from "react-router-dom";
import { GitBranch, GitCommitHorizontal } from "lucide-react";
import type { IssuesResponse, IssueRecord } from "@server/schemas";
import { useIssueUiStore } from "../store/use-issue-ui-store";
import { issuePath } from "../lib/links";
import { issueMatchesSearch } from "../lib/search";
import { IssueBadges } from "./issue-badges";
import { EPIC_BASE } from "@server/services/derive";

function ReadyRow({
  issue,
  derived,
}: {
  issue: IssueRecord;
  derived: IssuesResponse["derived"];
}) {
  const Icon = issue.kind === "branch" ? GitBranch : GitCommitHorizontal;
  const context =
    issue.kind === "commit"
      ? `in ${issue.partOf}`
      : `forks from ${derived[issue.id]?.base ?? EPIC_BASE}`;

  return (
    <Link
      to={issuePath(issue.id)}
      className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-accent"
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="truncate text-sm">{issue.title}</span>
      <IssueBadges issue={issue} compact />
      <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
        <span className="font-mono">{context}</span>
        <span className="uppercase tracking-wide">
          {issue.kind === "branch" ? "start branch" : "commit"}
        </span>
      </span>
    </Link>
  );
}

export function ReadyView({ data }: { data: IssuesResponse }) {
  const search = useIssueUiStore((s) => s.search);
  const byId = useMemo(
    () => new Map(data.issues.map((issue) => [issue.id, issue])),
    [data.issues],
  );
  const ready = useMemo(
    () =>
      data.ready
        .map((id) => byId.get(id))
        .filter((issue): issue is IssueRecord => Boolean(issue))
        .filter((issue) => issueMatchesSearch(issue, search)),
    [data.ready, byId, search],
  );

  if (ready.length === 0) {
    return (
      <p className="px-2 py-8 text-center text-sm text-muted-foreground">
        Nothing ready to pick up.
      </p>
    );
  }
  return (
    <div className="flex flex-col">
      {ready.map((issue) => (
        <ReadyRow key={issue.id} issue={issue} derived={data.derived} />
      ))}
    </div>
  );
}
