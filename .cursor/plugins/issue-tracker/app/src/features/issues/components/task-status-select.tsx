import { TASK_STATUSES, type TaskStatus } from "@server/schemas";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpdateIssue } from "../api/mutations";
import { TASK_STATUS_CLASS } from "../lib/derived";

export function TaskStatusSelect({
  id,
  status,
}: {
  id: string;
  status: TaskStatus;
}) {
  const updateIssue = useUpdateIssue();

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Select
        value={status}
        onValueChange={(value) =>
          updateIssue.mutate({ id, patch: { status: value as TaskStatus } })
        }
      >
        <SelectTrigger
          className={`h-6 w-28 border-transparent bg-muted px-2 text-xs ${TASK_STATUS_CLASS[status]}`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TASK_STATUSES.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
