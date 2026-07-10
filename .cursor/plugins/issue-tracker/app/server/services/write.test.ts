import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
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
  writeIssue("p", { kind: "project", title: "P", createdAt: AT, updatedAt: AT });
  writeIssue("e", {
    kind: "epic",
    title: "E",
    partOf: "p",
    createdAt: AT,
    updatedAt: AT,
  });
  writeIssue("a", {
    kind: "branch",
    title: "A",
    partOf: "e",
    createdAt: AT,
    updatedAt: AT,
  });
  writeIssue("b", {
    kind: "branch",
    title: "B",
    partOf: "e",
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

  it("rejects an update that would introduce a blockedBy cycle", async () => {
    const { update } = await loadService();
    await expect(update("a", { blockedBy: ["b"] })).rejects.toThrow(/cycle/i);
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

  it("drops a deleted branch from another branch's blockedBy", async () => {
    writeIssue("d", {
      kind: "branch",
      title: "D",
      partOf: "e",
      blockedBy: ["a"],
      merged: false,
      createdAt: AT,
      updatedAt: AT,
    });
    const { remove, list } = await loadService();
    // Deleting "a" splices b -> main and drops "a" from d.blockedBy.
    await remove("a");

    const after = list();
    expect(after.problems).toEqual([]);
    const d = after.issues.find((i) => i.id === "d");
    expect(d && "blockedBy" in d ? d.blockedBy : ["unexpected"]).toEqual([]);
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
