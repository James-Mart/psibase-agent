import type { IssueRecord } from "@server/schemas";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KIND_LABEL } from "../lib/kind";

/** Shared Part-of parent picker (`Kind: title` items). */
export function PartOfTargetSelect({
  value,
  onValueChange,
  options,
  placeholder,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: IssueRecord[];
  placeholder?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {KIND_LABEL[option.kind]}: {option.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
