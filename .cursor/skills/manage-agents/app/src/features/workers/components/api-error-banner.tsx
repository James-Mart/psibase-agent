import { useWorkersQuery } from "../api/queries";

export function ApiErrorBanner() {
  const query = useWorkersQuery();
  if (!query.isError) return null;
  return (
    <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      Unable to reach backend: {query.error.message}
    </div>
  );
}
