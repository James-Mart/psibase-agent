import { useRef } from "react";
import { FIELD_LABELS } from "@server/fields";
import {
  SUPPORTING_DOC_KEYS,
  type SupportingDocKey,
} from "@server/schemas";
import type { Attachment } from "@server/services/attachments";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAttachmentsQuery } from "../api/queries";
import {
  SUPPORTING_DOC_KEY_LABELS,
  supportingDocDraftForMode,
  type SupportingDocDraft,
  type SupportingDocMode,
  type SupportingDocsDraft,
} from "../lib/supporting-docs";

function DocRow({
  docKey,
  draft,
  attachments,
  attachmentsLoading,
  disabled,
  onChange,
  onCommit,
}: {
  docKey: SupportingDocKey;
  draft: SupportingDocDraft;
  attachments: Attachment[];
  attachmentsLoading: boolean;
  disabled?: boolean;
  onChange: (draft: SupportingDocDraft) => void;
  onCommit?: (draft: SupportingDocDraft) => void;
}) {
  const label = SUPPORTING_DOC_KEY_LABELS[docKey];

  return (
    <li className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
      <Label>{label}</Label>
      <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
        <Select
          value={draft.mode}
          disabled={disabled}
          onValueChange={(value) => {
            const next = supportingDocDraftForMode(value as SupportingDocMode);
            onChange(next);
            onCommit?.(next);
          }}
        >
          <SelectTrigger aria-label={`${label} source`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="absent">Absent</SelectItem>
            <SelectItem value="attachment">Attachment</SelectItem>
            <SelectItem value="workspace">Workspace path</SelectItem>
          </SelectContent>
        </Select>

        {draft.mode === "attachment" ? (
          attachmentsLoading ? (
            <p className="flex h-9 items-center text-sm text-muted-foreground">
              Loading attachments…
            </p>
          ) : attachments.length > 0 ? (
            <Select
              value={draft.name || undefined}
              disabled={disabled}
              onValueChange={(name) => {
                const next: SupportingDocDraft = { mode: "attachment", name };
                onChange(next);
                onCommit?.(next);
              }}
            >
              <SelectTrigger aria-label={`${label} attachment`}>
                <SelectValue placeholder="Select attachment" />
              </SelectTrigger>
              <SelectContent>
                {attachments.map((item) => (
                  <SelectItem key={item.name} value={item.name}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={draft.name}
              disabled={disabled}
              onChange={(e) =>
                onChange({ mode: "attachment", name: e.target.value })
              }
              onBlur={(e) =>
                onCommit?.({ mode: "attachment", name: e.target.value })
              }
              className="font-mono"
              placeholder="attachment basename"
              spellCheck={false}
              aria-label={`${label} attachment`}
            />
          )
        ) : null}

        {draft.mode === "workspace" ? (
          <Input
            value={draft.path}
            disabled={disabled}
            onChange={(e) =>
              onChange({ mode: "workspace", path: e.target.value })
            }
            onBlur={(e) =>
              onCommit?.({ mode: "workspace", path: e.target.value })
            }
            className="font-mono"
            placeholder="relative/path.md"
            spellCheck={false}
            aria-label={`${label} workspace path`}
          />
        ) : null}

        {draft.mode === "absent" ? (
          <p className="flex h-9 items-center text-sm text-muted-foreground">
            No pointer set
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function SupportingDocsEditor({
  issueId,
  draft,
  onChange,
  onCommit,
  disabled,
  error,
}: {
  issueId: string;
  draft: SupportingDocsDraft;
  onChange: (draft: SupportingDocsDraft) => void;
  /** Persist after mode/attachment select or path blur. */
  onCommit?: (draft: SupportingDocsDraft) => void;
  disabled?: boolean;
  error?: string | null;
}) {
  const { data, isLoading, error: loadError } = useAttachmentsQuery(issueId);
  const attachments = data ?? [];
  const draftRef = useRef(draft);
  draftRef.current = draft;

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <Label>{FIELD_LABELS.supportingDocs}</Label>
      {loadError ? (
        <p className="text-sm text-destructive-foreground">{loadError.message}</p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <ul className="flex flex-col gap-3">
        {SUPPORTING_DOC_KEYS.map((key) => (
          <DocRow
            key={key}
            docKey={key}
            draft={draft[key]}
            attachments={attachments}
            attachmentsLoading={isLoading}
            disabled={disabled}
            onChange={(next) => {
              const updated = { ...draftRef.current, [key]: next };
              draftRef.current = updated;
              onChange(updated);
            }}
            onCommit={(next) => {
              const updated = { ...draftRef.current, [key]: next };
              draftRef.current = updated;
              onCommit?.(updated);
            }}
          />
        ))}
      </ul>
    </div>
  );
}
