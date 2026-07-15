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
  canDropBranchOntoEpic,
  canRestackBranchOntoBranch,
  readBranchDragId,
} from "../lib/branch-drop";
import {
  isBranchTreeDraggable,
  isBranchTreeDropTarget,
  processBranchDrop,
} from "../lib/branch-tree-dnd-logic";

export type RowDnDProps = Pick<
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
  getRowDnDProps: (issue: IssueRecord) => RowDnDProps;
  /** True once if the last gesture was a drag (clears the flag). */
  consumeDragGesture: () => boolean;
}

const BranchTreeDnDContext = createContext<BranchTreeDnD | null>(null);

const INERT_ROW_DND: RowDnDProps = {
  isDragging: false,
  isDropTarget: false,
};

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

  const dropTargetHandlers = useCallback(
    (
      targetId: string,
      canDrop: (sourceId: string) => boolean,
    ): Pick<
      HTMLAttributes<HTMLDivElement>,
      "onDragOver" | "onDragLeave" | "onDrop"
    > => ({
      onDragOver: (event: DragEvent) => {
        const sourceId = draggingIdRef.current;
        if (!sourceId) return;
        if (!canDrop(sourceId)) {
          setDropTargetId((current) => (current === targetId ? null : current));
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDropTargetId(targetId);
      },
      onDragLeave: () => {
        setDropTargetId((current) => (current === targetId ? null : current));
      },
      onDrop: (event: DragEvent) => {
        event.preventDefault();
        const sourceId =
          readBranchDragId(event.dataTransfer) ?? draggingIdRef.current;
        clearDrag();
        processBranchDrop({
          sourceId,
          targetId,
          canDrop,
          onMove: (id, target) => moveBranch.mutate({ id, target }),
        });
      },
    }),
    [clearDrag, moveBranch],
  );

  const getRowDnDProps = useCallback(
    (issue: IssueRecord): RowDnDProps => {
      const id = issue.id;
      const isDropTarget = dropTargetId === id;

      if (isBranchTreeDraggable(issue)) {
        return {
          ...dropTargetHandlers(id, (sourceId) =>
            canRestackBranchOntoBranch(issues, sourceId, id),
          ),
          draggable: true,
          isDragging: draggingId === id,
          isDropTarget,
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
        };
      }

      if (isBranchTreeDropTarget(issue) && issue.kind === "epic") {
        return {
          ...dropTargetHandlers(id, (sourceId) =>
            canDropBranchOntoEpic(issues, sourceId, id),
          ),
          isDragging: false,
          isDropTarget,
        };
      }

      return INERT_ROW_DND;
    },
    [clearDrag, draggingId, dropTargetId, dropTargetHandlers, issues],
  );

  const consumeDragGesture = useCallback(() => {
    if (!draggedDuringGestureRef.current) return false;
    draggedDuringGestureRef.current = false;
    return true;
  }, []);

  return { getRowDnDProps, consumeDragGesture };
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
