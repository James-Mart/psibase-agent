import { useMemo } from "react";
import { GitCommitHorizontal, GitPullRequest } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import type { IssueDetail, IssueRecord } from "@server/schemas";
import { bySequence } from "@server/order";
import { CHIP_UNSET, FIELD_LABELS } from "@server/fields";
import { useIssuesQuery } from "../api/queries";
import { issuePath } from "../lib/links";
import { IssueLink } from "./issue-link";
import { MetaRow as Row } from "./meta-row";
import { StoryAxisChips, storyAxesVisible } from "./axis-chips";
import { TaskStatusChips } from "./task-status-chips";

function BranchPanel({
  issue,
  issues,
  derived,
}: {
  issue: Extract<IssueDetail, { kind: "story" }>;
  issues: IssueRecord[];
  derived: ReturnType<typeof useIssuesQuery>["data"];
}) {
  const { projectId = "" } = useParams();
  const state = derived?.derived[issue.id];
  const stackedOnHere = issues.filter(
    (i) => i.kind === "story" && i.stackedOn === issue.id,
  );
  const commits = issues
    .filter((i) => i.kind === "task" && i.partOf === issue.id)
    .sort(bySequence);

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-card p-4">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Git / stack
      </div>
      {storyAxesVisible(state?.storyStatus, issue.specReview, issue.retro) ? (
        <Row
          label="Status"
          value={
            <StoryAxisChips
              storyStatus={state?.storyStatus}
              specReview={issue.specReview}
              retro={issue.retro}
            />
          }
        />
      ) : null}
      <Row
        label={FIELD_LABELS.mergeBase}
        value={
          <span className="font-mono">
            {state?.mergeBase ?? CHIP_UNSET}
          </span>
        }
      />
      <Row
        label="Stacked on"
        value={
          issue.stackedOn ? (
            <IssueLink id={issue.stackedOn} className="font-mono text-primary hover:underline">
              {issue.stackedOn}
            </IssueLink>
          ) : (
            <span className="text-muted-foreground">(root)</span>
          )
        }
      />
      {stackedOnHere.length > 0 ? (
        <Row
          label="Stacked here"
          value={
            <span className="flex flex-wrap gap-x-2">
              {stackedOnHere.map((b) => (
                <IssueLink key={b.id} id={b.id} className="font-mono text-primary hover:underline">
                  {b.id}
                </IssueLink>
              ))}
            </span>
          }
        />
      ) : null}
      <Row
        label="PR"
        value={
          issue.prUrl ? (
            <a
              href={issue.prUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <GitPullRequest className="h-3.5 w-3.5" />
              {issue.prUrl}
            </a>
          ) : (
            <span className="text-muted-foreground">no PR</span>
          )
        }
      />
      <Row label="Merged" value={issue.merged ? "yes" : "no"} />
      <Row
        label="Commits"
        value={
          commits.length > 0 ? (
            <span className="flex flex-col gap-1">
              {commits.map((c) => (
                <Link
                  key={c.id}
                  to={issuePath(projectId, c.id)}
                  className="flex items-center gap-2 hover:underline"
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
          ) : (
            <span className="text-muted-foreground">none</span>
          )
        }
      />
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
  const branch = issues.find((i) => i.id === issue.partOf);
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-card p-4">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Git / stack
      </div>
      <Row
        label="Story"
        value={
          <IssueLink id={issue.partOf} className="font-mono text-primary hover:underline">
            {issue.partOf}
          </IssueLink>
        }
      />
      {branch?.kind === "story" && branch.branchName ? (
        <Row label="Branch name" value={<span className="font-mono">{branch.branchName}</span>} />
      ) : null}
      <Row label="Status" value={<TaskStatusChips status={issue.status} qa={issue.qa} />} />
      <Row
        label="Commit SHA"
        value={
          issue.commitSha ? (
            <span className="font-mono">{issue.commitSha}</span>
          ) : (
            <span className="text-muted-foreground">not committed</span>
          )
        }
      />
    </div>
  );
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
