import { FIELD_LABELS } from "@server/fields";
import { SUPPORTING_DOC_KEYS, type SupportingDocs } from "@server/schemas";
import { Label } from "@/components/ui/label";
import {
  SUPPORTING_DOC_KEY_LABELS,
  formatSupportingDocRef,
} from "../lib/supporting-docs";

export function SupportingDocsSection({
  supportingDocs,
}: {
  supportingDocs: SupportingDocs | undefined;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <Label>{FIELD_LABELS.supportingDocs}</Label>
      <ul className="flex flex-col gap-2">
        {SUPPORTING_DOC_KEYS.map((key) => {
          const ref = supportingDocs?.[key];
          return (
            <li key={key} className="flex gap-2 text-sm">
              <span className="w-36 shrink-0 text-muted-foreground">
                {SUPPORTING_DOC_KEY_LABELS[key]}
              </span>
              {ref ? (
                <span className="min-w-0 break-words font-mono">
                  {formatSupportingDocRef(ref)}
                </span>
              ) : (
                <span className="text-muted-foreground">absent</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
