import { cn } from "@/lib/utils/cn";
import type { FileStatusLabel } from "../../lib/file-status";

const variantClass: Record<FileStatusLabel["variant"], string> = {
  modified: "[color:hsl(var(--warning))]",
  added: "[color:hsl(var(--success))]",
  deleted: "[color:hsl(var(--destructive))]",
  renamed: "[color:hsl(220_80%_70%)]",
  untracked: "text-muted-foreground",
};

interface Props {
  label: FileStatusLabel;
}

export function FileStatusBadge({ label }: Props) {
  return (
    <span
      className={cn(
        "inline-block w-4 text-center font-mono text-xs font-semibold",
        variantClass[label.variant],
      )}
    >
      {label.letter}
    </span>
  );
}
