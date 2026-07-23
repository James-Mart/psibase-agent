import { useMemo } from "react";
import { GitCommitHorizontal } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import type { IssueDetail, IssueRecord } from "@server/schemas";
import { bySequence } from "@server/order";
import { useIssuesQuery } from "../api/queries";
import { issuePath } from "../lib/links";
import { CompactMetaItem } from "./compact-meta";
import { IssueLink } from "./issue-link";
import {
  StoryGitMetaScalars,
  TaskGitMetaScalars,
} from "./issue-git-meta-scalars";
import { TaskStatusChips } from "./task-status-chips";

function StoryStackBody({
  issue,
  issues,
}: {
  issue: Extract<IssueDetail, { kind: "story" }>;
  issues: IssueRecord[];
}) {
  const { projectId = "" } = useParams();
  const stackedOnHere = issues.filter(
    (i) => i.kind === "story" && i.stackedOn === issue.id,
  );
  const commits = issues
    .filter((i) => i.kind === "task" && i.partOf === issue.id)
    .sort(bySequence);

  if (stackedOnHere.length === 0 && commits.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5">
      {stackedOnHere.length > 0 ? (
        <CompactMetaItem
          label="Stacked here"
          value={
            <span className="flex min-w-0 flex-wrap gap-x-2">
              {stackedOnHere.map((b) => (
                <IssueLink
                  key={b.id}
                  id={b.id}
                  className="font-mono text-[13px] text-primary hover:underline"
                >
                  {b.id}
                </IssueLink>
              ))}
            </span>
          }
        />
      ) : null}
      {commits.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-sm">Commits</span>
          <span className="flex flex-col gap-1">
            {commits.map((c) => (
              <Link
                key={c.id}
                to={issuePath(projectId, c.id)}
                className="flex items-center gap-2 text-sm hover:underline"
              >
                <GitCommitHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate">{c.title}</span>
                {c.kind === "task" ? (
                  <TaskStatusChips
                    status={c.status}
                    qa={c.qa}
                    className="ml-auto"
                  />
                ) : null}
              </Link>
            ))}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function BranchPanel({
  issue,
  issues,
  derived,
}: {
  issue: Extract<IssueDetail, { kind: "story" }>;
  issues: IssueRecord[];
  derived: ReturnType<typeof useIssuesQuery>["data"];
}) {
  const state = derived?.derived[issue.id];
  return (
    <div className="flex flex-col gap-2">
      <StoryGitMetaScalars issue={issue} mergeBase={state?.mergeBase} />
      <StoryStackBody issue={issue} issues={issues} />
    </div>
  );
}

function CommitPanel({
  issue,
  issues,
}: {
  issue: Extract<IssueDetail, { kind: "task" }>;
  issues: IssueRecord[];
}) {
  return <TaskGitMetaScalars issue={issue} issues={issues} />;
}

export function GitStackPanel({ issue }: { issue: IssueDetail }) {
  const { data } = useIssuesQuery();
  const issues = useMemo(() => data?.issues ?? [], [data?.issues]);
  if (!data) return null;
  if (issue.kind === "story") {
    return <BranchPanel issue={issue} issues={issues} derived={data} />;
  }
  if (issue.kind === "task") {
    return <CommitPanel issue={issue} issues={issues} />;
  }
  return null;
}
