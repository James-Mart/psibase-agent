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

describe("show", () => {
  beforeEach(() => {
    writeIssue("p", { kind: "project", title: "Proj", createdAt: nextAt(), updatedAt: nextAt() });
    writeIssue("e", { kind: "epic", title: "Epic", partOf: "p", createdAt: nextAt(), updatedAt: nextAt() });
    writeIssue("a", {
      kind: "branch",
      title: "Branch A",
      partOf: "e",
      branchName: "feat/a",
      blockedBy: [],
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
});

describe("tree", () => {
  beforeEach(() => {
    writeIssue("p", { kind: "project", title: "Proj", createdAt: nextAt(), updatedAt: nextAt() });
    writeIssue("e", { kind: "epic", title: "Epic", partOf: "p", createdAt: nextAt(), updatedAt: nextAt() });
    writeIssue("a", {
      kind: "branch",
      title: "Branch A",
      partOf: "e",
      blockedBy: [],
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
      blockedBy: [],
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
  function seedBranches(targetBlockedBy: string[]): void {
    writeIssue("p", { kind: "project", title: "Proj", createdAt: AT, updatedAt: AT });
    writeIssue("e", { kind: "epic", title: "Epic", partOf: "p", createdAt: AT, updatedAt: AT });
    for (const id of ["a", "b", "c"]) {
      writeIssue(id, {
        kind: "branch",
        title: id.toUpperCase(),
        partOf: "e",
        blockedBy: [],
        merged: false,
        createdAt: AT,
        updatedAt: AT,
      });
    }
    writeIssue("t", {
      kind: "branch",
      title: "T",
      partOf: "e",
      blockedBy: targetBlockedBy,
      merged: false,
      createdAt: AT,
      updatedAt: AT,
    });
  }

  function blockedByOf(id: string): string[] {
    const raw = JSON.parse(readFileSync(join(dir, id, "issue.json"), "utf8"));
    return raw.blockedBy;
  }

  it("--add unions only the named ids into the current blockedBy", () => {
    seedBranches(["a"]);
    const { status } = runCli(["block", "t", "--add", "b"]);
    expect(status).toBe(0);
    expect(blockedByOf("t").sort()).toEqual(["a", "b"]);
  });

  it("--add is idempotent and never adds unnamed ids", () => {
    seedBranches(["a"]);
    const { status } = runCli(["block", "t", "--add", "a", "b"]);
    expect(status).toBe(0);
    // "a" already present (no duplicate) and "c" was never named.
    expect(blockedByOf("t").sort()).toEqual(["a", "b"]);
  });

  it("--remove drops only the named ids", () => {
    seedBranches(["a", "b", "c"]);
    const { status } = runCli(["block", "t", "--remove", "b"]);
    expect(status).toBe(0);
    expect(blockedByOf("t").sort()).toEqual(["a", "c"]);
  });

  it("--by replaces the entire blockedBy set", () => {
    seedBranches(["a", "b"]);
    const { status } = runCli(["block", "t", "--by", "c"]);
    expect(status).toBe(0);
    expect(blockedByOf("t")).toEqual(["c"]);
  });

  it("rejects combining --by with --add", () => {
    seedBranches(["a"]);
    const { stderr, status } = runCli(["block", "t", "--by", "b", "--add", "c"]);
    expect(status).toBe(1);
    expect(stderr).toMatch(/mutually exclusive/);
    expect(blockedByOf("t")).toEqual(["a"]);
  });

  it("requires exactly one of --by/--add/--remove", () => {
    seedBranches(["a"]);
    const { stderr, status } = runCli(["block", "t"]);
    expect(status).toBe(1);
    expect(stderr).toMatch(/provide exactly one of --by, --add, or --remove/);
  });

  it("rejects blocking a non-branch", () => {
    seedBranches(["a"]);
    const { stderr, status } = runCli(["block", "e", "--add", "a"]);
    expect(status).toBe(1);
    expect(stderr).toMatch(/only valid on a branch/);
  });
});

describe("set-part-of", () => {
  const AT = "2026-07-10T14:00:00.000Z";
  beforeEach(() => {
    writeIssue("p", { kind: "project", title: "Proj", createdAt: AT, updatedAt: AT });
    writeIssue("e", { kind: "epic", title: "Epic", partOf: "p", createdAt: AT, updatedAt: AT });
    writeIssue("a", {
      kind: "branch",
      title: "A",
      partOf: "e",
      blockedBy: [],
      merged: false,
      createdAt: AT,
      updatedAt: AT,
    });
    writeIssue("a2", {
      kind: "branch",
      title: "A2",
      partOf: "e",
      blockedBy: [],
      merged: false,
      createdAt: AT,
      updatedAt: AT,
    });
    writeIssue("c1", {
      kind: "commit",
      title: "C1",
      partOf: "a",
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
