import type { ReactNode } from "react";
import {
  BRANCH_FIELD_KEYS,
  COMMIT_FIELD_KEYS,
  FIELD_LABELS,
  type BranchFieldKey,
  type CommitFieldKey,
} from "@server/fields";
import type { IssueDetail } from "@server/schemas";
import { IssueLink } from "./issue-link";

type BranchDetail = Extract<IssueDetail, { kind: "branch" }>;
type CommitDetail = Extract<IssueDetail, { kind: "commit" }>;

function MetaRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{value}</span>
    </div>
  );
}

const mono = (value: string) => <span className="font-mono">{value}</span>;
const missing = (text: string) => (
  <span className="text-muted-foreground">{text}</span>
);

function branchRow(issue: BranchDetail, key: BranchFieldKey): ReactNode | null {
  switch (key) {
    case "branchName":
      return issue.branchName ? mono(issue.branchName) : missing("not created");
    case "stackedOn":
      return issue.stackedOn ? (
        <IssueLink id={issue.stackedOn} className="font-mono text-primary hover:underline">
          {issue.stackedOn}
        </IssueLink>
      ) : null;
    case "blockedBy":
      return issue.blockedBy.length > 0 ? (
        <span className="flex flex-wrap gap-x-2">
          {issue.blockedBy.map((id) => (
            <IssueLink key={id} id={id} className="font-mono text-primary hover:underline">
              {id}
            </IssueLink>
          ))}
        </span>
      ) : null;
    case "prUrl":
      return issue.prUrl ? (
        <a href={issue.prUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
          {issue.prUrl}
        </a>
      ) : null;
    case "merged":
      return issue.merged ? "yes" : "no";
  }
}

function commitRow(issue: CommitDetail, key: CommitFieldKey): ReactNode | null {
  switch (key) {
    case "status":
      return issue.status;
    case "commitSha":
      return issue.commitSha ? mono(issue.commitSha) : null;
  }
}

export function IssueMetaPanel({ issue }: { issue: IssueDetail }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-card p-4">
      {"partOf" in issue ? (
        <MetaRow
          label={FIELD_LABELS.partOf}
          value={
            <IssueLink id={issue.partOf} className="font-mono text-primary hover:underline">
              {issue.partOf}
            </IssueLink>
          }
        />
      ) : null}
      <MetaRow
        label={FIELD_LABELS.assignee}
        value={issue.assignee ?? missing("unassigned")}
      />
      {issue.kind === "branch"
        ? BRANCH_FIELD_KEYS.map((key) => {
            const value = branchRow(issue, key);
            return value === null ? null : (
              <MetaRow key={key} label={FIELD_LABELS[key]} value={value} />
            );
          })
        : null}
      {issue.kind === "commit"
        ? COMMIT_FIELD_KEYS.map((key) => {
            const value = commitRow(issue, key);
            return value === null ? null : (
              <MetaRow key={key} label={FIELD_LABELS[key]} value={value} />
            );
          })
        : null}
      {issue.needsAttention ? (
        <MetaRow
          label="Attention"
          value={
            <span className="[color:hsl(var(--warning))]">
              {issue.attentionReason ?? "needs attention"}
            </span>
          }
        />
      ) : null}
    </div>
  );
}
