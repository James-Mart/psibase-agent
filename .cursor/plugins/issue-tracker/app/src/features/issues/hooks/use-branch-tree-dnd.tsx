import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type DragEvent,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import type { IssueRecord } from "@server/schemas";
import { useMoveBranch } from "../api/mutations";
import {
  BRANCH_DRAG_MIME,
  canRestackBranchOntoBranch,
  readBranchDragId,
} from "../lib/branch-drop";

export type BranchRowDnDProps = Pick<
  HTMLAttributes<HTMLDivElement>,
  | "draggable"
  | "onDragStart"
  | "onDragEnd"
  | "onDragOver"
  | "onDragLeave"
  | "onDrop"
> & {
  isDragging: boolean;
  isDropTarget: boolean;
};

export interface BranchTreeDnD {
  getBranchRowProps: (id: string) => BranchRowDnDProps;
  /** True once if the last gesture was a drag (clears the flag). */
  consumeDragGesture: () => boolean;
}

const BranchTreeDnDContext = createContext<BranchTreeDnD | null>(null);

export function useBranchTreeDnD(issues: IssueRecord[]): BranchTreeDnD {
  const moveBranch = useMoveBranch();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const draggedDuringGestureRef = useRef(false);

  const clearDrag = useCallback(() => {
    draggingIdRef.current = null;
    setDraggingId(null);
    setDropTargetId(null);
  }, []);

  const getBranchRowProps = useCallback(
    (id: string): BranchRowDnDProps => ({
      draggable: true,
      isDragging: draggingId === id,
      isDropTarget: dropTargetId === id,
      onDragStart: (event: DragEvent) => {
        event.dataTransfer.setData(BRANCH_DRAG_MIME, id);
        event.dataTransfer.setData("text/plain", id);
        event.dataTransfer.effectAllowed = "move";
        draggedDuringGestureRef.current = true;
        draggingIdRef.current = id;
        setDraggingId(id);
        setDropTargetId(null);
      },
      onDragEnd: clearDrag,
      onDragOver: (event: DragEvent) => {
        const sourceId = draggingIdRef.current;
        if (!sourceId) return;
        if (!canRestackBranchOntoBranch(issues, sourceId, id)) {
          setDropTargetId((current) => (current === id ? null : current));
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDropTargetId(id);
      },
      onDragLeave: () => {
        setDropTargetId((current) => (current === id ? null : current));
      },
      onDrop: (event: DragEvent) => {
        event.preventDefault();
        const sourceId =
          readBranchDragId(event.dataTransfer) ?? draggingIdRef.current;
        clearDrag();
        if (!sourceId) return;
        if (!canRestackBranchOntoBranch(issues, sourceId, id)) return;
        moveBranch.mutate({ id: sourceId, target: id });
      },
    }),
    [clearDrag, draggingId, dropTargetId, issues, moveBranch],
  );

  const consumeDragGesture = useCallback(() => {
    if (!draggedDuringGestureRef.current) return false;
    draggedDuringGestureRef.current = false;
    return true;
  }, []);

  return { getBranchRowProps, consumeDragGesture };
}

export function BranchTreeDnDProvider({
  value,
  children,
}: {
  value: BranchTreeDnD;
  children: ReactNode;
}) {
  return (
    <BranchTreeDnDContext.Provider value={value}>
      {children}
    </BranchTreeDnDContext.Provider>
  );
}

export function useBranchTreeDnDContext(): BranchTreeDnD {
  const ctx = useContext(BranchTreeDnDContext);
  if (!ctx) {
    throw new Error("useBranchTreeDnDContext requires BranchTreeDnDProvider");
  }
  return ctx;
}
