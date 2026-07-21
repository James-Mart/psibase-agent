import { useCallback, useRef, useState } from "react";
import type { IssueDetail } from "@server/schemas";
import { useUpdateIssue } from "../api/mutations";
import { useDescriptionEditorUpload } from "../hooks/use-description-editor-upload";
import type { UploadAttachmentMutation } from "../hooks/use-issue-detail-file-upload";
import { DESCRIPTION_EDITOR_ATTR } from "../lib/attachment-files";
import { supportsAttachments } from "../lib/attachments";
import { InlineField } from "./inline-field";
import { Markdown } from "./markdown";

export function IssueDescriptionField({
  issue,
  upload,
}: {
  issue: IssueDetail;
  upload?: UploadAttachmentMutation;
}) {
  const update = useUpdateIssue();
  const attach = supportsAttachments(issue.kind);
  const [draft, setDraft] = useState(issue.description);
  const setDraftRef = useRef<((next: string) => void) | null>(null);

  const applyDraft = useCallback((next: string) => {
    setDraft(next);
    setDraftRef.current?.(next);
  }, []);

  const { textareaRef, textareaProps, isUploading } = useDescriptionEditorUpload(
    upload,
    draft,
    applyDraft,
  );

  return (
    <InlineField
      value={issue.description}
      issue={issue}
      multiline
      richDisplay
      emptyLabel="No description."
      inputClassName="min-h-[280px]"
      textareaRef={textareaRef}
      textareaProps={textareaProps}
      textareaAttrs={{ [DESCRIPTION_EDITOR_ATTR]: "" }}
      shouldDeferBlurCommit={() => isUploading}
      onDraftChange={setDraft}
      setDraftRef={setDraftRef}
      onSave={async (next) => {
        if (next === issue.description) return;
        await update.mutateAsync({
          id: issue.id,
          patch: { description: next },
        });
      }}
      renderDisplayContent={(value) =>
        value.trim() ? (
          <Markdown issueId={attach ? issue.id : undefined}>{value}</Markdown>
        ) : (
          <p className="text-sm text-muted-foreground">No description.</p>
        )
      }
    />
  );
}
