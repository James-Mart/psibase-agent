import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePatchModel } from "../api/mutations";
import { useAvailableModelsQuery } from "../api/queries";
import type { RhsSession } from "../types";

interface Props {
  workerName: string;
  session: RhsSession;
  disabled: boolean;
}

export function ModelSettingsCard({ workerName, session, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(session.modelId);
  const patch = usePatchModel(workerName);
  const modelsQuery = useAvailableModelsQuery(open);

  useEffect(() => {
    setValue(session.modelId);
  }, [session.modelId]);

  const items = modelsQuery.data?.items ?? [];
  const includesCurrent = items.some((m) => m.id === value);

  return (
    <div className="rounded-md border bg-card text-xs">
      <button
        type="button"
        className="flex w-full items-center justify-between p-2 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="font-medium">
          Model: <code>{session.modelId}</code>
        </span>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
      </button>
      {open && (
        <form
          className="space-y-2 border-t p-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim() && value.trim() !== session.modelId) {
              patch.mutate(value.trim());
            }
          }}
        >
          <Label htmlFor="rhs-model" className="text-xs">
            Model id
          </Label>
          {modelsQuery.isPending ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading models…
            </div>
          ) : modelsQuery.isError ? (
            <p className="text-destructive">
              Failed to load models: {modelsQuery.error?.message ?? "unknown"}
            </p>
          ) : (
            <Select value={value} onValueChange={setValue} disabled={disabled}>
              <SelectTrigger id="rhs-model" className="h-8 text-xs">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {!includesCurrent && (
                  <SelectItem value={value} className="text-xs">
                    {value} (current)
                  </SelectItem>
                )}
                {items.map((m) => (
                  <SelectItem key={m.id} value={m.id} className="text-xs">
                    <div className="flex flex-col">
                      <span>{m.displayName}</span>
                      <span className="font-mono text-muted-foreground">{m.id}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            type="submit"
            size="sm"
            disabled={
              disabled ||
              patch.isPending ||
              !value.trim() ||
              value.trim() === session.modelId
            }
          >
            Save
          </Button>
        </form>
      )}
    </div>
  );
}
