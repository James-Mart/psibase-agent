import { FIELD_LABELS } from "@server/fields";
import type { IssueDetail } from "@server/schemas";
import { IssueLink } from "./issue-link";
import { MetaRow } from "./meta-row";

const missing = (text: string) => (
  <span className="text-muted-foreground">{text}</span>
);

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
