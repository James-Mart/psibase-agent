import { useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import {
  COMMIT_STATUSES,
  type CommitStatus,
  type IssueDetail,
  type IssuePatch,
  type MergePolicy,
} from "@server/schemas";
import {
  FIELD_LABELS,
  KIND_FIELD_KEYS,
  type BranchFieldKey,
  type ClearableKey,
  type CommitFieldKey,
  type EpicFieldKey,
  type ProjectFieldKey,
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
import { useExternalEditConflict } from "../hooks/use-external-edit-conflict";
import { blockedByFormValue, parseIds } from "../lib/issue-detail-form";
import { MergePolicySelect } from "./merge-policy-select";
import { WorkspacePathInput } from "./workspace-path-input";

interface FormState {
  title: string;
  description: string;
  workspace: string;
  mergePolicy: MergePolicy;
  assignee: string;
  needsAttention: boolean;
  attentionReason: string;
  partOf: string;
  status: CommitStatus;
  commitSha: string;
  branchName: string;
  stackedOn: string;
  prUrl: string;
  merged: boolean;
  blockedBy: string;
}

function formStateFromIssue(issue: IssueDetail): FormState {
  return {
    title: issue.title,
    description: issue.description,
    workspace: issue.kind === "project" ? issue.workspace ?? "" : "",
    mergePolicy: issue.kind === "project" ? issue.mergePolicy : "manual",
    assignee: "assignee" in issue ? issue.assignee ?? "" : "",
    needsAttention: "needsAttention" in issue ? issue.needsAttention : false,
    attentionReason:
      "attentionReason" in issue ? issue.attentionReason ?? "" : "",
    partOf: "partOf" in issue ? issue.partOf : "",
    status: issue.kind === "commit" ? issue.status : "todo",
    commitSha: issue.kind === "commit" ? issue.commitSha ?? "" : "",
    branchName: issue.kind === "branch" ? issue.branchName ?? "" : "",
    stackedOn: issue.kind === "branch" ? issue.stackedOn ?? "" : "",
    prUrl: issue.kind === "branch" ? issue.prUrl ?? "" : "",
    merged: issue.kind === "branch" ? issue.merged : false,
    blockedBy: blockedByFormValue(issue),
  };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function IssueDetailEdit({
  issue,
  onDone,
}: {
  issue: IssueDetail;
  onDone: () => void;
}) {
  const update = useUpdateIssue();
  const [form, setForm] = useState<FormState>(() => formStateFromIssue(issue));
  const { hasConflict, acknowledge } = useExternalEditConflict(issue);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const reload = () => {
    setForm(formStateFromIssue(issue));
    acknowledge();
  };

  const buildPatch = (): IssuePatch => {
    const patch: IssuePatch = {};
    const setClearable = (
      key: ClearableKey,
      value: string,
      current: string | undefined,
    ) => {
      const next = value.trim();
      if (next === (current ?? "")) return;
      patch[key] = next === "" ? null : next;
    };

    const trimmedTitle = form.title.trim();
    if (trimmedTitle && trimmedTitle !== issue.title) patch.title = trimmedTitle;
    if (form.description !== issue.description)
      patch.description = form.description;

    // A Project carries none of the assignee/attention fields.
    if (issue.kind !== "project") {
      setClearable("assignee", form.assignee, issue.assignee);

      if (form.needsAttention !== issue.needsAttention)
        patch.needsAttention = form.needsAttention;
      const reason = form.needsAttention
        ? form.attentionReason.trim() || null
        : null;
      if (reason !== (issue.attentionReason ?? null))
        patch.attentionReason = reason;
    }

    if ("partOf" in issue) {
      const nextParent = form.partOf.trim();
      if (nextParent && nextParent !== issue.partOf) patch.partOf = nextParent;
    }

    if (issue.kind === "project") {
      setClearable("workspace", form.workspace, issue.workspace);
      if (form.mergePolicy !== issue.mergePolicy)
        patch.mergePolicy = form.mergePolicy;
    }

    if (issue.kind === "commit") {
      if (form.status !== issue.status) patch.status = form.status;
      setClearable("commitSha", form.commitSha, issue.commitSha);
    }

    if (issue.kind === "epic") {
      const nextBlocked = parseIds(form.blockedBy);
      if (JSON.stringify(nextBlocked) !== JSON.stringify(issue.blockedBy))
        patch.blockedBy = nextBlocked;
    }

    if (issue.kind === "branch") {
      setClearable("branchName", form.branchName, issue.branchName);
      setClearable("stackedOn", form.stackedOn, issue.stackedOn);
      setClearable("prUrl", form.prUrl, issue.prUrl);
      if (form.merged !== issue.merged) patch.merged = form.merged;
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

  const controls: Record<
    ProjectFieldKey | EpicFieldKey | BranchFieldKey | CommitFieldKey,
    ReactNode
  > = {
    workspace: (
      <WorkspacePathInput
        value={form.workspace}
        onChange={(value) => set("workspace", value)}
      />
    ),
    mergePolicy: (
      <MergePolicySelect
        value={form.mergePolicy}
        onChange={(value) => set("mergePolicy", value)}
      />
    ),
    status: (
      <Select
        value={form.status}
        onValueChange={(v) => set("status", v as CommitStatus)}
      >
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
        value={form.commitSha}
        onChange={(e) => set("commitSha", e.target.value)}
        className="font-mono"
      />
    ),
    branchName: (
      <Input
        value={form.branchName}
        onChange={(e) => set("branchName", e.target.value)}
        className="font-mono"
      />
    ),
    stackedOn: (
      <Input
        value={form.stackedOn}
        onChange={(e) => set("stackedOn", e.target.value)}
        className="font-mono"
        placeholder="branch id"
      />
    ),
    blockedBy: (
      <Input
        value={form.blockedBy}
        onChange={(e) => set("blockedBy", e.target.value)}
        className="font-mono"
        placeholder="space-separated epic ids"
      />
    ),
    prUrl: (
      <Input value={form.prUrl} onChange={(e) => set("prUrl", e.target.value)} />
    ),
    merged: (
      <label className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          className="h-4 w-4 accent-primary"
          checked={form.merged}
          onChange={(e) => set("merged", e.target.checked)}
        />
        {form.merged ? "merged" : "not merged"}
      </label>
    ),
  };

  return (
    <div className="flex flex-col gap-4">
      {hasConflict ? (
        <div className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium [color:hsl(var(--warning))]">
            <AlertTriangle className="h-4 w-4" />
            This issue changed on disk while you were editing.
          </div>
          <p className="text-muted-foreground">
            Reload to discard your edits and load the disk version, or keep your
            edits (saving will overwrite the disk changes).
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={reload}>
              Reload from disk
            </Button>
            <Button size="sm" variant="ghost" onClick={acknowledge}>
              Keep my edits
            </Button>
          </div>
        </div>
      ) : null}

      <Field label={FIELD_LABELS.title}>
        <Input value={form.title} onChange={(e) => set("title", e.target.value)} />
      </Field>

      <Field label="Description (Markdown)">
        <Textarea
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          className="min-h-[280px] font-mono"
        />
      </Field>

      {issue.kind !== "project" ? (
        <div className="grid grid-cols-2 gap-4">
          <Field label={FIELD_LABELS.partOf}>
            <Input
              value={form.partOf}
              onChange={(e) => set("partOf", e.target.value)}
            />
          </Field>
          <Field label={FIELD_LABELS.assignee}>
            <Input
              value={form.assignee}
              onChange={(e) => set("assignee", e.target.value)}
              placeholder="unassigned"
            />
          </Field>
        </div>
      ) : null}

      {KIND_FIELD_KEYS[issue.kind].length > 0 ? (
        <div className="grid grid-cols-2 gap-4">
          {KIND_FIELD_KEYS[issue.kind].map((key) => (
            <Field key={key} label={FIELD_LABELS[key]}>
              {controls[key]}
            </Field>
          ))}
        </div>
      ) : null}

      {issue.kind !== "project" ? (
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={form.needsAttention}
              onChange={(e) => set("needsAttention", e.target.checked)}
            />
            {FIELD_LABELS.needsAttention}
          </label>
          {form.needsAttention ? (
            <Input
              value={form.attentionReason}
              onChange={(e) => set("attentionReason", e.target.value)}
              placeholder="Reason"
            />
          ) : null}
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone} disabled={update.isPending}>
          Cancel
        </Button>
        <Button onClick={save} disabled={update.isPending || hasConflict}>
          Save
        </Button>
      </div>
    </div>
  );
}
