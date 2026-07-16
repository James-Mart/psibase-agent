import { describe, expect, it } from "vitest";
import { assigneeOf } from "./assignee.js";
import type { IssueRecord } from "./schemas.js";

const AT = "2026-07-10T14:00:00.000Z";

function commit(assignee?: string): IssueRecord {
  return {
    id: "c1",
    kind: "commit",
    title: "C1",
    partOf: "a",
    status: "todo",
    createdAt: AT,
    updatedAt: AT,
    ...(assignee !== undefined ? { assignee } : {}),
  };
}

describe("assigneeOf", () => {
  it("returns undefined for a project", () => {
    expect(
      assigneeOf({
        id: "p",
        kind: "project",
        title: "P",
        createdAt: AT,
        updatedAt: AT,
      }),
    ).toBeUndefined();
  });

  it("returns undefined when assignee is absent", () => {
    expect(assigneeOf(commit())).toBeUndefined();
  });

  it("returns undefined for whitespace-only assignee", () => {
    expect(assigneeOf(commit("   "))).toBeUndefined();
  });

  it("trims surrounding whitespace", () => {
    expect(assigneeOf(commit("  composer-2.5  "))).toBe("composer-2.5");
  });
});
