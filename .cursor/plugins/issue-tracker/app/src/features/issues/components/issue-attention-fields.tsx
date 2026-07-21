import type { IssueDetail } from "@server/schemas";
import { useUpdateIssue } from "../api/mutations";
import { useIssuePatchAction } from "../hooks/use-issue-patch-action";
import { InlineField } from "./inline-field";

export function IssueNeedsAttentionField({
  issue,
}: {
  issue: Extract<IssueDetail, { kind: "epic" | "story" | "task" }>;
}) {
  const update = useUpdateIssue();
  const { error, saving, run } = useIssuePatchAction();

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label className="flex h-7 items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 accent-primary"
          checked={issue.needsAttention}
          disabled={saving}
          onChange={(e) => {
            const needsAttention = e.target.checked;
            if (needsAttention === issue.needsAttention) return;
            void run(async () => {
              await update.mutateAsync({
                id: issue.id,
                patch: needsAttention
                  ? { needsAttention: true }
                  : { needsAttention: false, attentionReason: null },
              });
            });
          }}
        />
        {issue.needsAttention ? "on" : "off"}
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

export function IssueAttentionReasonField({
  issue,
}: {
  issue: Extract<IssueDetail, { kind: "epic" | "story" | "task" }>;
}) {
  const update = useUpdateIssue();

  return (
    <InlineField
      value={issue.attentionReason ?? ""}
      issue={issue}
      emptyLabel="no reason"
      onSave={async (next) => {
        const trimmed = next.trim();
        const current = issue.attentionReason ?? "";
        if (trimmed === current) return;
        await update.mutateAsync({
          id: issue.id,
          patch: { attentionReason: trimmed === "" ? null : trimmed },
        });
      }}
    />
  );
}
