import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const AT = "2026-07-09T14:00:00.000Z";
let dir: string;

function writeIssue(id: string, body: Record<string, unknown>): void {
  mkdirSync(join(dir, id), { recursive: true });
  writeFileSync(join(dir, id, "issue.json"), JSON.stringify({ id, ...body }));
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "issue-tracker-write-"));
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
  writeIssue("a", {
    kind: "branch",
    title: "A",
    partOf: "e",
    order: 0,
    createdAt: AT,
    updatedAt: AT,
  });
  writeIssue("b", {
    kind: "branch",
    title: "B",
    partOf: "e",
    order: 0,
    stackedOn: "a",
    createdAt: AT,
    updatedAt: AT,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

async function loadService() {
  return import("./issues.js");
}

describe("validate-at-write on the service layer", () => {
  it("rejects an update that would introduce a stackedOn cycle", async () => {
    const { update } = await loadService();
    await expect(update("a", { stackedOn: "b" })).rejects.toThrow(/cycle/i);
  });

  it("rejects an update with a dangling stackedOn", async () => {
    const { update } = await loadService();
    await expect(update("b", { stackedOn: "ghost" })).rejects.toThrow(
      /unknown issue/,
    );
  });

  it("rejects an update that would introduce an epic blockedBy cycle", async () => {
    // e2 already blocks on e; blocking e on e2 in turn would close the cycle.
    writeIssue("e2", {
      kind: "epic",
      title: "E2",
      partOf: "p",
      order: 1,
      blockedBy: ["e"],
      createdAt: AT,
      updatedAt: AT,
    });
    const { update } = await loadService();
    await expect(update("e", { blockedBy: ["e2"] })).rejects.toThrow(/cycle/i);
  });

  it("rejects a create whose stackedOn is not a branch", async () => {
    const { create } = await loadService();
    await expect(
      create({ kind: "branch", title: "C", partOf: "e", stackedOn: "e" }),
    ).rejects.toThrow(/must be a branch/);
  });

  it("accepts a valid stackedOn update", async () => {
    const { update } = await loadService();
    const record = await update("a", { branchName: "feat/a" });
    expect(record.kind === "branch" && record.branchName).toBe("feat/a");
  });

  it("defaults mergeBase to main on a root Branch create", async () => {
    const { create } = await loadService();
    const record = await create({ kind: "branch", title: "Root", partOf: "e" });
    expect(record.kind === "branch" && record.mergeBase).toBe("main");
  });

  it("sets mergeBase from a named parent's branchName on stacked create", async () => {
    const { create, update } = await loadService();
    await update("a", { branchName: "feat/a" });
    const child = await create({
      kind: "branch",
      title: "Child",
      partOf: "e",
      stackedOn: "a",
    });
    expect(child.kind === "branch" && child.mergeBase).toBe("feat/a");
  });

  it("leaves mergeBase unset when stacking on an unnamed parent", async () => {
    const { create } = await loadService();
    const child = await create({
      kind: "branch",
      title: "Child",
      partOf: "e",
      stackedOn: "a",
    });
    expect(child.kind === "branch" && child.mergeBase).toBeUndefined();
  });

  it("cascades mergeBase to empty stacked children on first set-branch-name", async () => {
    const { update } = await loadService();
    // Seed child "b" has no mergeBase; naming "a" should fill it.
    await update("a", { branchName: "feat/a" });
    const child = JSON.parse(
      readFileSync(join(dir, "b", "issue.json"), "utf8"),
    ) as { mergeBase?: string };
    expect(child.mergeBase).toBe("feat/a");
  });

  it("does not clobber a child mergeBase already set when naming the parent", async () => {
    writeIssue("kept", {
      kind: "branch",
      title: "Kept",
      partOf: "e",
      stackedOn: "a",
      mergeBase: "custom-base",
      order: 1,
      createdAt: AT,
      updatedAt: AT,
    });
    const { update } = await loadService();
    await update("a", { branchName: "feat/a" });
    const kept = JSON.parse(
      readFileSync(join(dir, "kept", "issue.json"), "utf8"),
    ) as { mergeBase?: string };
    const empty = JSON.parse(
      readFileSync(join(dir, "b", "issue.json"), "utf8"),
    ) as { mergeBase?: string };
    expect(kept.mergeBase).toBe("custom-base");
    expect(empty.mergeBase).toBe("feat/a");
  });

  it("refuses rename of branchName when stacked children exist", async () => {
    const { update } = await loadService();
    await update("a", { branchName: "feat/a" });
    await expect(update("a", { branchName: "feat/a-renamed" })).rejects.toThrow(
      /cannot change branchName.*"a".*stacked children.*\bb\b/,
    );
  });

  it("allows a same-value set-branch-name no-op even with stacked children", async () => {
    const { update } = await loadService();
    await update("a", { branchName: "feat/a" });
    const again = await update("a", { branchName: "feat/a" });
    expect(again.kind === "branch" && again.branchName).toBe("feat/a");
  });

  it("allows rename of branchName when there are no stacked children", async () => {
    const { update } = await loadService();
    await update("b", { stackedOn: null });
    await update("a", { branchName: "feat/a" });
    const renamed = await update("a", { branchName: "feat/a2" });
    expect(renamed.kind === "branch" && renamed.branchName).toBe("feat/a2");
  });

  it("retargets child mergeBase to parent.mergeBase on set-merged", async () => {
    const { update } = await loadService();
    await update("a", { branchName: "feat/a", mergeBase: "main" });
    // Child got feat/a from the name cascade; merging retargets to main.
    await update("a", { merged: true });
    const child = JSON.parse(
      readFileSync(join(dir, "b", "issue.json"), "utf8"),
    ) as { mergeBase?: string };
    expect(child.mergeBase).toBe("main");
  });

  it("set-merged mergeBase cascade is idempotent", async () => {
    const { update } = await loadService();
    await update("a", { branchName: "feat/a", mergeBase: "main" });
    await update("a", { merged: true });
    await update("a", { merged: true });
    const child = JSON.parse(
      readFileSync(join(dir, "b", "issue.json"), "utf8"),
    ) as { mergeBase?: string };
    expect(child.mergeBase).toBe("main");
  });

  it("appends order on create", async () => {
    const { create } = await loadService();
    const first = await create({ kind: "commit", title: "C1", partOf: "a" });
    const second = await create({ kind: "commit", title: "C2", partOf: "a" });
    expect(first.kind === "commit" && first.order).toBe(0);
    expect(second.kind === "commit" && second.order).toBe(1);
  });

  it("re-appends order when reparenting without an explicit order patch", async () => {
    const { create, update } = await loadService();
    const commit = await create({ kind: "commit", title: "Move me", partOf: "a" });
    const moved = await update(commit.id, { partOf: "b" });
    expect(moved.kind === "commit" && moved.order).toBe(0);
  });
});

// Moving a Branch between fork points (`set-stacked-on`) changes its sibling
// group, so its old `order` can collide in the destination bucket. These pin the
// re-append behavior that keeps restacks/unstacks/reparents from being refused.
// Seed (from beforeEach): epic e with root branch a (order 0) and b stacked on a
// (order 0).
describe("sibling order — restack / unstack / reparent", () => {
  function orderOf(id: string): number {
    return JSON.parse(readFileSync(join(dir, id, "issue.json"), "utf8")).order;
  }

  it("re-appends a branch's order when restacked onto a fork point that already has children", async () => {
    // a2 is a second root branch (order 1) already carrying a child x (order 0).
    writeIssue("a2", {
      kind: "branch",
      title: "A2",
      partOf: "e",
      order: 1,
      createdAt: AT,
      updatedAt: AT,
    });
    writeIssue("x", {
      kind: "branch",
      title: "X",
      partOf: "e",
      stackedOn: "a2",
      order: 0,
      createdAt: AT,
      updatedAt: AT,
    });
    const { update, list } = await loadService();
    // b (order 0, stacked on a) moves under a2, whose children already hold
    // order 0 (x). Without re-append b would collide; it must land at order 1.
    const moved = await update("b", { stackedOn: "a2" });
    expect(moved.kind === "branch" && moved.stackedOn).toBe("a2");
    expect(orderOf("b")).toBe(1);
    expect(orderOf("x")).toBe(0);
    expect(list().problems).toEqual([]);
  });

  it("re-appends among the epic's roots when a branch is unstacked (stackedOn cleared)", async () => {
    // b (stacked on a) becomes a root branch; roots currently hold a (order 0),
    // so b appends at order 1 rather than keeping its child-bucket order 0.
    const { update, list } = await loadService();
    const moved = await update("b", { stackedOn: null });
    expect(moved.kind === "branch" && moved.stackedOn).toBeUndefined();
    expect(orderOf("b")).toBe(1);
    expect(orderOf("a")).toBe(0);
    expect(list().problems).toEqual([]);
  });

  it("gives order 0 when restacked into a fork point with no other children", async () => {
    writeIssue("a2", {
      kind: "branch",
      title: "A2",
      partOf: "e",
      order: 1,
      createdAt: AT,
      updatedAt: AT,
    });
    const { update, list } = await loadService();
    // a2 has no children yet, so b appends at order 0 (a fresh bucket).
    await update("b", { stackedOn: "a2" });
    expect(orderOf("b")).toBe(0);
    expect(list().problems).toEqual([]);
  });

  it("honors an explicit order patch during a restack (no re-append override)", async () => {
    writeIssue("a2", {
      kind: "branch",
      title: "A2",
      partOf: "e",
      order: 1,
      createdAt: AT,
      updatedAt: AT,
    });
    const { update } = await loadService();
    await update("b", { stackedOn: "a2", order: 7 });
    expect(orderOf("b")).toBe(7);
  });

  it("leaves order untouched when set-stacked-on is a no-op (same group)", async () => {
    const { update } = await loadService();
    // b is already stacked on a; re-setting the same fork point must not shuffle.
    await update("b", { stackedOn: "a" });
    expect(orderOf("b")).toBe(0);
  });

  it("re-appends among the destination epic's roots when a branch is reparented across epics", async () => {
    writeIssue("e2", {
      kind: "epic",
      title: "E2",
      partOf: "p",
      order: 1,
      createdAt: AT,
      updatedAt: AT,
    });
    writeIssue("e2b", {
      kind: "branch",
      title: "E2B",
      partOf: "e2",
      order: 0,
      createdAt: AT,
      updatedAt: AT,
    });
    // A lone root branch in e (no children, no stackedOn) so the move is clean.
    writeIssue("lone", {
      kind: "branch",
      title: "Lone",
      partOf: "e",
      order: 2,
      createdAt: AT,
      updatedAt: AT,
    });
    const { update, list } = await loadService();
    await update("lone", { partOf: "e2" });
    // e2 roots already hold e2b (order 0), so lone appends at order 1.
    expect(orderOf("lone")).toBe(1);
    expect(orderOf("e2b")).toBe(0);
    expect(list().problems).toEqual([]);
  });
});

describe("cascade delete + reference repair on remove", () => {
  it("deletes a branch, its commits, and leaves the graph valid", async () => {
    writeIssue("c1", {
      kind: "commit",
      title: "C1",
      partOf: "b",
      status: "todo",
      createdAt: AT,
      updatedAt: AT,
    });
    const { remove, list } = await loadService();
    const result = await remove("b");
    expect([...result.deleted].sort()).toEqual(["b", "c1"]);

    const after = list();
    expect(after.problems).toEqual([]);
    expect(after.issues.map((i) => i.id).sort()).toEqual(["a", "e", "p"]);
  });

  it("splices a dependent branch when its fork point is deleted", async () => {
    const { remove, list } = await loadService();
    // b.stackedOn === "a"; deleting "a" must repoint b to main (stackedOn cleared).
    const result = await remove("a");
    expect(result.deleted).toEqual(["a"]);
    expect(result.repointed).toEqual([{ id: "b", to: undefined }]);

    const after = list();
    expect(after.problems).toEqual([]);
    const b = after.issues.find((i) => i.id === "b");
    expect(b && b.kind === "branch" ? b.stackedOn : "missing").toBeUndefined();
  });

  it("drops a deleted epic from another epic's blockedBy", async () => {
    writeIssue("victim", {
      kind: "epic",
      title: "Victim",
      partOf: "p",
      order: 1,
      createdAt: AT,
      updatedAt: AT,
    });
    writeIssue("keeper", {
      kind: "epic",
      title: "Keeper",
      partOf: "p",
      order: 2,
      blockedBy: ["victim"],
      createdAt: AT,
      updatedAt: AT,
    });
    const { remove, list } = await loadService();
    // Deleting the blocking epic drops it from keeper.blockedBy.
    await remove("victim");

    const after = list();
    expect(after.problems).toEqual([]);
    const keeper = after.issues.find((i) => i.id === "keeper");
    expect(keeper && "blockedBy" in keeper ? keeper.blockedBy : ["unexpected"]).toEqual([]);
  });

  it("deletes an entire epic subtree", async () => {
    const { remove, list } = await loadService();
    const result = await remove("e");
    expect([...result.deleted].sort()).toEqual(["a", "b", "e"]);
    expect(list().issues.map((i) => i.id)).toEqual(["p"]);
  });

  it("deletes a project and its entire epic subtree", async () => {
    const { remove, list } = await loadService();
    const result = await remove("p");
    expect([...result.deleted].sort()).toEqual(["a", "b", "e", "p"]);
    expect(list().issues).toEqual([]);
  });
});
