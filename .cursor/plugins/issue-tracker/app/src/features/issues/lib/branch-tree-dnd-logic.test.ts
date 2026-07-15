import { describe, expect, it, vi } from "vitest";
import type { IssueRecord } from "@server/schemas";
import {
  canDropBranchOntoEpic,
  canRestackBranchOntoBranch,
} from "./branch-drop";
import {
  isBranchTreeDraggable,
  isBranchTreeDropTarget,
  processBranchDrop,
} from "./branch-tree-dnd-logic";

function branch(id: string, partOf: string, stackedOn?: string): IssueRecord {
  return {
    id,
    kind: "branch",
    title: id,
    partOf,
    order: 0,
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
    branchName: id,
    merged: false,
    needsAttention: false,
    attentionReason: null,
    ...(stackedOn ? { stackedOn } : {}),
    hasDescription: false,
    hasChat: false,
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
    hasDescription: false,
    hasChat: false,
  };
}

function commit(id: string, partOf: string): IssueRecord {
  return {
    id,
    kind: "commit",
    title: id,
    partOf,
    status: "todo",
    order: 0,
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
    needsAttention: false,
    attentionReason: null,
    hasDescription: false,
    hasChat: false,
  };
}

const issues: IssueRecord[] = [
  epic("e1"),
  epic("e2"),
  branch("a", "e1"),
  branch("b", "e1", "a"),
  branch("peer", "e1"),
  branch("x", "e2"),
  commit("c1", "b"),
];

describe("isBranchTreeDraggable", () => {
  it("allows branches only", () => {
    expect(isBranchTreeDraggable(branch("a", "e1"))).toBe(true);
    expect(isBranchTreeDraggable(epic("e1"))).toBe(false);
    expect(isBranchTreeDraggable(commit("c1", "b"))).toBe(false);
  });
});

describe("isBranchTreeDropTarget", () => {
  it("allows branches and epics", () => {
    expect(isBranchTreeDropTarget(branch("a", "e1"))).toBe(true);
    expect(isBranchTreeDropTarget(epic("e1"))).toBe(true);
  });

  it("refuses commits and other kinds", () => {
    expect(isBranchTreeDropTarget(commit("c1", "b"))).toBe(false);
    expect(
      isBranchTreeDropTarget({
        id: "p",
        kind: "project",
        title: "p",
        order: 0,
        createdAt: "2020-01-01T00:00:00.000Z",
        updatedAt: "2020-01-01T00:00:00.000Z",
        needsAttention: false,
        attentionReason: null,
        hasDescription: false,
        hasChat: false,
      }),
    ).toBe(false);
  });
});

describe("processBranchDrop", () => {
  it("calls onMove for a legal restack onto a branch", () => {
    const onMove = vi.fn();
    processBranchDrop({
      sourceId: "b",
      targetId: "peer",
      canDrop: (sourceId) =>
        canRestackBranchOntoBranch(issues, sourceId, "peer"),
      onMove,
    });
    expect(onMove).toHaveBeenCalledWith("b", "peer");
  });

  it("calls onMove for a legal reparent onto an epic", () => {
    const onMove = vi.fn();
    processBranchDrop({
      sourceId: "b",
      targetId: "e2",
      canDrop: (sourceId) => canDropBranchOntoEpic(issues, sourceId, "e2"),
      onMove,
    });
    expect(onMove).toHaveBeenCalledWith("b", "e2");
  });

  it("does not call onMove for illegal drops (self, descendant, commit target)", () => {
    const onMove = vi.fn();
    processBranchDrop({
      sourceId: "b",
      targetId: "b",
      canDrop: (sourceId) =>
        canRestackBranchOntoBranch(issues, sourceId, "b"),
      onMove,
    });
    processBranchDrop({
      sourceId: "a",
      targetId: "b",
      canDrop: (sourceId) =>
        canRestackBranchOntoBranch(issues, sourceId, "b"),
      onMove,
    });
    processBranchDrop({
      sourceId: "b",
      targetId: "c1",
      canDrop: () => isBranchTreeDropTarget(commit("c1", "b")),
      onMove,
    });
    expect(onMove).not.toHaveBeenCalled();
  });

  it("does not call onMove when sourceId is missing", () => {
    const onMove = vi.fn();
    processBranchDrop({
      sourceId: null,
      targetId: "peer",
      canDrop: () => true,
      onMove,
    });
    expect(onMove).not.toHaveBeenCalled();
  });
});
