import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  initialMergeBase,
  EPIC_BASE,
  branchNameRenameError,
  planBranchNameMergeBaseCascade,
  planMergeBaseCascades,
  planMergedMergeBaseCascade,
  stackedChildren,
} from "./merge-base";
import type { Issue } from "../schemas";

const AT = "2026-07-09T14:00:00.000Z";

function branch(
  id: string,
  extra: Partial<Extract<Issue, { kind: "story" }>> = {},
): Issue {
  return {
    id,
    kind: "story",
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

describe("mergeBase cascades (planning)", () => {
  it("lists direct stacked children only", () => {
    const issues = [
      branch("parent"),
      branch("child", { stackedOn: "parent" }),
      branch("grand", { stackedOn: "child" }),
      branch("other", { stackedOn: "other-parent" }),
    ];
    expect(stackedChildren("parent", issues).map((c) => c.id)).toEqual([
      "child",
    ]);
  });

  it("first-time name fills only empty child mergeBases", () => {
    const issues = [
      branch("parent"),
      branch("empty", { stackedOn: "parent" }),
      branch("kept", { stackedOn: "parent", mergeBase: "already" }),
    ];
    expect(
      planBranchNameMergeBaseCascade("parent", "feat/parent", issues),
    ).toEqual([{ id: "empty", mergeBase: "feat/parent" }]);
  });

  it("set-merged retargets every child to the parent's mergeBase", () => {
    const issues = [
      branch("parent", { mergeBase: "main" }),
      branch("a", { stackedOn: "parent", mergeBase: "feat/parent" }),
      branch("b", { stackedOn: "parent", mergeBase: "main" }),
    ];
    expect(planMergedMergeBaseCascade("parent", "main", issues)).toEqual([
      { id: "a", mergeBase: "main" },
    ]);
  });

  it("set-merged is a no-op when parent mergeBase is unset", () => {
    const issues = [
      branch("parent"),
      branch("child", { stackedOn: "parent", mergeBase: "feat/parent" }),
    ];
    expect(planMergedMergeBaseCascade("parent", undefined, issues)).toEqual([]);
  });

  it("rename error allows same-value branchName with stacked children", () => {
    const existing = branch("parent", { branchName: "feat/parent" });
    const issues = [existing, branch("child", { stackedOn: "parent" })];
    expect(
      branchNameRenameError(existing, { branchName: "feat/parent" }, issues),
    ).toBeNull();
  });

  it("rename error refuses a real rename with stacked children", () => {
    const existing = branch("parent", { branchName: "feat/parent" });
    const issues = [existing, branch("child", { stackedOn: "parent" })];
    expect(
      branchNameRenameError(existing, { branchName: "feat/other" }, issues),
    ).toMatch(/cannot change branchName.*"parent".*child/);
  });

  it("planMergeBaseCascades wires first-time name and set-merged triggers", () => {
    const unnamed = branch("parent");
    const issues = [
      unnamed,
      branch("empty", { stackedOn: "parent" }),
      branch("kept", { stackedOn: "parent", mergeBase: "already" }),
    ];
    const named = { ...unnamed, branchName: "feat/parent" };
    expect(
      planMergeBaseCascades(unnamed, { branchName: "feat/parent" }, named, issues),
    ).toEqual([{ id: "empty", mergeBase: "feat/parent" }]);

    const parent = branch("parent", {
      branchName: "feat/parent",
      mergeBase: "main",
      merged: true,
    });
    const stacked = [
      parent,
      branch("a", { stackedOn: "parent", mergeBase: "feat/parent" }),
    ];
    expect(
      planMergeBaseCascades(parent, { merged: true }, parent, stacked),
    ).toEqual([{ id: "a", mergeBase: "main" }]);
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
      kind: "story",
      title: "Root",
      partOf: "e",
      branchName: "feat/root",
      order: 0,
      createdAt: AT,
      updatedAt: AT,
    });
    writeIssue("child-named", {
      kind: "story",
      title: "Child named parent",
      partOf: "e",
      stackedOn: "root",
      order: 0,
      createdAt: AT,
      updatedAt: AT,
    });
    writeIssue("orphan-parent", {
      kind: "story",
      title: "Unnamed root",
      partOf: "e",
      order: 1,
      createdAt: AT,
      updatedAt: AT,
    });
    writeIssue("child-unnamed", {
      kind: "story",
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
      kind: "story",
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
