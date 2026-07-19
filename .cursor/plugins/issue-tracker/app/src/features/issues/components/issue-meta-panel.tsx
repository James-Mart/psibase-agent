import { FIELD_LABELS, KIND_FIELD_KEYS } from "@server/fields";
import { kindHas } from "@server/kind";
import type { IssueDetail } from "@server/schemas";
import { projectMetaValue } from "../lib/issue-detail-form";
import { IssueLink } from "./issue-link";
import { MetaRow } from "./meta-row";

export function IssueMetaPanel({ issue }: { issue: IssueDetail }) {
  const rows =
    issue.kind === "project"
      ? KIND_FIELD_KEYS.project.map((key) => {
          const meta = projectMetaValue(issue, key);
          return (
            <MetaRow
              key={key}
              label={FIELD_LABELS[key]}
              value={
                <span
                  className={
                    meta.mono
                      ? "font-mono"
                      : meta.muted
                        ? "text-muted-foreground"
                        : undefined
                  }
                >
                  {meta.text}
                </span>
              }
            />
          );
        })
      : kindHas(issue.kind, "detailPartOf") && "partOf" in issue
        ? [
            <MetaRow
              key="partOf"
              label={FIELD_LABELS.partOf}
              value={
                <IssueLink
                  id={issue.partOf}
                  className="font-mono text-primary hover:underline"
                >
                  {issue.partOf}
                </IssueLink>
              }
            />,
          ]
        : [];

  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-card p-4">
      {rows}
    </div>
  );
}
