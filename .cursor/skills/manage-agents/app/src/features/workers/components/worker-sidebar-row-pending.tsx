import { Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils/cn";
import { branchToWorkerName } from "../lib/worker-paths";
import { useWorkerUiStore } from "../store/use-worker-ui-store";
import type { CreatePlaceholder } from "../types";

interface Props {
  placeholder: CreatePlaceholder;
}

export function WorkerSidebarRowPending({ placeholder }: Props) {
  const selected = useWorkerUiStore((s) => s.selectedName === placeholder.id);
  const selectWorker = useWorkerUiStore((s) => s.selectWorker);
  const removePlaceholder = useWorkerUiStore((s) => s.removePlaceholder);
  const isFailed = placeholder.phase === "failed";

  return (
    <SidebarMenuItem
      className={cn(
        "rounded-md",
        isFailed &&
          "ring-1 ring-destructive/40 ring-offset-1 ring-offset-sidebar",
      )}
    >
      <SidebarMenuButton
        isActive={selected}
        className={cn("cursor-pointer", isFailed && "pr-8")}
        onClick={() => {
          if (isFailed) selectWorker(placeholder.id);
        }}
      >
        <span className="font-mono text-sm">
          {branchToWorkerName(placeholder.branch)}
        </span>
        <span className="ml-auto">
          {isFailed ? (
            <Badge variant="setupFailed" className="text-[10px]">
              Failed
            </Badge>
          ) : (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
        </span>
      </SidebarMenuButton>
      {isFailed && (
        <SidebarMenuAction
          aria-label="Dismiss failed placeholder"
          title="Dismiss"
          onClick={(e) => {
            e.stopPropagation();
            removePlaceholder(placeholder.id);
          }}
        >
          <X />
        </SidebarMenuAction>
      )}
    </SidebarMenuItem>
  );
}
