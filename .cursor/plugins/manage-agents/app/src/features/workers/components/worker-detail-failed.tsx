import { Button } from "@/components/ui/button";
import { useWorkerUiStore } from "../store/use-worker-ui-store";
import type { CreatePlaceholder } from "../types";

interface Props {
  placeholder: CreatePlaceholder;
}

export function WorkerDetailFailed({ placeholder }: Props) {
  const removePlaceholder = useWorkerUiStore((s) => s.removePlaceholder);
  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Create worker failed</h2>
          <p className="font-mono text-xs text-muted-foreground">
            {placeholder.branch}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => removePlaceholder(placeholder.id)}
        >
          Dismiss
        </Button>
      </header>

      <section className="space-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Error
        </h3>
        <p className="text-sm text-destructive">
          {placeholder.errorMessage ?? "Unknown error"}
        </p>
      </section>

      {placeholder.errorExtra && (
        <section className="space-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Output
          </h3>
          <pre className="max-h-72 overflow-auto rounded-md border bg-card/60 p-3 font-mono text-xs">
            {placeholder.errorExtra}
          </pre>
        </section>
      )}
    </div>
  );
}
