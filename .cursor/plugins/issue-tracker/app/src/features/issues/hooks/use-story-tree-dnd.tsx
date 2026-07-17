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
import { useMoveStory } from "../api/mutations";
import {
  STORY_DRAG_MIME,
  canDropStoryOntoEpic,
  canRestackStoryOntoStory,
  readStoryDragId,
} from "../lib/story-drop";
import {
  isStoryTreeDraggable,
  isStoryTreeDropTarget,
  processStoryDrop,
} from "../lib/story-tree-dnd-logic";

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

export interface StoryTreeDnD {
  getRowDnDProps: (issue: IssueRecord) => RowDnDProps;
  /** True once if the last gesture was a drag (clears the flag). */
  consumeDragGesture: () => boolean;
}

const StoryTreeDnDContext = createContext<StoryTreeDnD | null>(null);

const INERT_ROW_DND: RowDnDProps = {
  isDragging: false,
  isDropTarget: false,
};

export function useStoryTreeDnD(issues: IssueRecord[]): StoryTreeDnD {
  const moveStory = useMoveStory();
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
          readStoryDragId(event.dataTransfer) ?? draggingIdRef.current;
        clearDrag();
        processStoryDrop({
          sourceId,
          targetId,
          canDrop,
          onMove: (id, target) => moveStory.mutate({ id, target }),
        });
      },
    }),
    [clearDrag, moveStory],
  );

  const getRowDnDProps = useCallback(
    (issue: IssueRecord): RowDnDProps => {
      const id = issue.id;
      const isDropTarget = dropTargetId === id;

      if (isStoryTreeDraggable(issue)) {
        return {
          ...dropTargetHandlers(id, (sourceId) =>
            canRestackStoryOntoStory(issues, sourceId, id),
          ),
          draggable: true,
          isDragging: draggingId === id,
          isDropTarget,
          onDragStart: (event: DragEvent) => {
            event.dataTransfer.setData(STORY_DRAG_MIME, id);
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

      if (isStoryTreeDropTarget(issue) && issue.kind === "epic") {
        return {
          ...dropTargetHandlers(id, (sourceId) =>
            canDropStoryOntoEpic(issues, sourceId, id),
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

export function StoryTreeDnDProvider({
  value,
  children,
}: {
  value: StoryTreeDnD;
  children: ReactNode;
}) {
  return (
    <StoryTreeDnDContext.Provider value={value}>
      {children}
    </StoryTreeDnDContext.Provider>
  );
}

export function useStoryTreeDnDContext(): StoryTreeDnD {
  const ctx = useContext(StoryTreeDnDContext);
  if (!ctx) {
    throw new Error("useStoryTreeDnDContext requires StoryTreeDnDProvider");
  }
  return ctx;
}
