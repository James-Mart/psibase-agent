import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WorkerInfo, WorkerStatus } from "@/lib/api/types";
import { useSaveWorkerStatus } from "../api/mutations";
import { cn } from "@/lib/utils/cn";

interface Props {
  worker: WorkerInfo;
}

const triggerClass: Record<WorkerStatus, string> = {
  active: "border-success/40 [color:hsl(var(--success))]",
  blocked: "border-warning/40 [color:hsl(var(--warning))]",
  inactive: "border-input text-muted-foreground",
};

export function WorkerStatusSelect({ worker }: Props) {
  const mutation = useSaveWorkerStatus();

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Select
        value={worker.status}
        onValueChange={(value) =>
          mutation.mutate({ name: worker.name, status: value as WorkerStatus })
        }
      >
        <SelectTrigger
          className={cn("h-8 w-[110px] text-xs", triggerClass[worker.status])}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="blocked">Blocked</SelectItem>
          <SelectItem value="inactive">Inactive</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
