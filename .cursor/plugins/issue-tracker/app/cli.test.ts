import { spawnSync } from "child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
      expect(runCli(["set-workspace", "p", ws]).status).toBe(0);
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
      const { status: setStatus } = runCli(["set-workspace", "p", ws]);
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

describe("set-merge-policy", () => {
  beforeEach(() => {
    writeIssue("p", { kind: "project", title: "Proj", createdAt: nextAt(), updatedAt: nextAt() });
  });

  it("wires set-merge-policy through to update and show", () => {
    expect(runCli(["set-merge-policy", "p", "pull-request"]).status).toBe(0);
    const { stdout, status } = runCli(["show", "p"]);
    expect(status).toBe(0);
    expect(stdout).toContain("mergePolicy: pull-request");
  });
});

describe("set-workspace", () => {
  beforeEach(() => {
    writeIssue("p", { kind: "project", title: "Proj", createdAt: nextAt(), updatedAt: nextAt() });
  });

  it("sets and clears workspace via the CLI", () => {
    const ws = makeGitWorkspace();
    try {
      expect(runCli(["set-workspace", "p", ws]).status).toBe(0);
      const raw = JSON.parse(readFileSync(join(dir, "p", "issue.json"), "utf8"));
      expect(raw.workspace).toBe(ws);

      expect(runCli(["set-workspace", "p", "--clear"]).status).toBe(0);
      const cleared = JSON.parse(readFileSync(join(dir, "p", "issue.json"), "utf8"));
      expect(cleared).not.toHaveProperty("workspace");
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
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

describe("block", () => {
  const AT = "2026-07-10T14:00:00.000Z";
  // blockedBy is Epic-level now: the target epic `t` and its blockers a/b/c are
  // all sibling epics in the same project.
  function seedEpics(targetBlockedBy: string[]): void {
    writeIssue("p", { kind: "project", title: "Proj", order: 0, createdAt: AT, updatedAt: AT });
    for (const [index, id] of ["a", "b", "c"].entries()) {
      writeIssue(id, {
        kind: "epic",
        title: id.toUpperCase(),
        partOf: "p",
        order: index,
        blockedBy: [],
        createdAt: AT,
        updatedAt: AT,
      });
    }
    writeIssue("t", {
      kind: "epic",
      title: "T",
      partOf: "p",
      order: 3,
      blockedBy: targetBlockedBy,
      createdAt: AT,
      updatedAt: AT,
    });
  }

  function blockedByOf(id: string): string[] {
    const raw = JSON.parse(readFileSync(join(dir, id, "issue.json"), "utf8"));
    return raw.blockedBy;
  }

  it("--add unions only the named ids into the current blockedBy", () => {
    seedEpics(["a"]);
    const { status } = runCli(["block", "t", "--add", "b"]);
    expect(status).toBe(0);
    expect(blockedByOf("t").sort()).toEqual(["a", "b"]);
  });

  it("--add is idempotent and never adds unnamed ids", () => {
    seedEpics(["a"]);
    const { status } = runCli(["block", "t", "--add", "a", "b"]);
    expect(status).toBe(0);
    // "a" already present (no duplicate) and "c" was never named.
    expect(blockedByOf("t").sort()).toEqual(["a", "b"]);
  });

  it("--remove drops only the named ids", () => {
    seedEpics(["a", "b", "c"]);
    const { status } = runCli(["block", "t", "--remove", "b"]);
    expect(status).toBe(0);
    expect(blockedByOf("t").sort()).toEqual(["a", "c"]);
  });

  it("--by replaces the entire blockedBy set", () => {
    seedEpics(["a", "b"]);
    const { status } = runCli(["block", "t", "--by", "c"]);
    expect(status).toBe(0);
    expect(blockedByOf("t")).toEqual(["c"]);
  });

  it("rejects combining --by with --add", () => {
    seedEpics(["a"]);
    const { stderr, status } = runCli(["block", "t", "--by", "b", "--add", "c"]);
    expect(status).toBe(1);
    expect(stderr).toMatch(/mutually exclusive/);
    expect(blockedByOf("t")).toEqual(["a"]);
  });

  it("requires exactly one of --by/--add/--remove", () => {
    seedEpics(["a"]);
    const { stderr, status } = runCli(["block", "t"]);
    expect(status).toBe(1);
    expect(stderr).toMatch(/provide exactly one of --by, --add, or --remove/);
  });

  it("rejects blocking a non-epic", () => {
    seedEpics(["a"]);
    // A branch under epic `a`; `block` targets epics only.
    writeIssue("br", {
      kind: "branch",
      title: "BR",
      partOf: "a",
      order: 0,
      merged: false,
      createdAt: AT,
      updatedAt: AT,
    });
    const { stderr, status } = runCli(["block", "br", "--add", "a"]);
    expect(status).toBe(1);
    expect(stderr).toMatch(/only valid on an epic/);
  });
});

describe("set-spec-review", () => {
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
  });

  it("sets specReview and prints it in show and list", () => {
    expect(runCli(["set-spec-review", "a", "passed"]).status).toBe(0);
    const raw = JSON.parse(readFileSync(join(dir, "a", "issue.json"), "utf8"));
    expect(raw.specReview).toBe("passed");

    const { stdout: showOut, status: showStatus } = runCli(["show", "a"]);
    expect(showStatus).toBe(0);
    expect(showOut).toContain("specReview: passed");

    const { stdout: listOut, status: listStatus } = runCli(["list", "--project", "p"]);
    expect(listStatus).toBe(0);
    const listed = JSON.parse(listOut);
    const branch = listed.issues.find((i: { id: string }) => i.id === "a");
    expect(branch.specReview).toBe("passed");
  });

  it("omits specReview from show when unset", () => {
    const { stdout, status } = runCli(["show", "a"]);
    expect(status).toBe(0);
    expect(stdout).not.toContain("specReview:");
  });

  it("rejects an invalid specReview value", () => {
    const { stderr, status } = runCli(["set-spec-review", "a", "pending"]);
    expect(status).toBe(1);
    expect(stderr).toMatch(/invalid specReview "pending"/);
  });

  it("rejects a non-branch id", () => {
    writeIssue("c1", {
      kind: "commit",
      title: "C1",
      partOf: "a",
      status: "todo",
      createdAt: nextAt(),
      updatedAt: nextAt(),
    });
    const { stderr, status } = runCli(["set-spec-review", "c1", "passed"]);
    expect(status).toBe(1);
    expect(stderr).toMatch(/only valid on a branch/);
  });

  it("preserves specReview across an epic apply round-trip", () => {
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
    expect(runCli(["set-spec-review", "a", "failed"]).status).toBe(0);
    expect(runCli(["apply", applyPath]).status).toBe(0);

    const raw = JSON.parse(readFileSync(join(dir, "a", "issue.json"), "utf8"));
    expect(raw.specReview).toBe("failed");
    expect(raw.title).toBe("Branch A renamed");

    const { stdout, status } = runCli(["show", "a"]);
    expect(status).toBe(0);
    expect(stdout).toContain("specReview: failed");
    expect(stdout).toContain("title: Branch A renamed");
  });
});

describe("set-no-diff", () => {
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
  });

  it("sets noDiff and prints it in show and summary", () => {
    expect(runCli(["set-no-diff", "c1", "true"]).status).toBe(0);
    const raw = JSON.parse(readFileSync(join(dir, "c1", "issue.json"), "utf8"));
    expect(raw.noDiff).toBe(true);

    const { stdout: showOut, status: showStatus } = runCli(["show", "c1"]);
    expect(showStatus).toBe(0);
    expect(showOut).toContain("noDiff: true");

    const { stdout: summaryOut, status: summaryStatus } = runCli(["summary", "c1"]);
    expect(summaryStatus).toBe(0);
    expect(summaryOut).toContain("noDiff: true");
  });

  it("clears noDiff when set to false", () => {
    expect(runCli(["set-no-diff", "c1", "true"]).status).toBe(0);
    expect(runCli(["set-no-diff", "c1", "false"]).status).toBe(0);
    const raw = JSON.parse(readFileSync(join(dir, "c1", "issue.json"), "utf8"));
    expect(raw).not.toHaveProperty("noDiff");

    const { stdout, status } = runCli(["show", "c1"]);
    expect(status).toBe(0);
    expect(stdout).not.toContain("noDiff:");
  });

  it("omits noDiff from show when unset", () => {
    const { stdout, status } = runCli(["show", "c1"]);
    expect(status).toBe(0);
    expect(stdout).not.toContain("noDiff:");
  });

  it("rejects an invalid noDiff value", () => {
    const { stderr, status } = runCli(["set-no-diff", "c1", "maybe"]);
    expect(status).toBe(1);
    expect(stderr).toMatch(/invalid noDiff "maybe"/);
  });

  it("rejects a non-commit id", () => {
    const { stderr, status } = runCli(["set-no-diff", "a", "true"]);
    expect(status).toBe(1);
    expect(stderr).toMatch(/only valid on a commit/);
  });
});

describe("assignee", () => {
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
  });

  it("prints only the assignee on stdout when set", () => {
    expect(runCli(["assign", "c1", "composer-2.5"]).status).toBe(0);
    const { stdout, status } = runCli(["assignee", "c1"]);
    expect(status).toBe(0);
    expect(stdout).toBe("composer-2.5\n");
  });

  it("exits 0 with empty stdout when assignee is unset", () => {
    const { stdout, status } = runCli(["assignee", "c1"]);
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });

  it("exits 0 with empty stdout for whitespace-only assignee", () => {
    writeIssue("c1", {
      kind: "commit",
      title: "C1",
      partOf: "a",
      status: "todo",
      assignee: "   ",
      createdAt: nextAt(),
      updatedAt: nextAt(),
    });
    const { stdout, status } = runCli(["assignee", "c1"]);
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });

  it("exits 0 with empty stdout for a project (no assignee field)", () => {
    const { stdout, status } = runCli(["assignee", "p"]);
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });

  it("errors with a nonzero exit on an unknown id", () => {
    const { stderr, status } = runCli(["assignee", "ghost"]);
    expect(status).toBe(1);
    expect(stderr).toContain('unknown issue "ghost"');
  });
});

