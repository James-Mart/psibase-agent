import { useMemo, useState, type ReactNode } from "react";
import type {
  IssueDetail,
  IssuePatch,
  MergePolicy,
  ProjectLabel,
} from "@server/schemas";
import {
  FIELD_LABELS,
  KIND_FIELD_KEYS,
  type StoryFormFieldKey,
  type ClearableKey,
  type TaskFieldKey,
  type EpicFieldKey,
  type ProjectFormFieldKey,
} from "@server/fields";
import { hasAttention, hasPartOf, kindHas } from "@server/kind";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMoveStory, useUpdateIssue } from "../api/mutations";
import { useIssuesQuery } from "../api/queries";
import { useDescriptionEditorUpload } from "../hooks/use-description-editor-upload";
import { useExternalEditConflict } from "../hooks/use-external-edit-conflict";
import type { UploadAttachmentMutation } from "../hooks/use-issue-detail-file-upload";
import { DESCRIPTION_EDITOR_ATTR } from "../lib/attachment-files";
import { blockedByFormValue, parseIds } from "../lib/issue-detail-form";
import { ExternalEditConflictBanner } from "./external-edit-conflict-banner";
import {
  assignmentLabelsEqual,
  catalogDraftsFromIssue,
  isLabelAssignableIssue,
  planCatalogLabelsSave,
  sanitizeAssignmentIds,
  type CatalogDraft,
} from "../lib/project-labels";
import { storyPartOfOptions } from "../lib/story-partof-options";
import {
  supportingDocsDraftFromIssue,
  supportingDocsEqual,
  supportingDocsFromDraft,
  type SupportingDocsDraft,
} from "../lib/supporting-docs";
import { AssignmentLabelsEditor } from "./assignment-labels-editor";
import { IssueAttachmentsSection } from "./attachments-panel";
import { IssueMergedField } from "./issue-merged-field";
import { IssueStackedOnField } from "./issue-stacked-on-field";
import { MergePolicySelect } from "./merge-policy-select";
import { PartOfTargetSelect } from "./part-of-target-select";
import { ProjectLabelsEditor } from "./project-labels-editor";
import {
  BranchNameDisplay,
  CommitShaDisplay,
  PrUrlDisplay,
} from "./readonly-git-fields";
import { SupportingDocsEditor } from "./supporting-docs-editor";
import { TaskStatusChips } from "./task-status-chips";
import { WorkspacePathInput } from "./workspace-path-input";

interface FormState {
  title: string;
  description: string;
  workspace: string;
  mergePolicy: MergePolicy;
  labels: CatalogDraft[];
  supportingDocs: SupportingDocsDraft;
  assignedLabels: string[];
  assignee: string;
  needsAttention: boolean;
  attentionReason: string;
  partOf: string;
  blockedBy: string;
}

