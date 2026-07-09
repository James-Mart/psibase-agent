import { useState, type ReactNode } from "react";
import {
  COMMIT_STATUSES,
  type CommitStatus,
  type IssueDetail,
  type IssuePatch,
} from "@server/schemas";
import {
  FIELD_LABELS,
  KIND_FIELD_KEYS,
  type BranchFieldKey,
  type CommitFieldKey,
} from "@server/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpdateIssue } from "../api/mutations";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function parseIds(text: string): string[] {
  const seen = new Set<string>();
  for (const token of text.split(/[\s,]+/)) {
    if (token) seen.add(token);
  }
  return [...seen];
}

export function IssueDetailEdit({
  issue,
  onDone,
}: {
  issue: IssueDetail;
  onDone: () => void;
}) {
  const update = useUpdateIssue();

  const [title, setTitle] = useState(issue.title);
  const [description, setDescription] = useState(issue.description);
  const [assignee, setAssignee] = useState(issue.assignee ?? "");
  const [needsAttention, setNeedsAttention] = useState(issue.needsAttention);
  const [attentionReason, setAttentionReason] = useState(
    issue.attentionReason ?? "",
  );
  const [partOf, setPartOf] = useState("partOf" in issue ? issue.partOf : "");

  const [status, setStatus] = useState<CommitStatus>(
    issue.kind === "commit" ? issue.status : "todo",
  );
  const [commitSha, setCommitSha] = useState(
    issue.kind === "commit" ? issue.commitSha ?? "" : "",
  );

  const [branchName, setBranchName] = useState(
    issue.kind === "branch" ? issue.branchName ?? "" : "",
  );
  const [stackedOn, setStackedOn] = useState(
    issue.kind === "branch" ? issue.stackedOn ?? "" : "",
  );
  const [prUrl, setPrUrl] = useState(
    issue.kind === "branch" ? issue.prUrl ?? "" : "",
  );
  const [merged, setMerged] = useState(
    issue.kind === "branch" ? issue.merged : false,
  );
  const [blockedBy, setBlockedBy] = useState(
    issue.kind === "branch" ? issue.blockedBy.join(" ") : "",
  );

  const buildPatch = (): IssuePatch => {
    const patch: IssuePatch = {};
    const setClearable = (
      key: "assignee" | "commitSha" | "branchName" | "stackedOn" | "prUrl",
      value: string,
      current: string | undefined,
    ) => {
      const next = value.trim();
      if (next === (current ?? "")) return;
      patch[key] = next === "" ? null : next;
    };

    const trimmedTitle = title.trim();
    if (trimmedTitle && trimmedTitle !== issue.title) patch.title = trimmedTitle;
    if (description !== issue.description) patch.description = description;

    setClearable("assignee", assignee, issue.assignee);

    if (needsAttention !== issue.needsAttention)
      patch.needsAttention = needsAttention;
    const reason = needsAttention ? attentionReason.trim() || null : null;
    if (reason !== (issue.attentionReason ?? null))
      patch.attentionReason = reason;

    if ("partOf" in issue) {
      const nextParent = partOf.trim();
      if (nextParent && nextParent !== issue.partOf) patch.partOf = nextParent;
    }

    if (issue.kind === "commit") {
      if (status !== issue.status) patch.status = status;
      setClearable("commitSha", commitSha, issue.commitSha);
    }

    if (issue.kind === "branch") {
      setClearable("branchName", branchName, issue.branchName);
      setClearable("stackedOn", stackedOn, issue.stackedOn);
      setClearable("prUrl", prUrl, issue.prUrl);
      if (merged !== issue.merged) patch.merged = merged;
      const nextBlocked = parseIds(blockedBy);
      if (JSON.stringify(nextBlocked) !== JSON.stringify(issue.blockedBy))
        patch.blockedBy = nextBlocked;
    }

    return patch;
  };

  const save = () => {
    const patch = buildPatch();
    if (Object.keys(patch).length === 0) {
      onDone();
      return;
    }
    update.mutate({ id: issue.id, patch }, { onSuccess: () => onDone() });
  };

  const controls: Record<BranchFieldKey | CommitFieldKey, ReactNode> = {
    status: (
      <Select value={status} onValueChange={(v) => setStatus(v as CommitStatus)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {COMMIT_STATUSES.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ),
    commitSha: (
      <Input
        value={commitSha}
        onChange={(e) => setCommitSha(e.target.value)}
        className="font-mono"
      />
    ),
    branchName: (
      <Input
        value={branchName}
        onChange={(e) => setBranchName(e.target.value)}
        className="font-mono"
      />
    ),
    stackedOn: (
      <Input
        value={stackedOn}
        onChange={(e) => setStackedOn(e.target.value)}
        className="font-mono"
        placeholder="branch id"
      />
    ),
    blockedBy: (
      <Input
        value={blockedBy}
        onChange={(e) => setBlockedBy(e.target.value)}
        className="font-mono"
        placeholder="space-separated branch ids"
      />
    ),
    prUrl: <Input value={prUrl} onChange={(e) => setPrUrl(e.target.value)} />,
    merged: (
      <label className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          className="h-4 w-4 accent-primary"
          checked={merged}
          onChange={(e) => setMerged(e.target.checked)}
        />
        {merged ? "merged" : "not merged"}
      </label>
    ),
  };

  return (
    <div className="flex flex-col gap-4">
      <Field label={FIELD_LABELS.title}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>

      <Field label="Description (Markdown)">
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="min-h-[280px] font-mono"
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        {"partOf" in issue ? (
          <Field label={FIELD_LABELS.partOf}>
            <Input value={partOf} onChange={(e) => setPartOf(e.target.value)} />
          </Field>
        ) : null}
        <Field label={FIELD_LABELS.assignee}>
          <Input
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            placeholder="unassigned"
          />
        </Field>
      </div>

      {KIND_FIELD_KEYS[issue.kind].length > 0 ? (
        <div className="grid grid-cols-2 gap-4">
          {KIND_FIELD_KEYS[issue.kind].map((key) => (
            <Field key={key} label={FIELD_LABELS[key]}>
              {controls[key]}
            </Field>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 rounded-md border p-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={needsAttention}
            onChange={(e) => setNeedsAttention(e.target.checked)}
          />
          {FIELD_LABELS.needsAttention}
        </label>
        {needsAttention ? (
          <Input
            value={attentionReason}
            onChange={(e) => setAttentionReason(e.target.value)}
            placeholder="Reason"
          />
        ) : null}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone} disabled={update.isPending}>
          Cancel
        </Button>
        <Button onClick={save} disabled={update.isPending}>
          Save
        </Button>
      </div>
    </div>
  );
}