describe("set-part-of", () => {
  const AT = "2026-07-10T14:00:00.000Z";
  beforeEach(() => {
    writeIssue("p", { kind: "project", title: "Proj", order: 0, createdAt: AT, updatedAt: AT });
    writeIssue("e", { kind: "epic", title: "Epic", partOf: "p", order: 0, createdAt: AT, updatedAt: AT });
    writeIssue("a", {
      kind: "branch",
      title: "A",
      partOf: "e",
      order: 0,
      merged: false,
      createdAt: AT,
      updatedAt: AT,
    });
    writeIssue("a2", {
      kind: "branch",
      title: "A2",
      partOf: "e",
      order: 1,
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

  function partOfOf(id: string): string {
    return JSON.parse(readFileSync(join(dir, id, "issue.json"), "utf8")).partOf;
  }

  it("reparents a commit under a new branch", () => {
    const { status } = runCli(["set-part-of", "c1", "a2"]);
    expect(status).toBe(0);
    expect(partOfOf("c1")).toBe("a2");
  });

  it("rejects a wrong-kind parent", () => {
    const { stderr, status } = runCli(["set-part-of", "c1", "e"]);
    expect(status).toBe(1);
    expect(stderr).toMatch(/must be a branch, not a epic/);
    expect(partOfOf("c1")).toBe("a");
  });

  it("rejects an unknown parent", () => {
    const { stderr, status } = runCli(["set-part-of", "c1", "ghost"]);
    expect(status).toBe(1);
    expect(stderr).toMatch(/references unknown issue "ghost"/);
    expect(partOfOf("c1")).toBe("a");
  });
});
