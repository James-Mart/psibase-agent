import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApplyDoc, ProjectApplyDoc } from "./apply-schema.js";

const AT = "2026-07-09T14:00:00.000Z";
let dir: string;

function writeIssue(id: string, body: Record<string, unknown>): void {
  mkdirSync(join(dir, id), { recursive: true });
  writeFileSync(join(dir, id, "issue.json"), JSON.stringify({ id, ...body }));
}

function readIssue(id: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(dir, id, "issue.json"), "utf8"));
}

// A stable, order-independent snapshot of every file the service writes, used to
// assert that a rejected apply leaves the on-disk state byte-for-byte unchanged.
function snapshot(): string {
  if (!existsSync(dir)) return "{}";
  const tree: Record<string, Record<string, string>> = {};
  for (const id of readdirSync(dir).sort()) {
    const idDir = join(dir, id);
    const files: Record<string, string> = {};
    for (const file of ["issue.json", "description.md", "chat.jsonl"]) {
      const path = join(idDir, file);
      if (existsSync(path)) files[file] = readFileSync(path, "utf8");
    }
    tree[id] = files;
  }
  return JSON.stringify(tree);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "issue-tracker-apply-"));
  vi.resetModules();
  vi.stubEnv("ISSUES_DIR", dir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

async function loadService() {
  const apply = (await import("./apply.js")).apply;
  const issues = await import("./issues.js");
  return { apply, ...issues };
}

// A representative tree: project > epic > two root branches, one carrying a
// commit and a stacked child. `blockedBy` covers the forward-reference case
// (b1 blocks on b2, which is declared after it in the same epic). The stacked
// edge (b1s -> b1) and the blockedBy edge (b1 -> b2) are deliberately distinct
// so the dependency graph stays acyclic.
function baseDoc(): ProjectApplyDoc {
  return {
    project: {
      id: "proj",
      title: "Project",
      description: "Project overview\n",
      epics: [
        {
          id: "epic-a",
          title: "Epic A",
          branches: [
            {
              id: "b1",
              title: "Branch one",
              blockedBy: ["b2"],
              commits: [{ id: "c1", title: "Commit one" }],
              stacked: [{ id: "b1s", title: "Stacked on one" }],
            },
            { id: "b2", title: "Branch two" },
          ],
        },
      ],
    },
  };
}

describe("apply — create from empty", () => {
  it("creates the whole declared tree with inferred relationships", async () => {
    const { apply, list } = await loadService();
    const summary = await apply(baseDoc());

    expect(summary.created.sort()).toEqual(
      ["b1", "b1s", "b2", "c1", "epic-a", "proj"].sort(),
    );
    expect(summary.updated).toEqual([]);
    expect(summary.deleted).toEqual([]);

    const result = list();
    expect(result.problems).toEqual([]);
    const byId = new Map(result.issues.map((i) => [i.id, i]));

    expect(byId.get("proj")?.kind).toBe("project");
    const epic = byId.get("epic-a");
    expect(epic?.kind).toBe("epic");
    expect(epic && "partOf" in epic && epic.partOf).toBe("proj");

    const b1 = byId.get("b1");
    if (b1?.kind !== "branch") throw new Error("b1 missing");
    expect(b1.partOf).toBe("epic-a");
    expect(b1.stackedOn).toBeUndefined();
    expect(b1.blockedBy).toEqual(["b2"]);

    const b1s = byId.get("b1s");
    if (b1s?.kind !== "branch") throw new Error("b1s missing");
    expect(b1s.partOf).toBe("epic-a");
    expect(b1s.stackedOn).toBe("b1");

    const b2 = byId.get("b2");
    if (b2?.kind !== "branch") throw new Error("b2 missing");
    expect(b2.partOf).toBe("epic-a");
    expect(b2.stackedOn).toBeUndefined();

    const c1 = byId.get("c1");
    if (c1?.kind !== "commit") throw new Error("c1 missing");
    expect(c1.partOf).toBe("b1");
    expect(c1.status).toBe("todo");

    // Every node got a description.md (author-supplied or the default heading).
    expect(byId.get("proj")?.hasDescription).toBe(true);
    expect(readFileSync(join(dir, "proj", "description.md"), "utf8")).toBe(
      "Project overview\n",
    );
  });

  it("resolves a forward blockedBy reference to a sibling declared later", async () => {
    const { apply, list } = await loadService();
    // Sole focus: `early` blocks on `late`, which the doc declares *after* it in
    // the same epic. apply must resolve the forward edge rather than reject a
    // reference to an as-yet-unseen node.
    const doc: ApplyDoc = {
      project: {
        id: "fp",
        title: "FP",
        epics: [
          {
            id: "fe",
            title: "FE",
            branches: [
              { id: "early", title: "Early", blockedBy: ["late"] },
              { id: "late", title: "Late" },
            ],
          },
        ],
      },
    };
    await apply(doc);

    const result = list();
    expect(result.problems).toEqual([]);
    const early = result.issues.find((i) => i.id === "early");
    expect(
      early && early.kind === "branch" ? early.blockedBy : ["missing"],
    ).toEqual(["late"]);
  });
});

describe("apply — idempotent re-apply", () => {
  it("is a no-op and does not churn updatedAt", async () => {
    const { apply } = await loadService();
    await apply(baseDoc());

    const before = new Map(
      ["proj", "epic-a", "b1", "b1s", "b2", "c1"].map((id) => [
        id,
        readIssue(id).updatedAt as string,
      ]),
    );
    const beforeBytes = snapshot();

    const summary = await apply(baseDoc());
    expect(summary).toEqual({ created: [], updated: [], deleted: [] });

    for (const [id, updatedAt] of before) {
      expect(readIssue(id).updatedAt).toBe(updatedAt);
    }
    // Beyond the updatedAt guard: a no-op re-apply must not rewrite any file,
    // including description.md, so the on-disk bytes are identical.
    expect(snapshot()).toBe(beforeBytes);
  });
});

describe("apply — update preserves imperative progress state", () => {
  it("keeps progress fields and chat.jsonl when the doc updates a node", async () => {
    const { apply, update, appendMessage, readChat } = await loadService();
    await apply(baseDoc());

    // Stamp imperative/runtime state that lives outside the doc.
    await update("b2", {
      branchName: "feat/b2",
      prUrl: "https://example.test/pr/2",
      merged: true,
      assignee: "ada",
      needsAttention: true,
      attentionReason: "waiting on review",
    });
    await update("c1", {
      status: "done",
      commitSha: "deadbeef",
      assignee: "bob",
      needsAttention: true,
      attentionReason: "verify locally",
    });
    await appendMessage("b2", { role: "agent", body: "progress note" });

    // Re-apply with changed titles so b2 and c1 actually go through the update path.
    const doc = baseDoc();
    doc.project.epics![0].branches![1].title = "Branch two renamed";
    doc.project.epics![0].branches![0].commits![0].title = "Commit one renamed";
    const summary = await apply(doc);
    expect(summary.updated.sort()).toEqual(["b2", "c1"]);
    expect(summary.deleted).toEqual([]);

    const b2 = readIssue("b2");
    expect(b2.title).toBe("Branch two renamed");
    expect(b2.branchName).toBe("feat/b2");
    expect(b2.prUrl).toBe("https://example.test/pr/2");
    expect(b2.merged).toBe(true);
    expect(b2.assignee).toBe("ada");
    expect(b2.needsAttention).toBe(true);
    expect(b2.attentionReason).toBe("waiting on review");

    const c1 = readIssue("c1");
    expect(c1.title).toBe("Commit one renamed");
    expect(c1.status).toBe("done");
    expect(c1.commitSha).toBe("deadbeef");
    expect(c1.assignee).toBe("bob");
    expect(c1.needsAttention).toBe(true);
    expect(c1.attentionReason).toBe("verify locally");

    const chat = readChat("b2");
    expect(chat.problems).toEqual([]);
    expect(chat.messages.map((m) => m.body)).toEqual(["progress note"]);
  });
});

describe("apply — prune by default", () => {
  it("removes omitted in-project nodes (cascade) and repairs a cross-project blockedBy", async () => {
    // Two projects on disk. p2's out-of-project branch blocks on p1's b2.
    // Under b2: a commit (c2) and a stacked child branch (b2s), so pruning b2
    // exercises both edge kinds — the commit-under-branch case *and* a stacked
    // branch. b2s carries a chat.jsonl so we can prove the whole node directory
    // is gone, not just its id absent from list().
    writeIssue("p1", { kind: "project", title: "P1", createdAt: AT, updatedAt: AT });
    writeIssue("e1", { kind: "epic", title: "E1", partOf: "p1", createdAt: AT, updatedAt: AT });
    writeIssue("b1", { kind: "branch", title: "B1", partOf: "e1", createdAt: AT, updatedAt: AT });
    writeIssue("b2", { kind: "branch", title: "B2", partOf: "e1", createdAt: AT, updatedAt: AT });
    writeIssue("c2", {
      kind: "commit",
      title: "C2",
      partOf: "b2",
      status: "todo",
      createdAt: AT,
      updatedAt: AT,
    });
    writeIssue("b2s", {
      kind: "branch",
      title: "B2 stacked",
      partOf: "e1",
      stackedOn: "b2",
      createdAt: AT,
      updatedAt: AT,
    });
    writeFileSync(
      join(dir, "b2s", "chat.jsonl"),
      '{"role":"agent","body":"progress"}\n',
    );
    writeIssue("p2", { kind: "project", title: "P2", createdAt: AT, updatedAt: AT });
    writeIssue("e2", { kind: "epic", title: "E2", partOf: "p2", createdAt: AT, updatedAt: AT });
    writeIssue("b-out", {
      kind: "branch",
      title: "Out",
      partOf: "e2",
      blockedBy: ["b2"],
      createdAt: AT,
      updatedAt: AT,
    });

    const { apply, list } = await loadService();
    // Declare p1 with only b1; b2 and its whole subtree (commit c2, stacked
    // child b2s) are omitted → pruned.
    const doc: ApplyDoc = {
      project: {
        id: "p1",
        title: "P1",
        epics: [
          { id: "e1", title: "E1", branches: [{ id: "b1", title: "B1" }] },
        ],
      },
    };
    const summary = await apply(doc);
    expect(summary.deleted.sort()).toEqual(["b2", "b2s", "c2"].sort());

    const result = list();
    expect(result.problems).toEqual([]);
    const ids = result.issues.map((i) => i.id).sort();
    expect(ids).not.toContain("b2");
    expect(ids).not.toContain("c2");
    expect(ids).not.toContain("b2s");
    expect(ids).toContain("b1");

    // Pruning removes the node directories (chat.jsonl included), not just ids.
    expect(existsSync(join(dir, "b2"))).toBe(false);
    expect(existsSync(join(dir, "c2"))).toBe(false);
    expect(existsSync(join(dir, "b2s"))).toBe(false);
    expect(existsSync(join(dir, "b2s", "chat.jsonl"))).toBe(false);
    expect(existsSync(join(dir, "b1"))).toBe(true);

    // The surviving out-of-project blocker edge into the pruned branch is dropped.
    const bOut = result.issues.find((i) => i.id === "b-out");
    expect(bOut && bOut.kind === "branch" ? bOut.blockedBy : ["unrepaired"]).toEqual(
      [],
    );
  });
});

describe("apply — atomic rejection", () => {
  it("makes no partial writes when the prospective graph is invalid", async () => {
    const { apply } = await loadService();
    await apply(baseDoc());

    const before = snapshot();

    // A new epic + branch that references a non-existent blocker. Valid shape,
    // but the whole prospective set fails integrity, so nothing may be written.
    const doc = baseDoc();
    doc.project.epics!.push({
      id: "epic-b",
      title: "Epic B",
      branches: [{ id: "b3", title: "Branch three", blockedBy: ["ghost"] }],
    });

    await expect(apply(doc)).rejects.toThrow(/unknown issue "ghost"/);

    expect(existsSync(join(dir, "epic-b"))).toBe(false);
    expect(existsSync(join(dir, "b3"))).toBe(false);
    expect(snapshot()).toBe(before);
  });

  it("rejects a create colliding with an id outside the declared project", async () => {
    // An orphan branch owned by a different project.
    writeIssue("p2", { kind: "project", title: "P2", createdAt: AT, updatedAt: AT });
    writeIssue("e2", { kind: "epic", title: "E2", partOf: "p2", createdAt: AT, updatedAt: AT });
    writeIssue("shared", {
      kind: "branch",
      title: "Shared",
      partOf: "e2",
      createdAt: AT,
      updatedAt: AT,
    });

    const { apply } = await loadService();
    const before = snapshot();

    const doc: ApplyDoc = {
      project: {
        id: "p1",
        title: "P1",
        epics: [
          {
            id: "e1",
            title: "E1",
            branches: [{ id: "shared", title: "Collision" }],
          },
        ],
      },
    };
    await expect(apply(doc)).rejects.toThrow(
      /already exists outside the target project/,
    );

    // The doc's project was never created, and the orphan is untouched.
    expect(existsSync(join(dir, "p1"))).toBe(false);
    expect(existsSync(join(dir, "e1"))).toBe(false);
    expect(snapshot()).toBe(before);
  });
});

describe("apply — epic-scoped doc", () => {
  // p1 has two epics: e1 (b1 kept + b-old to prune) and e2 (b2). Rooting the doc
  // at e1 must prune only within e1 and leave e2, b2, and the project alone.
  function seedTwoEpicProject(): void {
    writeIssue("p1", { kind: "project", title: "P1", createdAt: AT, updatedAt: AT });
    writeIssue("e1", { kind: "epic", title: "E1", partOf: "p1", createdAt: AT, updatedAt: AT });
    writeIssue("b1", { kind: "branch", title: "B1", partOf: "e1", createdAt: AT, updatedAt: AT });
    writeIssue("b-old", { kind: "branch", title: "Old", partOf: "e1", createdAt: AT, updatedAt: AT });
    writeIssue("e2", { kind: "epic", title: "E2", partOf: "p1", createdAt: AT, updatedAt: AT });
    writeIssue("b2", { kind: "branch", title: "B2", partOf: "e2", createdAt: AT, updatedAt: AT });
  }

  it("prunes within the target epic only and leaves siblings + project untouched", async () => {
    seedTwoEpicProject();
    const { apply, list } = await loadService();

    const doc = {
      project: "p1",
      epic: { id: "e1", title: "E1", branches: [{ id: "b1", title: "B1" }] },
    } as ApplyDoc;
    const summary = await apply(doc);

    expect(summary.deleted).toEqual(["b-old"]);
    expect(existsSync(join(dir, "b-old"))).toBe(false);
    // Everything outside e1's subtree survives unchanged.
    expect(list().issues.map((i) => i.id).sort()).toEqual(
      ["b1", "b2", "e1", "e2", "p1"].sort(),
    );
  });

  it("rejects when the referenced project does not exist", async () => {
    const { apply } = await loadService();
    const doc = { project: "ghost", epic: { id: "e1", title: "E1" } } as ApplyDoc;
    await expect(apply(doc)).rejects.toThrow(/project "ghost" does not exist/);
  });

  it("rejects when the epic already belongs to a different project", async () => {
    writeIssue("p1", { kind: "project", title: "P1", createdAt: AT, updatedAt: AT });
    writeIssue("p2", { kind: "project", title: "P2", createdAt: AT, updatedAt: AT });
    writeIssue("e1", { kind: "epic", title: "E1", partOf: "p2", createdAt: AT, updatedAt: AT });
    const { apply } = await loadService();
    const before = snapshot();

    const doc = { project: "p1", epic: { id: "e1", title: "E1" } } as ApplyDoc;
    await expect(apply(doc)).rejects.toThrow(/already belongs to "p2"/);
    expect(snapshot()).toBe(before);
  });
});

describe("apply — branch-scoped doc", () => {
  // A stacked branch `feat` (forked off `base`) with one commit, plus `base` and
  // its own commit. Rooting the doc at `feat` reconciles only feat + its commits;
  // base and its commit are outside feat's subtree, and feat's fork point (which
  // a branch doc cannot express) must be preserved.
  function seedStack(): void {
    writeIssue("p1", { kind: "project", title: "P1", createdAt: AT, updatedAt: AT });
    writeIssue("e1", { kind: "epic", title: "E1", partOf: "p1", createdAt: AT, updatedAt: AT });
    writeIssue("base", { kind: "branch", title: "Base", partOf: "e1", createdAt: AT, updatedAt: AT });
    writeIssue("base-c", {
      kind: "commit",
      title: "Base commit",
      partOf: "base",
      status: "todo",
      createdAt: AT,
      updatedAt: AT,
    });
    writeIssue("feat", {
      kind: "branch",
      title: "Feat",
      partOf: "e1",
      stackedOn: "base",
      createdAt: AT,
      updatedAt: AT,
    });
    writeIssue("feat-old", {
      kind: "commit",
      title: "Old commit",
      partOf: "feat",
      status: "todo",
      createdAt: AT,
      updatedAt: AT,
    });
  }

  it("reconciles the branch's commit list, preserves the fork point, and leaves the rest", async () => {
    seedStack();
    const { apply, list } = await loadService();

    const doc = {
      project: "p1",
      epic: "e1",
      branch: {
        id: "feat",
        title: "Feat",
        commits: [{ id: "feat-new", title: "New commit" }],
      },
    } as ApplyDoc;
    const summary = await apply(doc);

    expect(summary.created).toEqual(["feat-new"]);
    expect(summary.deleted).toEqual(["feat-old"]);
    expect(existsSync(join(dir, "feat-old"))).toBe(false);

    const byId = new Map(list().issues.map((i) => [i.id, i]));
    // The fork point is preserved even though the branch doc never declared it.
    const feat = byId.get("feat");
    expect(feat?.kind === "branch" ? feat.stackedOn : undefined).toBe("base");
    // base and its commit sit outside feat's subtree, so they are untouched.
    expect(byId.get("base")?.kind).toBe("branch");
    expect(byId.get("base-c")?.kind).toBe("commit");
    expect(list().problems).toEqual([]);
  });

  it("rejects when the epic is not in the referenced project", async () => {
    writeIssue("p1", { kind: "project", title: "P1", createdAt: AT, updatedAt: AT });
    writeIssue("p2", { kind: "project", title: "P2", createdAt: AT, updatedAt: AT });
    writeIssue("e1", { kind: "epic", title: "E1", partOf: "p2", createdAt: AT, updatedAt: AT });
    const { apply } = await loadService();

    const doc = {
      project: "p1",
      epic: "e1",
      branch: { id: "b", title: "B" },
    } as ApplyDoc;
    await expect(apply(doc)).rejects.toThrow(/already belongs to "p2"/);
  });

  it("rejects when the branch already belongs to a different epic", async () => {
    writeIssue("p1", { kind: "project", title: "P1", createdAt: AT, updatedAt: AT });
    writeIssue("e1", { kind: "epic", title: "E1", partOf: "p1", createdAt: AT, updatedAt: AT });
    writeIssue("e-other", { kind: "epic", title: "Other", partOf: "p1", createdAt: AT, updatedAt: AT });
    writeIssue("feat", { kind: "branch", title: "Feat", partOf: "e-other", createdAt: AT, updatedAt: AT });
    const { apply } = await loadService();

    const doc = {
      project: "p1",
      epic: "e1",
      branch: { id: "feat", title: "Feat" },
    } as ApplyDoc;
    await expect(apply(doc)).rejects.toThrow(/already belongs to "e-other"/);
  });
});
