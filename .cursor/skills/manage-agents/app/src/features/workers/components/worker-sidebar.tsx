import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import type { WorkerInfo, WorkerStatus } from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";
import { useSaveWorkerStatus } from "../api/mutations";
import { useWorkersQuery } from "../api/queries";
import { useWorkerUiStore } from "../store/use-worker-ui-store";
import { CreateWorkerButton } from "./create-worker-button";
import {
  WorkerSidebarRow,
  WorkerSidebarRowOverlay,
} from "./worker-sidebar-row";
import { WorkerSidebarRowPending } from "./worker-sidebar-row-pending";

const STATUS_ORDER: readonly WorkerStatus[] = [
  "active",
  "blocked",
  "inactive",
] as const;

const STATUS_LABEL: Record<WorkerStatus, string> = {
  active: "Active",
  blocked: "Blocked",
  inactive: "Inactive",
};

interface DropZoneProps {
  status: WorkerStatus;
  workers: WorkerInfo[];
  active: boolean;
}

function StatusGroup({ status, workers, active }: DropZoneProps) {
  const { setNodeRef } = useDroppable({
    id: `group:${status}`,
    data: { type: "group", status },
  });

  return (
    <SidebarGroup>
      <SidebarGroupLabel>
        {STATUS_LABEL[status]}
        <span className="ml-2 text-sidebar-foreground/50">{workers.length}</span>
      </SidebarGroupLabel>
      <SidebarGroupContent
        ref={setNodeRef}
        className={cn(
          "rounded-md transition-colors",
          active && "bg-sidebar-accent/40 ring-1 ring-sidebar-ring/50",
        )}
      >
        <SidebarMenu>
          {workers.length === 0 ? (
            <li className="px-2 py-3 text-center text-xs text-sidebar-foreground/40">
              Drop here
            </li>
          ) : (
            workers.map((w) => <WorkerSidebarRow key={w.name} worker={w} />)
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

type OverData =
  | { type: "group"; status: WorkerStatus }
  | { type: "worker"; status: WorkerStatus; name: string };

export function WorkerSidebar() {
  const query = useWorkersQuery();
  const placeholders = useWorkerUiStore((s) => s.createPlaceholders);
  const selectedName = useWorkerUiStore((s) => s.selectedName);
  const selectWorker = useWorkerUiStore((s) => s.selectWorker);
  const saveStatus = useSaveWorkerStatus();

  useEffect(() => {
    if (!selectedName || !query.data) return;
    const inWorkers = query.data.some((w) => w.name === selectedName);
    const inPlaceholders = placeholders.some((p) => p.id === selectedName);
    if (!inWorkers && !inPlaceholders) selectWorker(null);
  }, [selectedName, query.data, placeholders, selectWorker]);

  const [activeName, setActiveName] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<WorkerStatus | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const grouped = useMemo(() => {
    const map: Record<WorkerStatus, WorkerInfo[]> = {
      active: [],
      blocked: [],
      inactive: [],
    };
    for (const w of query.data ?? []) map[w.status].push(w);
    return map;
  }, [query.data]);

  const activeWorker = useMemo(
    () => (query.data ?? []).find((w) => w.name === activeName) ?? null,
    [query.data, activeName],
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveName(String(event.active.id));
  };

  const handleDragOver = (event: DragOverEvent) => {
    const data = event.over?.data.current as OverData | undefined;
    setOverStatus(data?.status ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveName(null);
    setOverStatus(null);
    const { active, over } = event;
    if (!over) return;

    const overData = over.data.current as OverData | undefined;
    const activeData = active.data.current as
      | { type: "worker"; status: WorkerStatus; name: string }
      | undefined;
    if (!activeData || !overData) return;

    const destStatus = overData.status;
    if (destStatus === activeData.status) return;

    saveStatus.mutate({ name: activeData.name, status: destStatus });
  };

  const handleDragCancel = () => {
    setActiveName(null);
    setOverStatus(null);
  };

  return (
    <Sidebar variant="inset" side="left">
      <SidebarHeader>
        <CreateWorkerButton className="w-full" />
      </SidebarHeader>
      <SidebarContent>
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          {placeholders.length > 0 && (
            <SidebarGroup>
              <SidebarGroupLabel>
                Pending
                <span className="ml-2 text-sidebar-foreground/50">
                  {placeholders.length}
                </span>
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {placeholders.map((p) => (
                    <WorkerSidebarRowPending key={p.id} placeholder={p} />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {query.isPending ? (
            <SidebarGroup>
              <SidebarGroupContent className="space-y-2 p-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </SidebarGroupContent>
            </SidebarGroup>
          ) : (
            STATUS_ORDER.map((status) => (
              <StatusGroup
                key={status}
                status={status}
                workers={grouped[status]}
                active={overStatus === status}
              />
            ))
          )}

          <DragOverlay dropAnimation={null}>
            {activeWorker ? (
              <WorkerSidebarRowOverlay worker={activeWorker} />
            ) : null}
          </DragOverlay>
        </DndContext>
      </SidebarContent>
    </Sidebar>
  );
}
