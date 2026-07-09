import { COMMIT_STATUSES, type CommitStatus } from "@server/schemas";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpdateIssue } from "../api/mutations";

const STATUS_CLASS: Record<CommitStatus, string> = {
  todo: "text-muted-foreground",
  "in-progress": "[color:hsl(var(--warning))]",
  done: "[color:hsl(var(--success))]",
};

export function CommitStatusSelect({
  id,
  status,
}: {
  id: string;
  status: CommitStatus;
}) {
  const updateIssue = useUpdateIssue();

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Select
        value={status}
        onValueChange={(value) =>
          updateIssue.mutate({ id, patch: { status: value as CommitStatus } })
        }
      >
        <SelectTrigger
          className={`h-6 w-28 border-transparent bg-muted px-2 text-xs ${STATUS_CLASS[status]}`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {COMMIT_STATUSES.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
