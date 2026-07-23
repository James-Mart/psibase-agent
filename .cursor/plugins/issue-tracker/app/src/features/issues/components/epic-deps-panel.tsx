import { FIELD_LABELS } from "@server/fields";
import type { DerivedState, IssueDetail, IssueRecord } from "@server/schemas";
import { epicsBlockedBy } from "@server/order";
import { useIssuesQuery } from "../api/queries";
import { IssueBlockedByField } from "./issue-blocked-by-field";
import { IssueLink } from "./issue-link";
import { MetaRow as Row } from "./meta-row";

function DepsPanel({
  issue,
  issues,
  derived,
}: {
  issue: Extract<IssueDetail, { kind: "epic" }>;
  issues: IssueRecord[];
  derived: Record<string, DerivedState>;
}) {
  const state = derived[issue.id];
  const blocking = epicsBlockedBy(issue.id, issues);

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-card p-4">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Dependencies
      </div>
      <Row
        label="Blocked"
        value={
          state?.blocked ? (
            <span className="[color:hsl(var(--warning))]">yes</span>
          ) : (
            <span className="text-muted-foreground">no</span>
          )
        }
      />
      <Row
        label={FIELD_LABELS.blockedBy}
        value={<IssueBlockedByField issue={issue} derived={derived} />}
      />
      {blocking.length > 0 ? (
        <Row
          label="Blocking"
          value={
            <span className="flex flex-wrap gap-x-2">
              {blocking.map((e) => (
                <IssueLink
                  key={e.id}
                  id={e.id}
                  className="font-mono text-primary hover:underline"
                >
                  {e.id}
                </IssueLink>
              ))}
            </span>
          }
        />
      ) : null}
    </div>
  );
}

export function EpicDepsPanel({
  issue,
}: {
  issue: Extract<IssueDetail, { kind: "epic" }>;
}) {
  const { data } = useIssuesQuery();
  if (!data) return null;
  return (
    <DepsPanel issue={issue} issues={data.issues} derived={data.derived} />
  );
}
