import { MERGE_POLICY_OPTIONS } from "@server/fields";
import type { MergePolicy } from "@server/schemas";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function MergePolicySelect({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: MergePolicy;
  onChange: (value: MergePolicy) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as MergePolicy)}>
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {MERGE_POLICY_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