function formStateFromIssue(
  issue: IssueDetail,
  catalog: ProjectLabel[],
): FormState {
  return {
    title: issue.title,
    description: issue.description,
    workspace: issue.kind === "project" ? issue.workspace ?? "" : "",
    mergePolicy: issue.kind === "project" ? issue.mergePolicy : "manual",
    labels:
      issue.kind === "project" ? catalogDraftsFromIssue(issue.labels) : [],
    supportingDocs:
      issue.kind === "project"
        ? supportingDocsDraftFromIssue(issue.supportingDocs)
        : supportingDocsDraftFromIssue(undefined),
    assignedLabels: isLabelAssignableIssue(issue)
      ? sanitizeAssignmentIds(issue.labels, catalog)
      : [],
    assignee:
      issue.kind === "epic" || issue.kind === "story"
        ? issue.assignee ?? ""
        : "",
    needsAttention: hasAttention(issue) ? issue.needsAttention : false,
    attentionReason: hasAttention(issue) ? issue.attentionReason ?? "" : "",
    partOf: "partOf" in issue ? issue.partOf : "",
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
  catalog,
  onDone,
  upload,
}: {
  issue: IssueDetail;
  catalog: ProjectLabel[];
  onDone: () => void;
  upload?: UploadAttachmentMutation;
}) {
  const update = useUpdateIssue();
  const moveStory = useMoveStory();
  const { data } = useIssuesQuery();
  const [form, setForm] = useState<FormState>(() =>
    formStateFromIssue(issue, catalog),
  );
  const [labelsError, setLabelsError] = useState<string | null>(null);
  const { hasConflict, acknowledge } = useExternalEditConflict(issue);
  const storyParents = useMemo(
    () =>
      issue.kind === "story"
        ? storyPartOfOptions(issue, data?.issues ?? [])
        : [],
    [issue, data?.issues],
  );
  const saving = update.isPending || moveStory.isPending;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const { textareaRef, textareaProps } = useDescriptionEditorUpload(
    upload,
    form.description,
    (value) => set("description", value),
  );

  const reload = () => {
    setForm(formStateFromIssue(issue, catalog));
    setLabelsError(null);
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

    if (issue.kind === "epic" || issue.kind === "story") {
      setClearable("assignee", form.assignee, issue.assignee);
    }

    if (hasAttention(issue)) {
      if (form.needsAttention !== issue.needsAttention)
        patch.needsAttention = form.needsAttention;
      const reason = form.needsAttention
        ? form.attentionReason.trim() || null
        : null;
      if (reason !== (issue.attentionReason ?? null))
        patch.attentionReason = reason;
    }

    if (hasPartOf(issue)) {
      const nextParent = form.partOf.trim();
      if (nextParent && nextParent !== issue.partOf) patch.partOf = nextParent;
    }

    if (issue.kind === "project") {
      setClearable("workspace", form.workspace, issue.workspace);
      if (form.mergePolicy !== issue.mergePolicy)
        patch.mergePolicy = form.mergePolicy;
      const nextDocs = supportingDocsFromDraft(form.supportingDocs);
      if (!supportingDocsEqual(nextDocs, issue.supportingDocs)) {
        patch.supportingDocs = nextDocs;
      }
    }

    if (issue.kind === "epic") {
      const nextBlocked = parseIds(form.blockedBy);
      if (JSON.stringify(nextBlocked) !== JSON.stringify(issue.blockedBy))
        patch.blockedBy = nextBlocked;
    }

    if (isLabelAssignableIssue(issue)) {
      const nextLabels = sanitizeAssignmentIds(form.assignedLabels, catalog);
      if (!assignmentLabelsEqual(issue.labels, nextLabels)) {
        patch.labels = nextLabels;
      }
    }

    return patch;
  };

  const save = async () => {
    const patch = buildPatch();

    if (issue.kind === "project") {
      const result = planCatalogLabelsSave(issue.labels, form.labels);
      if (!result.ok) {
        setLabelsError(result.error);
        return;
      }
      setLabelsError(null);

      for (const labels of result.plan.stagingPatches) {
        try {
          await update.mutateAsync({ id: issue.id, patch: { labels } });
        } catch (err) {
          setLabelsError(
            err instanceof Error ? err.message : "Failed to rename labels",
          );
          return;
        }
      }
      if (result.plan.finalLabels) patch.labels = result.plan.finalLabels;

      if ("workspace" in patch && "supportingDocs" in patch) {
        const workspace = patch.workspace ?? null;
        delete patch.workspace;
        try {
          await update.mutateAsync({ id: issue.id, patch: { workspace } });
        } catch {
          return;
        }
      }
    }

    // Story partOf Project↔Epic moves go through move-story so the whole
    // stackedOn stack reparents under the same integrity rules as DnD/CLI.
    if (issue.kind === "story" && typeof patch.partOf === "string") {
      const target = patch.partOf;
      delete patch.partOf;
      try {
        await moveStory.mutateAsync({ id: issue.id, target });
      } catch {
        return;
      }
    }

    if (Object.keys(patch).length === 0) {
      onDone();
      return;
    }
    update.mutate({ id: issue.id, patch }, { onSuccess: () => onDone() });
  };

  const controls: Record<
    | ProjectFormFieldKey
    | EpicFieldKey
    | StoryFormFieldKey
    | Exclude<TaskFieldKey, "noDiff" | "qa">,
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
    status:
      issue.kind === "task" ? (
        <TaskStatusChips status={issue.status} qa={issue.qa} />
      ) : null,
    commitSha:
      issue.kind === "task" ? (
        <CommitShaDisplay commitSha={issue.commitSha} />
      ) : null,
    branchName:
      issue.kind === "story" ? (
        <BranchNameDisplay branchName={issue.branchName} />
      ) : null,
    stackedOn:
      issue.kind === "story" ? <IssueStackedOnField issue={issue} /> : null,
    blockedBy: (
      <Input
        value={form.blockedBy}
        onChange={(e) => set("blockedBy", e.target.value)}
        className="font-mono"
        placeholder="space-separated epic ids"
      />
    ),
    prUrl: issue.kind === "story" ? <PrUrlDisplay prUrl={issue.prUrl} /> : null,
    merged: issue.kind === "story" ? <IssueMergedField issue={issue} /> : null,
  };

  return (
    <div className="flex flex-col gap-4">
      {hasConflict ? (
        <ExternalEditConflictBanner onReload={reload} onKeep={acknowledge} />
      ) : null}

      <Field label={FIELD_LABELS.title}>
        <Input value={form.title} onChange={(e) => set("title", e.target.value)} />
      </Field>

      <IssueAttachmentsSection issue={issue} upload={upload} />

      <Field label="Description (Markdown)">
        <Textarea
          ref={textareaRef}
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          className="min-h-[280px] font-mono"
          {...{ [DESCRIPTION_EDITOR_ATTR]: "" }}
          {...textareaProps}
        />
      </Field>

      {kindHas(issue.kind, "detailPartOf") ? (
        <Field label={FIELD_LABELS.partOf}>
          {issue.kind === "story" ? (
            <PartOfTargetSelect
              value={form.partOf}
              onValueChange={(value) => set("partOf", value)}
              options={storyParents}
              placeholder="Select Project or Epic"
            />
          ) : (
            <Input
              value={form.partOf}
              onChange={(e) => set("partOf", e.target.value)}
            />
          )}
        </Field>
      ) : null}

      {issue.kind === "epic" || issue.kind === "story" ? (
        <Field label={FIELD_LABELS.assignee}>
          <Input
            value={form.assignee}
            onChange={(e) => set("assignee", e.target.value)}
            placeholder="unassigned"
          />
        </Field>
      ) : issue.kind === "task" ? (
        <Field label={FIELD_LABELS.assignee}>
          {issue.assignee ? (
            <span className="text-sm">{issue.assignee}</span>
          ) : (
            <span className="text-sm text-muted-foreground">unassigned</span>
          )}
        </Field>
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

      {issue.kind === "project" ? (
        <SupportingDocsEditor
          issueId={issue.id}
          draft={form.supportingDocs}
          onChange={(supportingDocs) => set("supportingDocs", supportingDocs)}
        />
      ) : null}

      {issue.kind === "project" ? (
        <ProjectLabelsEditor
          drafts={form.labels}
          onChange={(labels) => {
            setLabelsError(null);
            set("labels", labels);
          }}
          error={labelsError}
        />
      ) : null}

      {isLabelAssignableIssue(issue) ? (
        <AssignmentLabelsEditor
          catalog={catalog}
          selected={form.assignedLabels}
          onChange={(assignedLabels) => set("assignedLabels", assignedLabels)}
        />
      ) : null}

      {hasAttention(issue) ? (
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
        <Button variant="ghost" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={() => void save()} disabled={saving || hasConflict}>
          Save
        </Button>
      </div>
    </div>
  );
}
