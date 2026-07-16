import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialMergeBase, EPIC_BASE } from "./merge-base";
import type { Issue } from "../schemas";

const AT = "2026-07-09T14:00:00.000Z";

function branch(
  id: string,
  extra: Partial<Extract<Issue, { kind: "branch" }>> = {},
): Issue {
  return {
    id,
    kind: "branch",
    title: id,
    partOf: "e",
    order: 0,
    merged: false,
    needsAttention: false,
    attentionReason: null,
    createdAt: AT,
    updatedAt: AT,
    ...extra,
  };
}

describe("initialMergeBase", () => {
  it("defaults a root Branch to main", () => {
    expect(initialMergeBase(undefined, [])).toBe(EPIC_BASE);
  });

  it("uses the parent's branchName when the parent is already named", () => {
    const issues = [branch("parent", { branchName: "feat/parent" })];
    expect(initialMergeBase("parent", issues)).toBe("feat/parent");
  });

  it("leaves a stacked child unset when the parent has no branchName", () => {
    const issues = [branch("parent")];
    expect(initialMergeBase("parent", issues)).toBeUndefined();
  });
});

describe("backfill value (initialMergeBase ?? main)", () => {
  it("uses branchName(stackedOn) ?? main", () => {
    expect(initialMergeBase(undefined, []) ?? EPIC_BASE).toBe(EPIC_BASE);
    expect(
      initialMergeBase("parent", [
        branch("parent", { branchName: "feat/parent" }),
      ]) ?? EPIC_BASE,
    ).toBe("feat/parent");
    expect(initialMergeBase("parent", [branch("parent")]) ?? EPIC_BASE).toBe(
      EPIC_BASE,
    );
  });
});

describe("ensureMergeBaseBackfilled (via list)", () => {
  let dir: string;

  function writeIssue(id: string, body: Record<string, unknown>): void {
    mkdirSync(join(dir, id), { recursive: true });
    writeFileSync(join(dir, id, "issue.json"), JSON.stringify({ id, ...body }));
  }

  function readIssue(id: string): Record<string, unknown> {
    return JSON.parse(readFileSync(join(dir, id, "issue.json"), "utf8"));
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "issue-tracker-merge-base-"));
    vi.resetModules();
    vi.stubEnv("ISSUES_DIR", dir);
    writeIssue("p", { kind: "project", title: "P", order: 0, createdAt: AT, updatedAt: AT });
    writeIssue("e", {
      kind: "epic",
      title: "E",
      partOf: "p",
      order: 0,
      createdAt: AT,
      updatedAt: AT,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  it("backfills missing mergeBase once: root→main, child→parent name or main", async () => {
    writeIssue("root", {
      kind: "branch",
      title: "Root",
      partOf: "e",
      branchName: "feat/root",
      order: 0,
      createdAt: AT,
      updatedAt: AT,
    });
    writeIssue("child-named", {
      kind: "branch",
      title: "Child named parent",
      partOf: "e",
      stackedOn: "root",
      order: 0,
      createdAt: AT,
      updatedAt: AT,
    });
    writeIssue("orphan-parent", {
      kind: "branch",
      title: "Unnamed root",
      partOf: "e",
      order: 1,
      createdAt: AT,
      updatedAt: AT,
    });
    writeIssue("child-unnamed", {
      kind: "branch",
      title: "Child unnamed parent",
      partOf: "e",
      stackedOn: "orphan-parent",
      order: 0,
      createdAt: AT,
      updatedAt: AT,
    });

    const { list } = await import("./issues.js");
    list();

    expect(readIssue("root").mergeBase).toBe(EPIC_BASE);
    expect(readIssue("child-named").mergeBase).toBe("feat/root");
    expect(readIssue("orphan-parent").mergeBase).toBe(EPIC_BASE);
    // Pre-field children of unnamed parents still get main (legacy formula).
    expect(readIssue("child-unnamed").mergeBase).toBe(EPIC_BASE);

    // Second list does not clobber an intentional post-migration clear.
    writeIssue("fresh-child", {
      kind: "branch",
      title: "Fresh",
      partOf: "e",
      stackedOn: "orphan-parent",
      order: 1,
      createdAt: AT,
      updatedAt: AT,
    });
    list();
    expect(readIssue("fresh-child").mergeBase).toBeUndefined();
  });
});
