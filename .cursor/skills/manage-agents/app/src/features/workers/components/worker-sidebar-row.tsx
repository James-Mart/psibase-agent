import { memo } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GitPullRequest } from "lucide-react";
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { PrInfo, WorkerInfo } from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";
import { useWorkerUiStore } from "../store/use-worker-ui-store";
import { WorkerAgentToggle } from "./worker-agent-toggle";
import { WorkerDeleteButton } from "./worker-delete-button";

const PR_STATE_COLOR: Record<PrInfo["state"], string> = {
  open: "[color:hsl(var(--success))]",
  merged: "[color:hsl(280_60%_70%)]",
  closed: "[color:hsl(var(--destructive))]",
};

function PrIconSlot({ pr }: { pr: PrInfo | null }) {
  return (
    <span
      className="mr-2 flex w-4 shrink-0 items-center justify-center"
      title={pr ? `PR ${pr.state}` : undefined}
    >
      {pr ? (
        <GitPullRequest size={14} className={PR_STATE_COLOR[pr.state]} />
      ) : null}
    </span>
  );
}

interface RowContentProps {
  worker: WorkerInfo;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
}

function WorkerSidebarRowContent({
  worker,
  selected,
  busy,
  onSelect,
}: RowContentProps) {
  return (
    <>
      <SidebarMenuButton
        isActive={selected}
        className="cursor-pointer pr-16"
        onClick={() => {
          if (busy || selected) return;
          onSelect();
        }}
      >
        <PrIconSlot pr={worker.pr ?? null} />
        <span className="min-w-0 flex-1 truncate font-mono text-sm">
          {worker.branch}
        </span>
      </SidebarMenuButton>
      <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1">
        <WorkerAgentToggle worker={worker} busy={busy} />
        {worker.isMain ? (
          <div className="h-7 w-7" aria-hidden />
        ) : (
          <WorkerDeleteButton worker={worker} busy={busy} />
        )}
      </div>
    </>
  );
}

interface DraggableProps {
  worker: WorkerInfo;
}

export const WorkerSidebarRow = memo(function WorkerSidebarRow({
  worker,
}: DraggableProps) {
  const selected = useWorkerUiStore((s) => s.selectedName === worker.name);
  const busy = useWorkerUiStore((s) => s.busyWorkers.has(worker.name));
  const selectWorker = useWorkerUiStore((s) => s.selectWorker);

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: worker.name,
      data: { type: "worker", status: worker.status, name: worker.name },
      disabled: busy,
    });

  return (
    <SidebarMenuItem
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : undefined,
      }}
      className={cn(busy && "opacity-60")}
      {...attributes}
      {...listeners}
    >
      <WorkerSidebarRowContent
        worker={worker}
        selected={selected}
        busy={busy}
        onSelect={() => selectWorker(worker.name)}
      />
    </SidebarMenuItem>
  );
});

interface OverlayProps {
  worker: WorkerInfo;
}

export function WorkerSidebarRowOverlay({ worker }: OverlayProps) {
  return (
    <SidebarMenuItem className="cursor-grabbing rounded-md bg-sidebar shadow-lg ring-1 ring-sidebar-border">
      <WorkerSidebarRowContent
        worker={worker}
        selected={false}
        busy={false}
        onSelect={() => {}}
      />
    </SidebarMenuItem>
  );
}
