import { Skeleton } from "@/components/ui/skeleton";
import { useWorkerDetailsQuery } from "../api/queries";
import { FileTree } from "./file-tree/file-tree";

interface Props {
  name: string;
}

export function WorkerDiffTab({ name }: Props) {
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
  const files = detailsQuery.data.unstagedFiles;
  if (files.length === 0) {
    return <p className="text-sm text-muted-foreground">Clean working tree.</p>;
  }
  return <FileTree files={files} />;
}
