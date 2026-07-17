import { spawnSync } from "child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DELETED_FIELD_VERBS } from "./deleted-field-verbs.js";

// Drive the real CLI as a subprocess against a throwaway ISSUES_DIR. Verb
// behavior (stdin, exit codes, stdout formatting, service round-trips) only
// exists once commander has parsed argv, so these tests exercise the whole
// path end to end rather than importing the side-effectful cli.ts module.
const appDir = dirname(fileURLToPath(import.meta.url));
const tsx = join(appDir, "node_modules", ".bin", "tsx");
const cliPath = join(appDir, "cli.ts");

let dir: string;
let clock = 0;

function nextAt(): string {
  clock += 1;
  return new Date(Date.UTC(2026, 6, 10, 14, 0, clock)).toISOString();
}

function writeIssue(id: string, body: Record<string, unknown>): void {
  mkdirSync(join(dir, id), { recursive: true });
  writeFileSync(join(dir, id, "issue.json"), JSON.stringify({ id, ...body }));
}

function runCli(
  args: string[],
  input?: string,
): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(tsx, [cliPath, ...args], {
    cwd: appDir,
    env: { ...process.env, ISSUES_DIR: dir },
    input,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status,
  };
}

function makeGitWorkspace(): string {
  const ws = mkdtempSync(join(tmpdir(), "issue-cli-workspace-"));
  mkdirSync(join(ws, ".git"));
  return ws;
}

function issueJsonField<T>(id: string, key: string): T {
  const raw = JSON.parse(readFileSync(join(dir, id, "issue.json"), "utf8"));
  return raw[key];
}

function blockedByOf(id: string): string[] {
  return issueJsonField(id, "blockedBy");
}

function mergeBaseOf(id: string): string | undefined {
  return issueJsonField(id, "mergeBase");
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "issue-tracker-cli-"));
  clock = 0;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("--description-file - reads stdin", () => {
  it("seeds description.md from piped stdin through the create service", () => {
    const { stdout, status } = runCli(
      ["create-project", "Stdin Project", "--description-file", "-"],
      "# Piped description\n\nfrom stdin\n",
    );
    expect(status).toBe(0);
    const id = stdout.trim();
    expect(id).toBeTruthy();
    const description = readFileSync(join(dir, id, "description.md"), "utf8");
    expect(description).toBe("# Piped description\n\nfrom stdin\n");
  });
});

