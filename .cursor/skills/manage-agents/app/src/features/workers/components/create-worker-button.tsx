import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { useWorkerUiStore } from "../store/use-worker-ui-store";

interface Props {
  className?: string;
}

export function CreateWorkerButton({ className }: Props = {}) {
  const openCreateDialog = useWorkerUiStore((s) => s.openCreateDialog);
  return (
    <Button onClick={openCreateDialog} className={cn(className)}>
      <Plus />
      Create worktree
    </Button>
  );
}
