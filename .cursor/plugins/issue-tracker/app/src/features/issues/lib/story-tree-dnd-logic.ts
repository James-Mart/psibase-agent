import type { IssueRecord } from "@server/schemas";

/** Branch and epic rows accept drops; commits and other kinds do not. */
export function isStoryTreeDropTarget(issue: IssueRecord): boolean {
  return issue.kind === "story" || issue.kind === "epic";
}

/** Only branches are draggable in the issue tree. */
export function isStoryTreeDraggable(issue: IssueRecord): boolean {
  return issue.kind === "story";
}

/**
 * Shared drop handler: invoke `onMove` only when `sourceId` is present and
 * `canDrop` allows the gesture.
 */
export function processStoryDrop(params: {
  sourceId: string | null;
  targetId: string;
  canDrop: (sourceId: string) => boolean;
  onMove: (sourceId: string, targetId: string) => void;
}): void {
  const { sourceId, targetId, canDrop, onMove } = params;
  if (!sourceId) return;
  if (!canDrop(sourceId)) return;
  onMove(sourceId, targetId);
}
