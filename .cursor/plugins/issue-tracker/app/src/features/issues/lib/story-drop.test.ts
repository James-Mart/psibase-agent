import { describe, expect, it } from "vitest";
import type { IssueRecord } from "@server/schemas";
import {
  canDropStoryOntoEpic,
  canRestackStoryOntoStory,
} from "./story-drop";

function story(
  id: string,
  partOf: string,
  stackedOn?: string,
): IssueRecord {
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
    archived: false,
    hasDescription: false,
    hasChat: false,
  };
}

const issues: IssueRecord[] = [
  epic("e1"),
  epic("e2"),
  story("a", "e1"),
  story("b", "e1", "a"),
  story("c", "e1", "b"),
  story("peer", "e1"),
  story("x", "e2"),
];

describe("canRestackStoryOntoStory", () => {
  it("allows restack onto a peer in the same epic", () => {
    expect(canRestackStoryOntoStory(issues, "b", "peer")).toBe(true);
  });

  it("allows restack onto a branch in another epic", () => {
    expect(canRestackStoryOntoStory(issues, "b", "x")).toBe(true);
  });

  it("refuses self", () => {
    expect(canRestackStoryOntoStory(issues, "b", "b")).toBe(false);
  });

  it("refuses stackedOn descendants", () => {
    expect(canRestackStoryOntoStory(issues, "a", "b")).toBe(false);
    expect(canRestackStoryOntoStory(issues, "a", "c")).toBe(false);
  });

  it("refuses unknown source", () => {
    expect(canRestackStoryOntoStory(issues, "ghost", "a")).toBe(false);
  });
});

describe("canDropStoryOntoEpic", () => {
  it("allows reparent onto another epic", () => {
    expect(canDropStoryOntoEpic(issues, "b", "e2")).toBe(true);
  });

  it("allows unstack onto its own epic", () => {
    expect(canDropStoryOntoEpic(issues, "b", "e1")).toBe(true);
  });

  it("refuses unknown source", () => {
    expect(canDropStoryOntoEpic(issues, "ghost", "e1")).toBe(false);
  });

  it("refuses non-epic targets", () => {
    expect(canDropStoryOntoEpic(issues, "b", "a")).toBe(false);
  });
});
