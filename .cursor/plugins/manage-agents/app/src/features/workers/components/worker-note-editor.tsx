import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils/cn";
import { useDebouncedNoteSave } from "../hooks/use-debounced-note-save";

interface Props {
  name: string;
  initialNote: string;
}

export function WorkerNoteEditor({ name, initialNote }: Props) {
  const [value, setValue] = useState(initialNote);
  const { scheduleSave, flush, isError } = useDebouncedNoteSave(name);
  const prevName = useRef(name);

  useEffect(() => {
    if (name !== prevName.current) {
      setValue(initialNote);
      prevName.current = name;
    }
  }, [name, initialNote]);

  return (
    <div className="space-y-1">
      <Textarea
        value={value}
        rows={4}
        placeholder="What are you working on in this worktree?"
        className={cn(isError && "border-destructive focus-visible:ring-destructive")}
        onChange={(e) => {
          setValue(e.target.value);
          scheduleSave(e.target.value);
        }}
        onBlur={flush}
      />
      {isError && (
        <p className="text-xs text-destructive">Failed to save note.</p>
      )}
    </div>
  );
}
