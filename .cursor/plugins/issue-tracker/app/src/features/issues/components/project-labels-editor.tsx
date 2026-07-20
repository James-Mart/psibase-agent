import { Plus, Trash2 } from "lucide-react";
import { FIELD_LABELS } from "@server/fields";
import { LABEL_COLOR_RE } from "@server/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LABEL_DESCRIPTION_MAX,
  newCatalogDraft,
  type CatalogDraft,
} from "../lib/project-labels";
import { ProjectLabelChip } from "./project-label-chip";

function ColorField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const pickerValue = LABEL_COLOR_RE.test(value) ? value : "#64748b";
  return (
    <div className="flex items-center gap-2">
      <input
        id={`${id}-picker`}
        type="color"
        value={pickerValue}
        onChange={(e) => onChange(e.target.value.toLowerCase())}
        className="h-9 w-10 cursor-pointer rounded border bg-transparent p-1"
        title="Pick color"
      />
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono"
        placeholder="#rrggbb"
        spellCheck={false}
      />
    </div>
  );
}

export function ProjectLabelsEditor({
  drafts,
  onChange,
  error,
}: {
  drafts: CatalogDraft[];
  onChange: (drafts: CatalogDraft[]) => void;
  error?: string | null;
}) {
  const setDraft = (key: string, patch: Partial<CatalogDraft>) => {
    onChange(
      drafts.map((draft) =>
        draft.key === key ? { ...draft, ...patch } : draft,
      ),
    );
  };

  const removeDraft = (key: string) => {
    onChange(drafts.filter((draft) => draft.key !== key));
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <Label>{FIELD_LABELS.labels}</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...drafts, newCatalogDraft()])}
        >
          <Plus className="h-3.5 w-3.5" />
          Add label
        </Button>
      </div>

      {drafts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No labels in catalog.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {drafts.map((draft) => (
            <li
              key={draft.key}
              className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                {LABEL_COLOR_RE.test(draft.color.trim()) && draft.id.trim() ? (
                  <ProjectLabelChip
                    label={{
                      id: draft.id.trim() || "label",
                      color: draft.color.trim(),
                      ...(draft.description.trim()
                        ? { description: draft.description.trim() }
                        : {}),
                    }}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">Preview</span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  title="Remove label"
                  onClick={() => removeDraft(draft.key)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor={`label-id-${draft.key}`}>Id</Label>
                  <Input
                    id={`label-id-${draft.key}`}
                    value={draft.id}
                    onChange={(e) => setDraft(draft.key, { id: e.target.value })}
                    className="font-mono"
                    placeholder="kebab-case"
                    spellCheck={false}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`label-color-${draft.key}`}>Color</Label>
                  <ColorField
                    id={`label-color-${draft.key}`}
                    value={draft.color}
                    onChange={(color) => setDraft(draft.key, { color })}
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor={`label-desc-${draft.key}`}>
                  Description (optional)
                </Label>
                <Input
                  id={`label-desc-${draft.key}`}
                  value={draft.description}
                  onChange={(e) =>
                    setDraft(draft.key, { description: e.target.value })
                  }
                  maxLength={LABEL_DESCRIPTION_MAX}
                  placeholder="Shown as chip tooltip"
                />
                <p className="text-xs text-muted-foreground">
                  {draft.description.length}/{LABEL_DESCRIPTION_MAX}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
