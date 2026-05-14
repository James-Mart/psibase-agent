import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRenameWorker } from "../api/mutations";
import { useWorkerUiStore } from "../store/use-worker-ui-store";

interface Props {
  name: string;
}

export function WorkerRenameInput({ name }: Props) {
  const editValue = useWorkerUiStore((s) => s.editValue);
  const setEditValue = useWorkerUiStore((s) => s.setEditValue);
  const cancelEditing = useWorkerUiStore((s) => s.cancelEditing);
  const renameSelected = useWorkerUiStore((s) => s.renameSelected);
  const inputRef = useRef<HTMLInputElement>(null);
  const rename = useRenameWorker();

  useEffect(() => inputRef.current?.focus(), []);

  const submit = () => {
    const newName = editValue.trim();
    if (!newName || newName === name) {
      cancelEditing();
      return;
    }
    cancelEditing();
    rename.mutate(
      { name, newName },
      { onSuccess: () => renameSelected(name, newName) },
    );
  };

  return (
    <span className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <Input
        ref={inputRef}
        value={editValue}
        className="h-7 max-w-[280px] text-xs"
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") cancelEditing();
        }}
      />
      <Button type="button" size="sm" onClick={submit}>
        Save
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={cancelEditing}>
        Cancel
      </Button>
    </span>
  );
}
