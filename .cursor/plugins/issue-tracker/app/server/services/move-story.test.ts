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

function readJson(id: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(dir, id, "issue.json"), "utf8"));
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "issue-tracker-move-story-"));
  vi.resetModules();
  vi.stubEnv("ISSUES_DIR", dir);
  writeIssue("p", {
    kind: "project",
    title: "P",
    order: 0,
    createdAt: AT,
    updatedAt: AT,
  });
  writeIssue("e1", {
    kind: "epic",
    title: "E1",
    partOf: "p",
    order: 0,
    createdAt: AT,
    updatedAt: AT,
  });
  writeIssue("e2", {
    kind: "epic",
    title: "E2",
    partOf: "p",
    order: 1,
    createdAt: AT,
    updatedAt: AT,
  });
  // e1 stack: a (root) -> b -> c
  writeIssue("a", {
    kind: "story",
    title: "A",
    partOf: "e1",
    order: 0,
    createdAt: AT,
    updatedAt: AT,
  });
  writeIssue("b", {
    kind: "story",
    title: "B",
    partOf: "e1",
    stackedOn: "a",
    order: 0,
    createdAt: AT,
    updatedAt: AT,
  });
  writeIssue("c", {
    kind: "story",
    title: "C",
    partOf: "e1",
    stackedOn: "b",
    order: 0,
    createdAt: AT,
    updatedAt: AT,
  });
  // e2 has a root branch to restack onto / collide orders with
  writeIssue("x", {
    kind: "story",
    title: "X",
    partOf: "e2",
    order: 0,
    createdAt: AT,
    updatedAt: AT,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

async function load() {
  return import("./move-story.js");
}

async function loadList() {
  return import("./issues.js");
}

describe("moveStory", () => {
  it("restacks a whole stack onto a branch in the same epic", async () => {
    writeIssue("peer", {
      kind: "story",
      title: "Peer",
      partOf: "e1",
      order: 1,
      createdAt: AT,
      updatedAt: AT,
    });
    const { moveStory } = await load();
    const { list } = await loadList();

    const result = await moveStory("b", "peer");
    expect(result.moved).toEqual(["b", "c"]);

    expect(readJson("b").stackedOn).toBe("peer");
    expect(readJson("b").partOf).toBe("e1");
    expect(readJson("c").stackedOn).toBe("b");
    expect(readJson("c").partOf).toBe("e1");
    expect(readJson("a").stackedOn).toBeUndefined();
    expect(list().problems).toEqual([]);
  });

  it("moves a whole stack across epics when restacking onto a foreign branch", async () => {
    const { moveStory } = await load();
    const { list } = await loadList();

    const result = await moveStory("b", "x");
    expect(result.moved).toEqual(["b", "c"]);

    expect(readJson("b").partOf).toBe("e2");
    expect(readJson("b").stackedOn).toBe("x");
    expect(readJson("c").partOf).toBe("e2");
    expect(readJson("c").stackedOn).toBe("b");
    // Parent left behind in e1
    expect(readJson("a").partOf).toBe("e1");
    expect(list().problems).toEqual([]);
  });

  it("reparents a whole stack onto another epic as a new root stack", async () => {
    const { moveStory } = await load();
    const { list } = await loadList();

    const result = await moveStory("b", "e2");
    expect(result.moved).toEqual(["b", "c"]);

    expect(readJson("b").partOf).toBe("e2");
    expect(readJson("b").stackedOn).toBeUndefined();
    expect(readJson("c").partOf).toBe("e2");
    expect(readJson("c").stackedOn).toBe("b");
    // Appends among e2 roots (x already occupies order 0)
    expect(readJson("b").order).toBe(1);
    expect(list().problems).toEqual([]);
  });

  it("unstacks onto its own epic (clears stackedOn, keeps descendants)", async () => {
    const { moveStory } = await load();
    const { list } = await loadList();

    const result = await moveStory("b", "e1");
    expect(result.moved).toEqual(["b", "c"]);

    expect(readJson("b").partOf).toBe("e1");
    expect(readJson("b").stackedOn).toBeUndefined();
    expect(readJson("c").stackedOn).toBe("b");
    expect(readJson("c").partOf).toBe("e1");
    // Appends among e1 roots (a at order 0)
    expect(readJson("b").order).toBe(1);
    expect(list().problems).toEqual([]);
  });

  it("rejects restacking onto self", async () => {
    const { moveStory } = await load();
    await expect(moveStory("b", "b")).rejects.toThrow(/cycle/i);
  });

  it("rejects restacking onto a stackedOn descendant", async () => {
    const { moveStory } = await load();
    await expect(moveStory("a", "c")).rejects.toThrow(/cycle/i);
    // Nothing written
    expect(readJson("a").stackedOn).toBeUndefined();
    expect(readJson("b").stackedOn).toBe("a");
  });

  it("rejects a non-branch source", async () => {
    const { moveStory } = await load();
    await expect(moveStory("e1", "e2")).rejects.toThrow(/must be a story/);
  });

  it("rejects a commit or project target", async () => {
    writeIssue("c1", {
      kind: "task",
      title: "C1",
      partOf: "a",
      status: "todo",
      order: 0,
      createdAt: AT,
      updatedAt: AT,
    });
    const { moveStory } = await load();
    await expect(moveStory("b", "c1")).rejects.toThrow(/story or epic/);
    await expect(moveStory("b", "p")).rejects.toThrow(/story or epic/);
  });

  it("rejects an unknown source or target", async () => {
    const { moveStory } = await load();
    await expect(moveStory("ghost", "e1")).rejects.toThrow(/unknown issue/);
    await expect(moveStory("b", "ghost")).rejects.toThrow(/unknown issue/);
  });

  it("is a no-op when already unstacked under the target epic", async () => {
    const { moveStory } = await load();
    const before = readJson("a");
    const result = await moveStory("a", "e1");
    expect(result.moved).toEqual(["a", "b", "c"]);
    expect(readJson("a")).toEqual(before);
  });

  it("leaves commits under their branches when reparenting a stack", async () => {
    writeIssue("c1", {
      kind: "task",
      title: "C1",
      partOf: "b",
      status: "todo",
      order: 0,
      createdAt: AT,
      updatedAt: AT,
    });
    writeIssue("c2", {
      kind: "task",
      title: "C2",
      partOf: "c",
      status: "todo",
      order: 0,
      createdAt: AT,
      updatedAt: AT,
    });
    const { moveStory } = await load();

    await moveStory("b", "e2");

    expect(readJson("c1").partOf).toBe("b");
    expect(readJson("c2").partOf).toBe("c");
    expect(readJson("b").partOf).toBe("e2");
    expect(readJson("c").partOf).toBe("e2");
  });
});
