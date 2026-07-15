import { describe, expect, it } from "vitest";
import type { IssueRecord } from "@server/schemas";
import {
  canDropBranchOntoEpic,
  canRestackBranchOntoBranch,
} from "./branch-drop";

function branch(
  id: string,
  partOf: string,
  stackedOn?: string,
): IssueRecord {
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

const issues: IssueRecord[] = [
  epic("e1"),
  epic("e2"),
  branch("a", "e1"),
  branch("b", "e1", "a"),
  branch("c", "e1", "b"),
  branch("peer", "e1"),
  branch("x", "e2"),
];

describe("canRestackBranchOntoBranch", () => {
  it("allows restack onto a peer in the same epic", () => {
    expect(canRestackBranchOntoBranch(issues, "b", "peer")).toBe(true);
  });

  it("allows restack onto a branch in another epic", () => {
    expect(canRestackBranchOntoBranch(issues, "b", "x")).toBe(true);
  });

  it("refuses self", () => {
    expect(canRestackBranchOntoBranch(issues, "b", "b")).toBe(false);
  });

  it("refuses stackedOn descendants", () => {
    expect(canRestackBranchOntoBranch(issues, "a", "b")).toBe(false);
    expect(canRestackBranchOntoBranch(issues, "a", "c")).toBe(false);
  });

  it("refuses unknown source", () => {
    expect(canRestackBranchOntoBranch(issues, "ghost", "a")).toBe(false);
  });
});

describe("canDropBranchOntoEpic", () => {
  it("allows reparent onto another epic", () => {
    expect(canDropBranchOntoEpic(issues, "b", "e2")).toBe(true);
  });

  it("allows unstack onto its own epic", () => {
    expect(canDropBranchOntoEpic(issues, "b", "e1")).toBe(true);
  });

  it("refuses unknown source", () => {
    expect(canDropBranchOntoEpic(issues, "ghost", "e1")).toBe(false);
  });

  it("refuses non-epic targets", () => {
    expect(canDropBranchOntoEpic(issues, "b", "a")).toBe(false);
  });
});
