import { describe, expect, it } from "vitest";
import type { IssueRecord } from "@server/schemas";
import { buildTree } from "./build-tree";
import { projectBoardRoots } from "./project-board-roots";

function project(id = "p"): IssueRecord {
  return {
    id,
    kind: "project",
    title: id,
    order: 0,
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
  };
}

function epic(id: string, order: number, partOf = "p"): IssueRecord {
  return {
    id,
    kind: "epic",
    title: id,
    partOf,
    order,
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
    needsAttention: false,
    attentionReason: null,
    blockedBy: [],
    archived: false,
  };
}

function idea(id: string, order: number, partOf = "p"): IssueRecord {
  return {
    id,
    kind: "idea",
    title: id,
    partOf,
    order,
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
    archived: false,
  };
}

function story(id: string, partOf: string, order = 0): IssueRecord {
  return {
    id,
    kind: "story",
    title: id,
    partOf,
    order,
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
    branchName: id,
    merged: false,
    needsAttention: false,
    attentionReason: null,
    archived: false,
  };
}

const boardIssues = [
  project(),
  idea("first", 0),
  epic("middle", 1),
  idea("last", 2),
  story("s1", "middle"),
];

describe("projectBoardRoots", () => {
  it("interleaves epics and ideas by order", () => {
    expect(projectBoardRoots(boardIssues, "both").map((issue) => issue.id)).toEqual(
      ["first", "middle", "last"],
    );
  });

  it("shows only epics when filtered", () => {
    expect(projectBoardRoots(boardIssues, "epic").map((issue) => issue.id)).toEqual(
      ["middle"],
    );
  });

  it("shows only ideas when filtered", () => {
    expect(projectBoardRoots(boardIssues, "idea").map((issue) => issue.id)).toEqual(
      ["first", "last"],
    );
  });

  it("only considers issues in the input set (project-scoped upstream)", () => {
    const scoped = boardIssues.filter((issue) => issue.id !== "last");
    expect(projectBoardRoots(scoped, "both").map((issue) => issue.id)).toEqual(
      ["first", "middle"],
    );
  });
});

describe("buildTree", () => {
  it("nests stories under their epic", () => {
    const roots = projectBoardRoots(boardIssues, "both");
    const nodes = buildTree(boardIssues, roots);
    const epicNode = nodes.find((node) => node.issue.id === "middle");
    expect(epicNode?.children.map((child) => child.issue.id)).toEqual(["s1"]);
  });

  it("honors an explicit root subset without rebuilding unrelated branches", () => {
    const roots = projectBoardRoots(boardIssues, "idea");
    const nodes = buildTree(boardIssues, roots);
    expect(nodes.map((node) => node.issue.id)).toEqual(["first", "last"]);
    expect(nodes.every((node) => node.children.length === 0)).toBe(true);
  });
});
