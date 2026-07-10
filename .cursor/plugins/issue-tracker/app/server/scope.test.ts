import { describe, expect, it } from "vitest";
import { resolveProjectId } from "./scope";
import type { IssueRecord } from "./schemas";

const AT = "2026-07-10T14:00:00.000Z";

// Minimal fixture: resolveProjectId only reads id/kind/title, so we cast a
// partial shape rather than constructing every field.
const record = (
  id: string,
  kind: IssueRecord["kind"],
  title: string,
): IssueRecord =>
  ({
    id,
    kind,
    title,
    partOf: kind === "project" ? undefined : "p",
    createdAt: AT,
    updatedAt: AT,
    hasDescription: false,
    hasChat: false,
  }) as unknown as IssueRecord;

describe("resolveProjectId", () => {
  it("returns the id on an exact project id match", () => {
    const issues = [record("proj-a", "project", "Alpha")];
    expect(resolveProjectId(issues, "proj-a")).toBe("proj-a");
  });

  it("resolves a unique project title to its id", () => {
    const issues = [
      record("proj-a", "project", "Alpha"),
      record("proj-b", "project", "Beta"),
    ];
    expect(resolveProjectId(issues, "Beta")).toBe("proj-b");
  });

  it("prefers an exact id match over a same-valued title", () => {
    // A project whose id equals another project's title must not be shadowed.
    const issues = [
      record("Beta", "project", "Alpha"),
      record("proj-b", "project", "Beta"),
    ];
    expect(resolveProjectId(issues, "Beta")).toBe("Beta");
  });

  it("ignores non-project issues that happen to share the title", () => {
    const issues = [
      record("proj-a", "project", "Shared"),
      record("epic-1", "epic", "Shared"),
    ];
    expect(resolveProjectId(issues, "Shared")).toBe("proj-a");
  });

  it("throws on an ambiguous title matching multiple projects", () => {
    const issues = [
      record("proj-a", "project", "Dup"),
      record("proj-b", "project", "Dup"),
    ];
    expect(() => resolveProjectId(issues, "Dup")).toThrow(
      /ambiguous project title "Dup" matches 2 projects/,
    );
  });

  it("throws on an unknown project id or title", () => {
    const issues = [record("proj-a", "project", "Alpha")];
    expect(() => resolveProjectId(issues, "nope")).toThrow(
      /unknown project "nope"/,
    );
  });
});
