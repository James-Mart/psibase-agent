import { Skeleton } from "@/components/ui/skeleton";
import { useWorkerDetailsQuery } from "../api/queries";
import { WorkerNoteEditor } from "./worker-note-editor";

interface Props {
  name: string;
}

export function WorkerNoteTab({ name }: Props) {
  const detailsQuery = useWorkerDetailsQuery(name);
  if (detailsQuery.isPending) {
    return <Skeleton className="h-32 w-full" />;
  }
  if (detailsQuery.isError || !detailsQuery.data) {
    return (
      <p className="text-sm text-destructive">
        Failed to load: {detailsQuery.error?.message ?? "unknown error"}
      </p>
    );
  }
  return <WorkerNoteEditor name={name} initialNote={detailsQuery.data.note} />;
}
