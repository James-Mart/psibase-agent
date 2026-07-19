import { useRef } from "react";
import { Download, Paperclip, Trash2, Upload } from "lucide-react";
import type { IssueDetail } from "@server/schemas";
import { Button } from "@/components/ui/button";
import { useAttachmentsQuery } from "../api/queries";
import { useDeleteAttachment } from "../api/mutations";
import type { UploadAttachmentMutation } from "../hooks/use-issue-detail-file-upload";
import {
  attachmentsApiPath,
  formatAttachmentSize,
  supportsAttachments,
} from "../lib/attachments";

export function IssueAttachmentsSection({
  issue,
  upload,
}: {
  issue: IssueDetail;
  upload?: UploadAttachmentMutation;
}) {
  if (!supportsAttachments(issue.kind) || !upload) return null;
  return <AttachmentsPanel issue={issue} upload={upload} />;
}

export function AttachmentsPanel({
  issue,
  upload,
}: {
  issue: IssueDetail;
  upload: UploadAttachmentMutation;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { data, isLoading, error } = useAttachmentsQuery(issue.id);
  const remove = useDeleteAttachment(issue.id);

  const items = data ?? [];

  const onPick = () => inputRef.current?.click();

  const onFileChange = (files: FileList | null) => {
    const file = files?.[0];
    if (!file || upload.isPending) return;
    upload.mutate(file, {
      onSettled: () => {
        if (inputRef.current) inputRef.current.value = "";
      },
    });
  };

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-card p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Attachments
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onPick}
          disabled={upload.isPending}
        >
          <Upload className="h-3.5 w-3.5" />
          Upload
        </Button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => onFileChange(e.target.files)}
        />
      </div>

      {error ? (
        <p className="text-sm text-destructive-foreground">{error.message}</p>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading attachments…</p>
      ) : items.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Paperclip className="h-3.5 w-3.5" />
          No attachments.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li
              key={item.name}
              className="flex items-center gap-2 text-sm"
            >
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-mono" title={item.name}>
                {item.name}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatAttachmentSize(item.size)}
              </span>
              <a
                href={attachmentsApiPath(issue.id, item.name)}
                download={item.name}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                title={`Download ${item.name}`}
              >
                <Download className="h-3.5 w-3.5" />
              </a>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                title={`Delete ${item.name}`}
                disabled={remove.isPending && remove.variables === item.name}
                onClick={() => remove.mutate(item.name)}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {upload.isPending ? (
        <p className="text-xs text-muted-foreground">Uploading…</p>
      ) : null}
    </div>
  );
}