describe("summary", () => {
  beforeEach(() => {
    writeIssue("p", { kind: "project", title: "Proj", createdAt: nextAt(), updatedAt: nextAt() });
    writeIssue("e", { kind: "epic", title: "Epic", partOf: "p", createdAt: nextAt(), updatedAt: nextAt() });
    writeIssue("a", {
      kind: "branch",
      title: "Branch A",
      partOf: "e",
      merged: false,
      createdAt: nextAt(),
      updatedAt: nextAt(),
    });
    writeIssue("c1", {
      kind: "commit",
      title: "Do the thing",
      partOf: "a",
      status: "todo",
      createdAt: nextAt(),
      updatedAt: nextAt(),
    });
  });

  it("wires the verb through to formatted stdout", () => {
    const { stdout, status } = runCli(["summary", "c1"]);
    expect(status).toBe(0);
    expect(stdout).toContain("Commit: c1 — Do the thing");
    expect(stdout).toContain("For more details, try `issue show <id>` or `issue tree`.");
  });

  it("errors with a nonzero exit on an unknown id", () => {
    const { stderr, status } = runCli(["summary", "ghost"]);
    expect(status).toBe(1);
    expect(stderr).toContain('unknown issue "ghost"');
  });

  it("prints Workspace when set on the project", () => {
    const ws = makeGitWorkspace();
    try {
      expect(runCli(["project", "set", "p", "workspace", ws]).status).toBe(0);
      const { stdout, status } = runCli(["summary", "c1"]);
      expect(status).toBe(0);
      expect(stdout).toContain(`  Workspace: ${ws}`);
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it("omits Workspace when unset on the project", () => {
    const { stdout, status } = runCli(["summary", "c1"]);
    expect(status).toBe(0);
    expect(stdout).not.toContain("Workspace:");
  });
});

describe("show", () => {
  beforeEach(() => {
    writeIssue("p", { kind: "project", title: "Proj", createdAt: nextAt(), updatedAt: nextAt() });
    writeIssue("e", { kind: "epic", title: "Epic", partOf: "p", createdAt: nextAt(), updatedAt: nextAt() });
    writeIssue("a", {
      kind: "branch",
      title: "Branch A",
      partOf: "e",
      branchName: "feat/a",
      merged: false,
      createdAt: nextAt(),
      updatedAt: nextAt(),
    });
    writeFileSync(join(dir, "a", "description.md"), "# Branch A\n\nthe body\n");
    writeFileSync(
      join(dir, "a", "chat.jsonl"),
      JSON.stringify({ role: "agent", name: "bot", body: "first note", at: nextAt() }) + "\n",
    );
  });

  it("prints metadata and description but not the chat by default", () => {
    const { stdout, status } = runCli(["show", "a"]);
    expect(status).toBe(0);
    expect(stdout).toContain("id: a");
    expect(stdout).toContain("kind: branch");
    expect(stdout).toContain("title: Branch A");
    expect(stdout).toContain("partOf: e");
    expect(stdout).toContain("mergeBase: main");
    expect(stdout).toContain("branchName: feat/a");
    expect(stdout).toContain("merged: false");
    expect(stdout).toContain("# Branch A");
    expect(stdout).toContain("the body");
    expect(stdout).not.toContain("--- chat ---");
  });

  it("appends the chat log with --chat", () => {
    const { stdout, status } = runCli(["show", "a", "--chat"]);
    expect(status).toBe(0);
    expect(stdout).toContain("--- chat ---");
    expect(stdout).toContain("bot: first note");
  });

  it("errors with a nonzero exit on an unknown id", () => {
    const { stderr, status } = runCli(["show", "ghost"]);
    expect(status).toBe(1);
    expect(stderr).toContain('unknown issue "ghost"');
  });

  it("prints an epic's blockedBy line when it has blockers", () => {
    writeIssue("e2", {
      kind: "epic",
      title: "Epic 2",
      partOf: "p",
      blockedBy: ["e"],
      createdAt: nextAt(),
      updatedAt: nextAt(),
    });
    const { stdout, status } = runCli(["show", "e2"]);
    expect(status).toBe(0);
    expect(stdout).toContain("kind: epic");
    expect(stdout).toContain("blockedBy: e");
  });

  it("omits the blockedBy line for an epic with no blockers", () => {
    const { stdout, status } = runCli(["show", "e"]);
    expect(status).toBe(0);
    expect(stdout).toContain("kind: epic");
    expect(stdout).not.toContain("blockedBy:");
  });

  it("prints workspace when set on a project", () => {
    const ws = makeGitWorkspace();
    try {
      const { status: setStatus } = runCli(["project", "set", "p", "workspace", ws]);
      expect(setStatus).toBe(0);
      const { stdout, status } = runCli(["show", "p"]);
      expect(status).toBe(0);
      expect(stdout).toContain(`workspace: ${ws}`);
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it("omits workspace when unset on a project", () => {
    const { stdout, status } = runCli(["show", "p"]);
    expect(status).toBe(0);
    expect(stdout).toContain("mergePolicy: manual");
    expect(stdout).not.toContain("workspace:");
  });
});

describe("project get/set", () => {
  beforeEach(() => {
    writeIssue("p", { kind: "project", title: "Proj", createdAt: nextAt(), updatedAt: nextAt() });
    writeIssue("e", {
      kind: "epic",
      title: "Epic",
      partOf: "p",
      createdAt: nextAt(),
      updatedAt: nextAt(),
    });
    writeFileSync(join(dir, "p", "description.md"), "# Proj\n\nbody\n");
  });

  it("gets and sets allowlisted project fields", () => {
    expect(runCli(["project", "get", "p", "title"]).stdout).toBe("Proj\n");
    expect(runCli(["project", "get", "p", "mergePolicy"]).stdout).toBe("manual\n");
    expect(runCli(["project", "get", "p", "description"]).stdout).toBe("# Proj\n\nbody\n");

    expect(runCli(["project", "set", "p", "title", "Renamed"]).status).toBe(0);
    expect(runCli(["project", "get", "p", "title"]).stdout).toBe("Renamed\n");

    expect(runCli(["project", "set", "p", "mergePolicy", "pull-request"]).status).toBe(0);
    expect(runCli(["project", "get", "p", "mergePolicy"]).stdout).toBe("pull-request\n");
  });

  it("sets description from --file and clears workspace with --clear", () => {
    const descFile = join(dir, "desc.md");
    writeFileSync(descFile, "from file\n");
    expect(
      runCli(["project", "set", "p", "description", "--file", descFile]).status,
    ).toBe(0);
    expect(runCli(["project", "get", "p", "description"]).stdout).toBe("from file\n");

    const ws = makeGitWorkspace();
    try {
      expect(runCli(["project", "set", "p", "workspace", ws]).status).toBe(0);
      expect(runCli(["project", "get", "p", "workspace"]).stdout).toBe(`${ws}\n`);
      expect(runCli(["project", "set", "p", "workspace", "--clear"]).status).toBe(0);
      const { stdout, status } = runCli(["project", "get", "p", "workspace"]);
      expect(status).toBe(0);
      expect(stdout).toBe("");
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it("prints empty stdout for unset optional get", () => {
    const { stdout, status } = runCli(["project", "get", "p", "workspace"]);
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });

  it("refuses kind mismatch and unknown fields", () => {
    const mismatch = runCli(["project", "get", "e", "title"]);
    expect(mismatch.status).toBe(1);
    expect(mismatch.stderr).toContain('"e" is an epic, not a project');

    const setMismatch = runCli(["project", "set", "e", "title", "Nope"]);
    expect(setMismatch.status).toBe(1);
    expect(setMismatch.stderr).toContain('"e" is an epic, not a project');

    const unknownGet = runCli(["project", "get", "p", "assignee"]);
    expect(unknownGet.status).toBe(1);
    expect(unknownGet.stderr).toContain('unknown field "assignee" for project');

    const unknownSet = runCli(["project", "set", "p", "assignee", "bot"]);
    expect(unknownSet.status).toBe(1);
    expect(unknownSet.stderr).toContain(
      'unknown or unsettable field "assignee" for project',
    );
  });

  it("wires mergePolicy through to show", () => {
    expect(runCli(["project", "set", "p", "mergePolicy", "pull-request"]).status).toBe(0);
    const { stdout, status } = runCli(["show", "p"]);
    expect(status).toBe(0);
    expect(stdout).toContain("mergePolicy: pull-request");
  });
});

describe("epic get/set", () => {
  const AT = "2026-07-10T14:00:00.000Z";

  beforeEach(() => {
    writeIssue("p", { kind: "project", title: "Proj", createdAt: nextAt(), updatedAt: nextAt() });
    writeIssue("e", {
      kind: "epic",
      title: "Epic",
      partOf: "p",
      order: 0,
      blockedBy: [],
      createdAt: nextAt(),
      updatedAt: nextAt(),
    });
    writeIssue("blocker", {
      kind: "epic",
      title: "Blocker",
      partOf: "p",
      order: 1,
      blockedBy: [],
      createdAt: nextAt(),
      updatedAt: nextAt(),
    });
    writeIssue("other", {
      kind: "epic",
      title: "Other",
      partOf: "p",
      order: 2,
      blockedBy: [],
      createdAt: nextAt(),
      updatedAt: nextAt(),
    });
    writeFileSync(join(dir, "e", "description.md"), "# Epic\n\nbody\n");
  });

  it("gets and sets allowlisted epic fields", () => {
    expect(runCli(["epic", "get", "e", "title"]).stdout).toBe("Epic\n");
    expect(runCli(["epic", "get", "e", "description"]).stdout).toBe("# Epic\n\nbody\n");
    expect(runCli(["epic", "get", "e", "blockedBy"]).stdout).toBe("[]\n");

    expect(runCli(["epic", "set", "e", "title", "Renamed"]).status).toBe(0);
    expect(runCli(["epic", "get", "e", "title"]).stdout).toBe("Renamed\n");

    expect(runCli(["epic", "set", "e", "assignee", "bot"]).status).toBe(0);
    expect(runCli(["epic", "get", "e", "assignee"]).stdout).toBe("bot\n");
    expect(runCli(["epic", "set", "e", "assignee", "--clear"]).status).toBe(0);
    expect(runCli(["epic", "get", "e", "assignee"]).stdout).toBe("");

    expect(
      runCli(["epic", "set", "e", "needsAttention", "true", "--reason", "need decision"]).status,
    ).toBe(0);
    expect(runCli(["epic", "get", "e", "needsAttention"]).stdout).toBe("true\n");
    expect(runCli(["epic", "get", "e", "attentionReason"]).stdout).toBe("need decision\n");
    expect(runCli(["epic", "set", "e", "needsAttention", "false"]).status).toBe(0);
    expect(runCli(["epic", "get", "e", "needsAttention"]).stdout).toBe("false\n");
    expect(runCli(["epic", "get", "e", "attentionReason"]).stdout).toBe("");
  });

  it("replaces and incrementally edits blockedBy", () => {
    expect(
      runCli(["epic", "set", "e", "blockedBy", '["blocker"]']).status,
    ).toBe(0);
    expect(blockedByOf("e")).toEqual(["blocker"]);
    expect(runCli(["epic", "get", "e", "blockedBy"]).stdout).toBe('["blocker"]\n');

    expect(runCli(["epic", "set", "e", "blockedBy", "--add", "other"]).status).toBe(0);
    expect(blockedByOf("e").sort()).toEqual(["blocker", "other"]);

    // --add is idempotent for ids already present.
    expect(runCli(["epic", "set", "e", "blockedBy", "--add", "blocker", "other"]).status).toBe(
      0,
    );
    expect(blockedByOf("e").sort()).toEqual(["blocker", "other"]);

    expect(runCli(["epic", "set", "e", "blockedBy", "--remove", "blocker"]).status).toBe(0);
    expect(blockedByOf("e")).toEqual(["other"]);

    expect(runCli(["epic", "set", "e", "blockedBy", "--clear"]).status).toBe(0);
    expect(blockedByOf("e")).toEqual([]);
    expect(runCli(["epic", "get", "e", "blockedBy"]).stdout).toBe("[]\n");
  });

  it("rejects invalid blockedBy set modes and wrong kind", () => {
    expect(runCli(["epic", "set", "e", "blockedBy", '["blocker"]']).status).toBe(0);

    const combined = runCli([
      "epic",
      "set",
      "e",
      "blockedBy",
      '["other"]',
      "--add",
      "blocker",
    ]);
    expect(combined.status).toBe(1);
    expect(combined.stderr).toMatch(/mutually exclusive/);
    expect(blockedByOf("e")).toEqual(["blocker"]);

    const missing = runCli(["epic", "set", "e", "blockedBy"]);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toMatch(
      /provide a JSON array value, --file, --add, --remove, or --clear for blockedBy/,
    );

    writeIssue("br", {
      kind: "branch",
      title: "Branch",
      partOf: "e",
      merged: false,
      order: 0,
      createdAt: AT,
      updatedAt: AT,
    });
    const wrongKind = runCli(["epic", "set", "br", "blockedBy", "--add", "blocker"]);
    expect(wrongKind.status).toBe(1);
    expect(wrongKind.stderr).toMatch(/"br" is a branch, not an epic/);
  });

  it("gets derived epicStatus, ready, and blocked", () => {
    expect(runCli(["epic", "get", "e", "epicStatus"]).stdout).toBe("todo\n");
    expect(runCli(["epic", "get", "e", "ready"]).stdout).toBe("false\n");
    expect(runCli(["epic", "get", "e", "blocked"]).stdout).toBe("false\n");

    expect(runCli(["epic", "set", "e", "blockedBy", '["blocker"]']).status).toBe(0);
    expect(runCli(["epic", "get", "e", "blocked"]).stdout).toBe("true\n");

    writeIssue("br", {
      kind: "branch",
      title: "Branch",
      partOf: "e",
      merged: false,
      order: 0,
      createdAt: AT,
      updatedAt: AT,
    });
    expect(runCli(["epic", "get", "e", "epicStatus"]).stdout).toBe("todo\n");

    writeIssue("br", {
      kind: "branch",
      title: "Branch",
      partOf: "e",
      branchName: "feat",
      merged: false,
      order: 0,
      createdAt: AT,
      updatedAt: AT,
    });
    expect(runCli(["epic", "get", "e", "epicStatus"]).stdout).toBe("in-progress\n");
  });

  it("refuses kind mismatch and unknown fields", () => {
    const mismatch = runCli(["epic", "get", "p", "title"]);
    expect(mismatch.status).toBe(1);
    expect(mismatch.stderr).toContain('"p" is a project, not an epic');

    const unknownGet = runCli(["epic", "get", "e", "workspace"]);
    expect(unknownGet.status).toBe(1);
    expect(unknownGet.stderr).toContain('unknown field "workspace" for epic');

    const unknownSet = runCli(["epic", "set", "e", "workspace", "/tmp"]);
    expect(unknownSet.status).toBe(1);
    expect(unknownSet.stderr).toContain(
      'unknown or unsettable field "workspace" for epic',
    );
  });
});

describe("branch get/set", () => {
  const AT = "2026-07-10T14:00:00.000Z";

  beforeEach(() => {
    writeIssue("p", { kind: "project", title: "Proj", createdAt: nextAt(), updatedAt: nextAt() });
    writeIssue("e", {
      kind: "epic",
      title: "Epic",
      partOf: "p",
      order: 0,
      blockedBy: [],
      createdAt: nextAt(),
      updatedAt: nextAt(),
    });
    writeIssue("a", {
      kind: "branch",
      title: "Branch A",
      partOf: "e",
      merged: false,
      order: 0,
      createdAt: AT,
      updatedAt: AT,
    });
    writeIssue("b", {
      kind: "branch",
      title: "Branch B",
      partOf: "e",
      stackedOn: "a",
      merged: false,
      order: 1,
      createdAt: AT,
      updatedAt: AT,
    });
    writeFileSync(join(dir, "a", "description.md"), "# Branch\n\nbody\n");
  });

  it("gets and sets allowlisted branch fields", () => {
    expect(runCli(["branch", "get", "a", "title"]).stdout).toBe("Branch A\n");
    expect(runCli(["branch", "get", "a", "description"]).stdout).toBe("# Branch\n\nbody\n");
    expect(runCli(["branch", "get", "a", "merged"]).stdout).toBe("false\n");
    expect(runCli(["branch", "get", "b", "stackedOn"]).stdout).toBe("a\n");

    expect(runCli(["branch", "set", "a", "title", "Renamed"]).status).toBe(0);
    expect(runCli(["branch", "get", "a", "title"]).stdout).toBe("Renamed\n");

    expect(runCli(["branch", "set", "a", "branchName", "feat/a"]).status).toBe(0);
    expect(runCli(["branch", "get", "a", "branchName"]).stdout).toBe("feat/a\n");

    expect(runCli(["branch", "set", "b", "stackedOn", "--clear"]).status).toBe(0);
    expect(runCli(["branch", "get", "b", "stackedOn"]).stdout).toBe("");
    expect(runCli(["branch", "set", "b", "stackedOn", "a"]).status).toBe(0);
    expect(runCli(["branch", "get", "b", "stackedOn"]).stdout).toBe("a\n");

    expect(runCli(["branch", "set", "a", "prUrl", "https://pr/1"]).status).toBe(0);
    expect(runCli(["branch", "get", "a", "prUrl"]).stdout).toBe("https://pr/1\n");
    expect(runCli(["branch", "set", "a", "prUrl", "--clear"]).status).toBe(0);
    expect(runCli(["branch", "get", "a", "prUrl"]).stdout).toBe("");

    expect(runCli(["branch", "set", "a", "specReview", "passed"]).status).toBe(0);
    expect(runCli(["branch", "get", "a", "specReview"]).stdout).toBe("passed\n");

    expect(runCli(["branch", "set", "a", "assignee", "bot"]).status).toBe(0);
    expect(runCli(["branch", "get", "a", "assignee"]).stdout).toBe("bot\n");
    expect(runCli(["branch", "set", "a", "assignee", "--clear"]).status).toBe(0);
    expect(runCli(["branch", "get", "a", "assignee"]).stdout).toBe("");

    expect(
      runCli(["branch", "set", "a", "needsAttention", "true", "--reason", "blocked"]).status,
    ).toBe(0);
    expect(runCli(["branch", "get", "a", "needsAttention"]).stdout).toBe("true\n");
    expect(runCli(["branch", "get", "a", "attentionReason"]).stdout).toBe("blocked\n");
    expect(runCli(["branch", "set", "a", "needsAttention", "false"]).status).toBe(0);
    expect(runCli(["branch", "get", "a", "needsAttention"]).stdout).toBe("false\n");
    expect(runCli(["branch", "get", "a", "attentionReason"]).stdout).toBe("");
  });

  it("gets derived branchStatus, base, ready, and blocked", () => {
    expect(runCli(["branch", "get", "a", "branchStatus"]).stdout).toBe("not-started\n");
    expect(runCli(["branch", "get", "a", "base"]).stdout).toBe("main\n");
    expect(runCli(["branch", "get", "a", "ready"]).stdout).toBe("true\n");
    expect(runCli(["branch", "get", "a", "blocked"]).stdout).toBe("false\n");

    expect(runCli(["branch", "get", "b", "ready"]).stdout).toBe("false\n");
    expect(runCli(["branch", "get", "b", "blocked"]).stdout).toBe("true\n");
    expect(runCli(["branch", "get", "b", "base"]).stdout).toBe("main\n");

    const add = runCli(["add-branch", "Unset child", "--part-of", "e", "--stacked-on", "a"]);
    expect(add.status).toBe(0);
    const childId = add.stdout.trim();
    expect(runCli(["branch", "get", childId, "base"]).stdout).toBe("");

    expect(runCli(["branch", "set", "a", "branchName", "feat/a"]).status).toBe(0);
    expect(runCli(["branch", "get", "a", "branchStatus"]).stdout).toBe("in-progress\n");
    expect(runCli(["branch", "get", "b", "ready"]).stdout).toBe("true\n");
    expect(runCli(["branch", "get", "b", "blocked"]).stdout).toBe("false\n");

    writeIssue("b", {
      kind: "branch",
      title: "Branch B",
      partOf: "e",
      stackedOn: "a",
      mergeBase: "feat/a",
      merged: false,
      order: 1,
      createdAt: AT,
      updatedAt: AT,
    });
    expect(runCli(["branch", "get", "b", "base"]).stdout).toBe("feat/a\n");

    writeIssue("c1", {
      kind: "commit",
      title: "C1",
      partOf: "a",
      status: "done",
      order: 0,
      createdAt: AT,
      updatedAt: AT,
    });
    expect(runCli(["branch", "set", "a", "prUrl", "https://pr/1"]).status).toBe(0);
    expect(runCli(["branch", "get", "a", "branchStatus"]).stdout).toBe("pr-open\n");
  });

  it("cascades mergeBase on merged via kind set", () => {
    writeIssue("a", {
      kind: "branch",
      title: "Branch A",
      partOf: "e",
      branchName: "feat/a",
      mergeBase: "main",
      merged: false,
      order: 0,
      createdAt: AT,
      updatedAt: AT,
    });
    writeIssue("b", {
      kind: "branch",
      title: "Branch B",
      partOf: "e",
      stackedOn: "a",
      mergeBase: "feat/a",
      merged: false,
      order: 1,
      createdAt: AT,
      updatedAt: AT,
    });

    expect(runCli(["branch", "set", "a", "merged", "true"]).status).toBe(0);
    expect(mergeBaseOf("b")).toBe("main");
    expect(runCli(["branch", "get", "a", "merged"]).stdout).toBe("true\n");
  });

  it("refuses kind mismatch, unknown fields, and unsettable mergeBase", () => {
    const mismatch = runCli(["branch", "get", "e", "title"]);
    expect(mismatch.status).toBe(1);
    expect(mismatch.stderr).toContain('"e" is an epic, not a branch');

    const unknownGet = runCli(["branch", "get", "a", "blockedBy"]);
    expect(unknownGet.status).toBe(1);
    expect(unknownGet.stderr).toContain('unknown field "blockedBy" for branch');

    const unknownSet = runCli(["branch", "set", "a", "mergeBase", "main"]);
    expect(unknownSet.status).toBe(1);
    expect(unknownSet.stderr).toContain(
      'unknown or unsettable field "mergeBase" for branch',
    );

    writeIssue("c1", {
      kind: "commit",
      title: "C1",
      partOf: "a",
      status: "todo",
      order: 0,
      createdAt: AT,
      updatedAt: AT,
    });
    const setOnCommit = runCli(["branch", "set", "c1", "specReview", "passed"]);
    expect(setOnCommit.status).toBe(1);
    expect(setOnCommit.stderr).toMatch(/"c1" is a commit, not a branch/);
  });

  it("surfaces specReview in show/list and preserves it across apply", () => {
    expect(runCli(["show", "a"]).stdout).not.toContain("specReview:");

    expect(runCli(["branch", "set", "a", "specReview", "passed"]).status).toBe(0);
    expect(runCli(["show", "a"]).stdout).toContain("specReview: passed");

    const listed = JSON.parse(runCli(["list", "--project", "p"]).stdout);
    const branch = listed.issues.find((i: { id: string }) => i.id === "a");
    expect(branch.specReview).toBe("passed");

    const invalid = runCli(["branch", "set", "a", "specReview", "pending"]);
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toMatch(/invalid specReview "pending"/);

    const applyPath = join(dir, "epic.yaml");
    writeFileSync(
      applyPath,
      `project: p
epic:
  id: e
  title: Epic
  branches:
    - id: a
      title: Branch A renamed
`,
    );
    expect(runCli(["branch", "set", "a", "specReview", "failed"]).status).toBe(0);
    expect(runCli(["apply", applyPath]).status).toBe(0);
    expect(JSON.parse(readFileSync(join(dir, "a", "issue.json"), "utf8")).specReview).toBe(
      "failed",
    );
    expect(runCli(["show", "a"]).stdout).toContain("specReview: failed");
    expect(runCli(["show", "a"]).stdout).toContain("title: Branch A renamed");
  });
});

describe("commit get/set", () => {
  const AT = "2026-07-10T14:00:00.000Z";
  const sha1 = "0123456789abcdef0123456789abcdef01234567";
  const sha256 =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  beforeEach(() => {
    writeIssue("p", { kind: "project", title: "Proj", createdAt: nextAt(), updatedAt: nextAt() });
    writeIssue("e", {
      kind: "epic",
      title: "Epic",
      partOf: "p",
      order: 0,
      blockedBy: [],
      createdAt: nextAt(),
      updatedAt: nextAt(),
    });
    writeIssue("a", {
      kind: "branch",
      title: "Branch A",
      partOf: "e",
      branchName: "feat/a",
      merged: false,
      order: 0,
      createdAt: AT,
      updatedAt: AT,
    });
    writeIssue("a2", {
      kind: "branch",
      title: "Branch A2",
      partOf: "e",
      merged: false,
      order: 1,
      createdAt: AT,
      updatedAt: AT,
    });
    writeIssue("c1", {
      kind: "commit",
      title: "Commit 1",
      partOf: "a",
      status: "todo",
      order: 0,
      createdAt: AT,
      updatedAt: AT,
    });
    writeIssue("c2", {
      kind: "commit",
      title: "Commit 2",
      partOf: "a",
      status: "todo",
      order: 1,
      createdAt: AT,
      updatedAt: AT,
    });
    writeFileSync(join(dir, "c1", "description.md"), "# Commit\n\nbody\n");
  });

  it("gets and sets allowlisted commit fields", () => {
    expect(runCli(["commit", "get", "c1", "title"]).stdout).toBe("Commit 1\n");
    expect(runCli(["commit", "get", "c1", "description"]).stdout).toBe("# Commit\n\nbody\n");
    expect(runCli(["commit", "get", "c1", "status"]).stdout).toBe("todo\n");
    expect(runCli(["commit", "get", "c1", "noDiff"]).stdout).toBe("");

    expect(runCli(["commit", "set", "c1", "title", "Renamed"]).status).toBe(0);
    expect(runCli(["commit", "get", "c1", "title"]).stdout).toBe("Renamed\n");

    expect(runCli(["commit", "set", "c1", "status", "in-progress"]).status).toBe(0);
    expect(runCli(["commit", "get", "c1", "status"]).stdout).toBe("in-progress\n");

    expect(runCli(["commit", "set", "c1", "commitSha", sha1]).status).toBe(0);
    expect(runCli(["commit", "get", "c1", "commitSha"]).stdout).toBe(`${sha1}\n`);
    expect(runCli(["commit", "set", "c1", "commitSha", "--clear"]).status).toBe(0);
    expect(runCli(["commit", "get", "c1", "commitSha"]).stdout).toBe("");

    expect(runCli(["commit", "set", "c1", "noDiff", "true"]).status).toBe(0);
    expect(runCli(["commit", "get", "c1", "noDiff"]).stdout).toBe("true\n");
    expect(runCli(["commit", "set", "c1", "noDiff", "false"]).status).toBe(0);
    expect(runCli(["commit", "get", "c1", "noDiff"]).stdout).toBe("");

    expect(runCli(["commit", "set", "c1", "assignee", "bot"]).status).toBe(0);
    expect(runCli(["commit", "get", "c1", "assignee"]).stdout).toBe("bot\n");
    expect(runCli(["commit", "set", "c1", "assignee", "--clear"]).status).toBe(0);
    expect(runCli(["commit", "get", "c1", "assignee"]).stdout).toBe("");

    expect(
      runCli(["commit", "set", "c1", "needsAttention", "true", "--reason", "blocked"]).status,
    ).toBe(0);
    expect(runCli(["commit", "get", "c1", "needsAttention"]).stdout).toBe("true\n");
    expect(runCli(["commit", "get", "c1", "attentionReason"]).stdout).toBe("blocked\n");
    expect(runCli(["commit", "set", "c1", "needsAttention", "false"]).status).toBe(0);
    expect(runCli(["commit", "get", "c1", "needsAttention"]).stdout).toBe("false\n");
    expect(runCli(["commit", "get", "c1", "attentionReason"]).stdout).toBe("");
  });

  it("sets description from --file", () => {
    const descFile = join(dir, "desc.md");
    writeFileSync(descFile, "from file\n");
    expect(
      runCli(["commit", "set", "c1", "description", "--file", descFile]).status,
    ).toBe(0);
    expect(runCli(["commit", "get", "c1", "description"]).stdout).toBe("from file\n");
  });

  it("gets derived ready and blocked", () => {
    expect(runCli(["commit", "get", "c1", "ready"]).stdout).toBe("true\n");
    expect(runCli(["commit", "get", "c1", "blocked"]).stdout).toBe("false\n");
    expect(runCli(["commit", "get", "c2", "ready"]).stdout).toBe("false\n");
    expect(runCli(["commit", "get", "c2", "blocked"]).stdout).toBe("true\n");

    expect(runCli(["commit", "set", "c1", "status", "done"]).status).toBe(0);
    expect(runCli(["commit", "get", "c1", "ready"]).stdout).toBe("false\n");
    expect(runCli(["commit", "get", "c1", "blocked"]).stdout).toBe("false\n");
    expect(runCli(["commit", "get", "c2", "ready"]).stdout).toBe("true\n");
    expect(runCli(["commit", "get", "c2", "blocked"]).stdout).toBe("false\n");
  });

  it("refuses kind mismatch, unknown fields, and invalid commitSha / noDiff", () => {
    const mismatch = runCli(["commit", "get", "a", "title"]);
    expect(mismatch.status).toBe(1);
    expect(mismatch.stderr).toContain('"a" is a branch, not a commit');

    const unknownGet = runCli(["commit", "get", "c1", "branchName"]);
    expect(unknownGet.status).toBe(1);
    expect(unknownGet.stderr).toContain('unknown field "branchName" for commit');

    const unknownSet = runCli(["commit", "set", "c1", "branchName", "feat/x"]);
    expect(unknownSet.status).toBe(1);
    expect(unknownSet.stderr).toContain(
      'unknown or unsettable field "branchName" for commit',
    );

    const badSha = runCli(["commit", "set", "c1", "commitSha", "4019c25"]);
    expect(badSha.status).toBe(1);
    expect(badSha.stderr).toMatch(/invalid commit sha "4019c25"/);

    const shortSha = runCli([
      "commit",
      "set",
      "c1",
      "commitSha",
      "0123456789abcdef0123456789abcdef0123456",
    ]);
    expect(shortSha.status).toBe(1);
    expect(shortSha.stderr).toMatch(/invalid commit sha/);

    const nonHex = runCli([
      "commit",
      "set",
      "c1",
      "commitSha",
      "ghijghijghijghijghijghijghijghijghijghij",
    ]);
    expect(nonHex.status).toBe(1);
    expect(nonHex.stderr).toMatch(/invalid commit sha/);

    const upper = runCli([
      "commit",
      "set",
      "c1",
      "commitSha",
      "0123456789ABCDEF0123456789ABCDEF01234567",
    ]);
    expect(upper.status).toBe(1);
    expect(upper.stderr).toMatch(/invalid commit sha/);

    expect(runCli(["commit", "set", "a", "commitSha", sha1]).stderr).toMatch(
      /"a" is a branch, not a commit/,
    );
    expect(runCli(["commit", "set", "a", "noDiff", "true"]).stderr).toMatch(
      /"a" is a branch, not a commit/,
    );

    const badNoDiff = runCli(["commit", "set", "c1", "noDiff", "maybe"]);
    expect(badNoDiff.status).toBe(1);
    expect(badNoDiff.stderr).toMatch(/invalid noDiff "maybe"/);
  });

  it("accepts sha256 commitSha and surfaces noDiff in show/summary", () => {
    expect(runCli(["commit", "set", "c1", "commitSha", sha256]).status).toBe(0);
    expect(JSON.parse(readFileSync(join(dir, "c1", "issue.json"), "utf8")).commitSha).toBe(
      sha256,
    );

    expect(runCli(["show", "c1"]).stdout).not.toContain("noDiff:");
    expect(runCli(["commit", "set", "c1", "noDiff", "true"]).status).toBe(0);
    expect(runCli(["show", "c1"]).stdout).toContain("noDiff: true");
    expect(runCli(["summary", "c1"]).stdout).toContain("noDiff: true");

    expect(runCli(["commit", "set", "c1", "noDiff", "false"]).status).toBe(0);
    expect(JSON.parse(readFileSync(join(dir, "c1", "issue.json"), "utf8"))).not.toHaveProperty(
      "noDiff",
    );
    expect(runCli(["show", "c1"]).stdout).not.toContain("noDiff:");
  });

  it("gets whitespace assignee as stored and errors on unknown id", () => {
    writeIssue("c1", {
      kind: "commit",
      title: "Commit 1",
      partOf: "a",
      status: "todo",
      assignee: "   ",
      order: 0,
      createdAt: AT,
      updatedAt: AT,
    });
    expect(runCli(["commit", "get", "c1", "assignee"]).stdout).toBe("   \n");

    const unknown = runCli(["commit", "get", "ghost", "assignee"]);
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toContain('unknown issue "ghost"');
  });

  it("reparents via partOf and rejects bad parents", () => {
    expect(runCli(["commit", "set", "c1", "partOf", "a2"]).status).toBe(0);
    expect(JSON.parse(readFileSync(join(dir, "c1", "issue.json"), "utf8")).partOf).toBe("a2");

    const wrongKind = runCli(["commit", "set", "c1", "partOf", "e"]);
    expect(wrongKind.status).toBe(1);
    expect(wrongKind.stderr).toMatch(/must be a branch, not a epic/);
    expect(JSON.parse(readFileSync(join(dir, "c1", "issue.json"), "utf8")).partOf).toBe("a2");

    const unknown = runCli(["commit", "set", "c1", "partOf", "ghost"]);
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toMatch(/references unknown issue "ghost"/);
  });
});

describe("tree", () => {
  beforeEach(() => {
    writeIssue("p", { kind: "project", title: "Proj", createdAt: nextAt(), updatedAt: nextAt() });
    writeIssue("e", { kind: "epic", title: "Epic", partOf: "p", createdAt: nextAt(), updatedAt: nextAt() });
    writeIssue("a", {
      kind: "branch",
      title: "Branch A",
      partOf: "e",
      merged: false,
      createdAt: nextAt(),
      updatedAt: nextAt(),
    });
    writeIssue("c1", {
      kind: "commit",
      title: "C1",
      partOf: "a",
      status: "todo",
      createdAt: nextAt(),
      updatedAt: nextAt(),
    });
    writeIssue("b", {
      kind: "branch",
      title: "Branch B",
      partOf: "e",
      stackedOn: "a",
      merged: false,
      createdAt: nextAt(),
      updatedAt: nextAt(),
    });
  });

  it("renders indentation, chips, and stacked depth-first order", () => {
    const { stdout, status } = runCli(["tree", "--project", "p"]);
    expect(status).toBe(0);
    // Indentation: project at col 0, epic +2, root branch +4, commit +6.
    expect(stdout).toMatch(/^project p {2}Proj$/m);
    expect(stdout).toMatch(/^ {2}epic e {2}Epic\b/m);
    // Root branch at +4 with a chip tail. Assert the line shape and each
    // expected chip independently rather than pinning the exact chip set/order,
    // so adding or reordering a chip doesn't break this indentation test.
    expect(stdout).toMatch(/^ {4}branch a {2}Branch A {2}\[.*\]$/m);
    expect(stdout).toMatch(/^ {4}branch a\b.*\bstatus=not-started\b/m);
    expect(stdout).toMatch(/^ {4}branch a\b.*\bbase=main\b/m);
    expect(stdout).toMatch(/^ {4}branch a\b.*\bbranch=\(unset\)/m);
    expect(stdout).toMatch(/^ {6}commit c1 {2}C1 {2}\[status=todo\b.*\]$/m);
    // A branch stacked on a root sits one level deeper (+6, same as its
    // sibling commit), and carries a base chip.
    expect(stdout).toMatch(/^ {6}branch b {2}Branch B {2}\[.*base=main.*\]$/m);

    // Depth-first: the root branch and its commit precede the stacked branch.
    expect(stdout.indexOf("branch a")).toBeLessThan(stdout.indexOf("commit c1"));
    expect(stdout.indexOf("commit c1")).toBeLessThan(stdout.indexOf("branch b"));
  });

  it("scopes by a project title as well as its id", () => {
    const byId = runCli(["tree", "--project", "p"]);
    const byTitle = runCli(["tree", "--project", "Proj"]);
    expect(byTitle.status).toBe(0);
    expect(byTitle.stdout).toBe(byId.stdout);
  });

  it("shows base=(unset) for a stacked child whose mergeBase is not set yet", () => {
    // Create via the CLI so post-migration semantics apply: child of an
    // unnamed parent leaves mergeBase unset until branchName cascades.
    const add = runCli(["add-branch", "Unset child", "--part-of", "e", "--stacked-on", "a"]);
    expect(add.status).toBe(0);
    const childId = add.stdout.trim();
    const { stdout, status } = runCli(["tree", "--project", "p"]);
    expect(status).toBe(0);
    expect(stdout).toMatch(
      new RegExp(`^\\s+branch ${childId}\\b.*\\bbase=\\(unset\\)`, "m"),
    );
  });

  it("scopes by a positional project id like --project", () => {
    const byFlag = runCli(["tree", "--project", "p"]);
    const byId = runCli(["tree", "p"]);
    expect(byId.status).toBe(0);
    expect(byId.stdout).toBe(byFlag.stdout);
  });

  it("scopes by a positional epic id like --epic", () => {
    const byFlag = runCli(["tree", "--epic", "e"]);
    const byId = runCli(["tree", "e"]);
    expect(byId.status).toBe(0);
    expect(byId.stdout).toBe(byFlag.stdout);
  });

  it("scopes by a positional branch id to that branch and its commits only", () => {
    const { stdout, status } = runCli(["tree", "a"]);
    expect(status).toBe(0);
    expect(stdout).toMatch(/^branch a {2}Branch A\b/m);
    expect(stdout).toMatch(/^ {2}commit c1 {2}C1\b/m);
    expect(stdout).not.toContain("branch b");
    expect(stdout).not.toContain("epic e");
  });

  it("refuses a positional commit id and names the parent branch", () => {
    const { stderr, status } = runCli(["tree", "c1"]);
    expect(status).toBe(1);
    expect(stderr).toContain('cannot scope tree to a commit');
    expect(stderr).toContain('branch "a"');
  });

  it("refuses an unknown positional id", () => {
    const { stderr, status } = runCli(["tree", "ghost"]);
    expect(status).toBe(1);
    expect(stderr).toContain('unknown issue "ghost"');
  });

  it("refuses combining a positional id with --project or --epic", () => {
    const withProject = runCli(["tree", "e", "--project", "p"]);
    expect(withProject.status).toBe(1);
    expect(withProject.stderr).toContain("cannot combine tree [id] with --project or --epic");

    const withEpic = runCli(["tree", "a", "--epic", "e"]);
    expect(withEpic.status).toBe(1);
    expect(withEpic.stderr).toContain("cannot combine tree [id] with --project or --epic");
  });
});

describe("project-title resolution errors surface through the CLI", () => {
  beforeEach(() => {
    writeIssue("p1", { kind: "project", title: "Dup", createdAt: nextAt(), updatedAt: nextAt() });
  });

  it("exits nonzero on an unknown project", () => {
    const { stderr, status } = runCli(["list", "--project", "Nope"]);
    expect(status).toBe(1);
    expect(stderr).toContain('unknown project "Nope"');
  });

  it("exits nonzero on an ambiguous project title", () => {
    writeIssue("p2", { kind: "project", title: "Dup", createdAt: nextAt(), updatedAt: nextAt() });
    const { stderr, status } = runCli(["list", "--project", "Dup"]);
    expect(status).toBe(1);
    expect(stderr).toContain('ambiguous project title "Dup"');
  });
});

describe("deleted field verbs", () => {
  it("are unknown commands and absent from top-level --help", () => {
    const help = runCli(["--help"]);
    expect(help.status).toBe(0);

    for (const verb of DELETED_FIELD_VERBS) {
      const { stderr, status } = runCli([verb]);
      expect(status, verb).not.toBe(0);
      expect(stderr, verb).toMatch(new RegExp(`unknown command '${verb}'`));
      expect(help.stdout, verb).not.toMatch(new RegExp(`\\n  ${verb}\\b`));
    }
  });
});

describe("attach / attachments / detach", () => {
  const AT = "2026-07-10T14:00:00.000Z";

  beforeEach(() => {
    writeIssue("p", { kind: "project", title: "Proj", order: 0, createdAt: AT, updatedAt: AT });
    writeIssue("e", {
      kind: "epic",
      title: "Epic",
      partOf: "p",
      order: 0,
      createdAt: AT,
      updatedAt: AT,
    });
    writeIssue("a", {
      kind: "branch",
      title: "Branch A",
      partOf: "e",
      order: 0,
      merged: false,
      createdAt: AT,
      updatedAt: AT,
    });
    writeIssue("c1", {
      kind: "commit",
      title: "C1",
      partOf: "a",
      order: 0,
      status: "todo",
      createdAt: AT,
      updatedAt: AT,
    });
  });

  it("attaches, lists, upserts, and detaches on a commit", () => {
    const source = join(dir, "fixture.tsx");
    writeFileSync(source, "export const x = 1;\n");

    const attach1 = runCli(["attach", "c1", source]);
    expect(attach1.status).toBe(0);
    expect(attach1.stdout).toContain("attached fixture.tsx (20 bytes)");
    expect(attach1.stdout).toContain(join(dir, "c1", "attachments", "fixture.tsx"));

    const list1 = runCli(["attachments", "c1"]);
    expect(list1.status).toBe(0);
    expect(list1.stdout).toBe("fixture.tsx\t20\n");

    writeFileSync(source, "export const x = 2;\n");
    const attach2 = runCli(["attach", "c1", source]);
    expect(attach2.status).toBe(0);
    expect(attach2.stdout).toContain("attached fixture.tsx (20 bytes)");
    expect(readFileSync(join(dir, "c1", "attachments", "fixture.tsx"), "utf8")).toBe(
      "export const x = 2;\n",
    );

    const detach = runCli(["detach", "c1", "fixture.tsx"]);
    expect(detach.status).toBe(0);
    expect(detach.stdout).toBe("detached fixture.tsx from c1\n");
    expect(runCli(["attachments", "c1"]).stdout).toBe("(no attachments)\n");
  });

  it("allows attachments on epic and branch", () => {
    const source = join(dir, "ui.png");
    writeFileSync(source, "png-bytes");

    expect(runCli(["attach", "e", source]).status).toBe(0);
    expect(runCli(["attach", "a", source]).status).toBe(0);
    expect(runCli(["attachments", "e"]).stdout).toContain("ui.png\t9\n");
    expect(runCli(["attachments", "a"]).stdout).toContain("ui.png\t9\n");
  });

  it("rejects attachments on a project", () => {
    const source = join(dir, "nope.bin");
    writeFileSync(source, "x");
    const { stderr, status } = runCli(["attach", "p", source]);
    expect(status).toBe(1);
    expect(stderr).toContain("attachments are not allowed on a project");
  });

  it("prints attachments in show when present and omits them when empty", () => {
    const source = join(dir, "mock.tsx");
    writeFileSync(source, "canvas");
    expect(runCli(["attach", "c1", source]).status).toBe(0);

    const withAttachments = runCli(["show", "c1"]);
    expect(withAttachments.status).toBe(0);
    expect(withAttachments.stdout).toContain("Attachments:");
    expect(withAttachments.stdout).toContain(
      `mock.tsx (6 bytes) — ${join(dir, "c1", "attachments", "mock.tsx")}`,
    );

    expect(runCli(["detach", "c1", "mock.tsx"]).status).toBe(0);
    const withoutAttachments = runCli(["show", "c1"]);
    expect(withoutAttachments.status).toBe(0);
    expect(withoutAttachments.stdout).not.toContain("Attachments:");
  });

  it("prints attachments in summary when present and omits them when empty", () => {
    const source = join(dir, "mock.tsx");
    writeFileSync(source, "canvas");
    expect(runCli(["attach", "c1", source]).status).toBe(0);

    const withAttachments = runCli(["summary", "c1"]);
    expect(withAttachments.status).toBe(0);
    expect(withAttachments.stdout).toContain("  Attachments:");
    expect(withAttachments.stdout).toContain(
      `mock.tsx (6 bytes) — ${join(dir, "c1", "attachments", "mock.tsx")}`,
    );

    expect(runCli(["detach", "c1", "mock.tsx"]).status).toBe(0);
    const withoutAttachments = runCli(["summary", "c1"]);
    expect(withoutAttachments.status).toBe(0);
    expect(withoutAttachments.stdout).not.toContain("Attachments:");
  });
});
