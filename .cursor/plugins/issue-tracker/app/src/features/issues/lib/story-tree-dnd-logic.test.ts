import { describe, expect, it, vi } from "vitest";
import type { IssueRecord } from "@server/schemas";
import {
  canDropStoryOntoEpic,
  canRestackStoryOntoStory,
} from "./story-drop";
import {
  isStoryTreeDraggable,
  isStoryTreeDropTarget,
  processStoryDrop,
} from "./story-tree-dnd-logic";

function story(id: string, partOf: string, stackedOn?: string): IssueRecord {
  return {
    id,
    kind: "story",
    title: id,
    partOf,
    order: 0,
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
    branchName: id,
    merged: false,
    needsAttention: false,
    attentionReason: null,
    archived: false,
    ...(stackedOn ? { stackedOn } : {}),
  };
}

function epic(id: string): IssueRecord {
  return {
    id,
    kind: "epic",
    title: id,
    partOf: "p",
    order: 0,
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
    needsAttention: false,
    attentionReason: null,
    archived: false,
  };
}

function task(id: string, partOf: string): IssueRecord {
  return {
    id,
    kind: "task",
    title: id,
    partOf,
    status: "todo",
    order: 0,
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
    needsAttention: false,
    attentionReason: null,
    archived: false,
  };
}

const issues: IssueRecord[] = [
  epic("e1"),
  epic("e2"),
  story("a", "e1"),
  story("b", "e1", "a"),
  story("peer", "e1"),
  story("x", "e2"),
  task("c1", "b"),
];

describe("isStoryTreeDraggable", () => {
  it("allows branches only", () => {
    expect(isStoryTreeDraggable(story("a", "e1"))).toBe(true);
    expect(isStoryTreeDraggable(epic("e1"))).toBe(false);
    expect(isStoryTreeDraggable(task("c1", "b"))).toBe(false);
  });
});

describe("isStoryTreeDropTarget", () => {
  it("allows branches and epics", () => {
    expect(isStoryTreeDropTarget(story("a", "e1"))).toBe(true);
    expect(isStoryTreeDropTarget(epic("e1"))).toBe(true);
  });

  it("refuses commits and other kinds", () => {
    expect(isStoryTreeDropTarget(task("c1", "b"))).toBe(false);
    expect(
      isStoryTreeDropTarget({
        id: "p",
        kind: "project",
        title: "p",
        order: 0,
        createdAt: "2020-01-01T00:00:00.000Z",
        updatedAt: "2020-01-01T00:00:00.000Z",
        needsAttention: false,
        attentionReason: null,
    archived: false,
      }),
    ).toBe(false);
  });
});

describe("processStoryDrop", () => {
  it("calls onMove for a legal restack onto a branch", () => {
    const onMove = vi.fn();
    processStoryDrop({
      sourceId: "b",
      targetId: "peer",
      canDrop: (sourceId) =>
        canRestackStoryOntoStory(issues, sourceId, "peer"),
      onMove,
    });
    expect(onMove).toHaveBeenCalledWith("b", "peer");
  });

  it("calls onMove for a legal reparent onto an epic", () => {
    const onMove = vi.fn();
    processStoryDrop({
      sourceId: "b",
      targetId: "e2",
      canDrop: (sourceId) => canDropStoryOntoEpic(issues, sourceId, "e2"),
      onMove,
    });
    expect(onMove).toHaveBeenCalledWith("b", "e2");
  });

  it("does not call onMove for illegal drops (self, descendant, commit target)", () => {
    const onMove = vi.fn();
    processStoryDrop({
      sourceId: "b",
      targetId: "b",
      canDrop: (sourceId) =>
        canRestackStoryOntoStory(issues, sourceId, "b"),
      onMove,
    });
    processStoryDrop({
      sourceId: "a",
      targetId: "b",
      canDrop: (sourceId) =>
        canRestackStoryOntoStory(issues, sourceId, "b"),
      onMove,
    });
    processStoryDrop({
      sourceId: "b",
      targetId: "c1",
      canDrop: () => isStoryTreeDropTarget(task("c1", "b")),
      onMove,
    });
    expect(onMove).not.toHaveBeenCalled();
  });

  it("does not call onMove when sourceId is missing", () => {
    const onMove = vi.fn();
    processStoryDrop({
      sourceId: null,
      targetId: "peer",
      canDrop: () => true,
      onMove,
    });
    expect(onMove).not.toHaveBeenCalled();
  });
});
