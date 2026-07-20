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
  onChange,
}: {
  docKey: SupportingDocKey;
  draft: SupportingDocDraft;
  attachments: Attachment[];
  attachmentsLoading: boolean;
  onChange: (draft: SupportingDocDraft) => void;
}) {
  const label = SUPPORTING_DOC_KEY_LABELS[docKey];

  return (
    <li className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
      <Label>{label}</Label>
      <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
        <Select
          value={draft.mode}
          onValueChange={(value) =>
            onChange(supportingDocDraftForMode(value as SupportingDocMode))
          }
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
              onValueChange={(name) =>
                onChange({ mode: "attachment", name })
              }
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
              onChange={(e) =>
                onChange({ mode: "attachment", name: e.target.value })
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
            onChange={(e) =>
              onChange({ mode: "workspace", path: e.target.value })
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
}: {
  issueId: string;
  draft: SupportingDocsDraft;
  onChange: (draft: SupportingDocsDraft) => void;
}) {
  const { data, isLoading, error } = useAttachmentsQuery(issueId);
  const attachments = data ?? [];

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <Label>{FIELD_LABELS.supportingDocs}</Label>
      {error ? (
        <p className="text-sm text-destructive-foreground">{error.message}</p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {SUPPORTING_DOC_KEYS.map((key) => (
          <DocRow
            key={key}
            docKey={key}
            draft={draft[key]}
            attachments={attachments}
            attachmentsLoading={isLoading}
            onChange={(next) => onChange({ ...draft, [key]: next })}
          />
        ))}
      </ul>
    </div>
  );
}
