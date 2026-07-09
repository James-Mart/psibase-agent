import { FIELD_LABELS } from "@server/fields";
import type { IssueDetail } from "@server/schemas";
import { IssueLink } from "./issue-link";
import { MetaRow } from "./meta-row";

export function IssueMetaPanel({ issue }: { issue: IssueDetail }) {
  if (!("partOf" in issue)) return null;
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-card p-4">
      <MetaRow
        label={FIELD_LABELS.partOf}
        value={
          <IssueLink id={issue.partOf} className="font-mono text-primary hover:underline">
            {issue.partOf}
          </IssueLink>
        }
      />
    </div>
  );
}
