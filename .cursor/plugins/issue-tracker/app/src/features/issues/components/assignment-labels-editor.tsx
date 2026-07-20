import { FIELD_LABELS } from "@server/fields";
import type { ProjectLabel } from "@server/schemas";
import { Label } from "@/components/ui/label";
import { toggleAssignmentId } from "../lib/project-labels";
import { ProjectLabelChip } from "./project-label-chip";

export function AssignmentLabelsEditor({
  catalog,
  selected,
  onChange,
}: {
  catalog: ProjectLabel[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <Label>{FIELD_LABELS.labels}</Label>
      {catalog.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No labels in project catalog.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {catalog.map((label) => {
            const checked = selected.includes(label.id);
            return (
              <li key={label.id}>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={checked}
                    onChange={() =>
                      onChange(toggleAssignmentId(selected, label.id))
                    }
                  />
                  <ProjectLabelChip label={label} />
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
