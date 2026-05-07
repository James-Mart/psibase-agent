import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkerUiStore } from "../store/use-worker-ui-store";

export function CreateWorkerButton() {
  const openCreateDialog = useWorkerUiStore((s) => s.openCreateDialog);
  return (
    <Button onClick={openCreateDialog}>
      <Plus />
      Add Worker
    </Button>
  );
}
