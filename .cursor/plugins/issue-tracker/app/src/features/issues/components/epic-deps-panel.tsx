import type { DerivedState, IssueDetail, IssueRecord } from "@server/schemas";
import { epicsBlockedBy } from "@server/order";
import { epicIsDone } from "@server/services/derive";
import { useIssuesQuery } from "../api/queries";
import { IssueLink } from "./issue-link";
import { MetaRow as Row } from "./meta-row";
import { EPIC_STATUS_CLASS, EPIC_STATUS_LABEL } from "../lib/derived";

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
      {state?.epicStatus ? (
        <Row
          label="Status"
          value={
            <span className={EPIC_STATUS_CLASS[state.epicStatus]}>
              {EPIC_STATUS_LABEL[state.epicStatus]}
            </span>
          }
        />
      ) : null}
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
        label="Blocked by"
        value={
          issue.blockedBy.length > 0 ? (
            <span className="flex flex-col gap-1">
              {issue.blockedBy.map((depId) => {
                const done = epicIsDone(derived[depId]);
                return (
                  <span key={depId} className="flex items-center gap-2">
                    <IssueLink
                      id={depId}
                      className="font-mono text-primary hover:underline"
                    >
                      {depId}
                    </IssueLink>
                    <span
                      className={
                        done
                          ? "text-xs [color:hsl(var(--success))]"
                          : "text-xs [color:hsl(var(--warning))]"
                      }
                    >
                      {done ? "done" : "pending"}
                    </span>
                  </span>
                );
              })}
            </span>
          ) : (
            <span className="text-muted-foreground">nothing</span>
          )
        }
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
