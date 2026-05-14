import { AlertTriangle } from "lucide-react";
import { useApiKeyStatusQuery } from "../api/queries";

export function ApiKeyBanner() {
  const status = useApiKeyStatusQuery();
  if (status.data?.ok) return null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-medium">CURSOR_API_KEY is not set on the server.</p>
        <p className="mt-1 text-destructive/90">
          Export <code className="rounded bg-destructive/20 px-1">CURSOR_API_KEY</code> in
          the manage-agents server environment and restart the dev server. All
          review-history actions are disabled until then.
        </p>
      </div>
    </div>
  );
}

export function useApiKeyAvailable(): boolean {
  const status = useApiKeyStatusQuery();
  return Boolean(status.data?.ok);
}
