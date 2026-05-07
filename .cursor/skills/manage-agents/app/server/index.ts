import express from "express";
import { execSync, spawn, execFileSync } from "child_process";
import {
  readdirSync,
  statSync,
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  unlinkSync,
} from "fs";
import { join, resolve, sep } from "path";
import { fileURLToPath } from "url";

const PORT = Number(process.env.PORT ?? 8071);
const PROD_PORT = 8070;
const WORKTREES_DIR = "/root/psibase.worktrees";
const REPO_ROOT = process.env.PSIBASE_ROOT ?? "/root/psibase";
const CREATE_WORKER_SCRIPT = join(
  REPO_ROOT,
  ".cursor/skills/manage-agents/scripts/create-worker.sh",
);

const NOTES_DIR = join(resolve(fileURLToPath(import.meta.url), "../../"), "notes");

const app = express();
app.use(express.json());

const isProdEnv = process.env.NODE_ENV === "production";
const distDir = join(fileURLToPath(import.meta.url), "../../dist");
if (isProdEnv && existsSync(distDir)) {
  app.use(express.static(distDir));
}

interface WorkerInfo {
  name: string;
  path: string;
  branch: string;
  agentRunning: boolean;
  agentPid: number | null;
}

function getAgentProcesses(): Map<string, number> {
  const result = new Map<string, number>();
  try {
    const out = execSync("ps -eo pid,args", { encoding: "utf-8" });
    for (const line of out.split("\n")) {
      if (!line.includes("agent") || !line.includes("worker")) continue;
      const match = line.match(
        /^\s*(\d+)\s+.*agent\b.*\bworker\s+start\b.*--worker-dir\s+(\S+)/,
      );
      if (match) {
        result.set(match[2], Number(match[1]));
        continue;
      }
      const nameMatch = line.match(
        /^\s*(\d+)\s+.*agent\b.*\bworker\s+start\b.*--name\s+(\S+)/,
      );
      if (nameMatch) {
        const workerDir = join(WORKTREES_DIR, nameMatch[2]);
        result.set(workerDir, Number(nameMatch[1]));
      }
    }
  } catch {
    // ps failed, return empty
  }
  return result;
}

function listWorkers(): WorkerInfo[] {
  if (!existsSync(WORKTREES_DIR)) return [];

  const agents = getAgentProcesses();
  const workers: WorkerInfo[] = [];

  for (const entry of readdirSync(WORKTREES_DIR)) {
    const fullPath = join(WORKTREES_DIR, entry);
    try {
      if (!statSync(fullPath).isDirectory()) continue;
    } catch {
      continue;
    }

    let branch = "(unknown)";
    try {
      branch = execFileSync("git", ["-C", fullPath, "rev-parse", "--abbrev-ref", "HEAD"], {
        encoding: "utf-8",
      }).trim();
    } catch {
      // not a git repo or detached HEAD
    }

    const pid = agents.get(fullPath) ?? null;
    workers.push({
      name: entry,
      path: fullPath,
      branch,
      agentRunning: pid !== null,
      agentPid: pid,
    });
  }

  workers.sort((a, b) => a.name.localeCompare(b.name));
  return workers;
}

app.get("/api/workers", (_req, res) => {
  try {
    res.json(listWorkers());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/workers", (req, res) => {
  const { branch, sourceBranch } = req.body ?? {};
  if (!branch || typeof branch !== "string") {
    res.status(400).json({ error: "branch is required" });
    return;
  }

  if (!/^[a-zA-Z0-9._\/-]+$/.test(branch)) {
    res.status(400).json({ error: "Invalid branch name" });
    return;
  }

  const args = [CREATE_WORKER_SCRIPT, branch];
  if (sourceBranch && typeof sourceBranch === "string") {
    args.push(sourceBranch);
  }

  try {
    const output = execSync(`bash ${args.map(a => `'${a}'`).join(" ")}`, {
      encoding: "utf-8",
      cwd: REPO_ROOT,
      timeout: 300_000,
    });

    const nameMatch = output.match(/WORKTREE_NAME=(\S+)/);
    const pathMatch = output.match(/WORKTREE_PATH=(\S+)/);
    const branchMatch = output.match(/BRANCH=(\S+)/);

    res.json({
      worktreeName: nameMatch?.[1] ?? null,
      worktreePath: pathMatch?.[1] ?? null,
      branch: branchMatch?.[1] ?? branch,
      output,
    });
  } catch (err: any) {
    res.status(500).json({
      error: "create-worker.sh failed",
      output: err.stdout ?? "",
      stderr: err.stderr ?? "",
    });
  }
});

app.post("/api/workers/:name/start", (req, res) => {
  const { name } = req.params;
  const workerDir = join(WORKTREES_DIR, name);

  if (!existsSync(workerDir)) {
    res.status(404).json({ error: `Worktree ${name} not found` });
    return;
  }

  const agents = getAgentProcesses();
  if (agents.has(workerDir)) {
    res.status(409).json({
      error: "Agent already running",
      pid: agents.get(workerDir),
    });
    return;
  }

  const child = spawn("agent", ["worker", "start", "--name", name], {
    cwd: workerDir,
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  res.json({ pid: child.pid });
});

app.post("/api/workers/:name/stop", (req, res) => {
  const { name } = req.params;
  const workerDir = join(WORKTREES_DIR, name);

  const agents = getAgentProcesses();
  const pid = agents.get(workerDir);

  if (!pid) {
    res.status(404).json({ error: "No running agent found for " + name });
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
    res.json({ ok: true, pid });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/workers/:name/details", (req, res) => {
  const { name } = req.params;
  const workerDir = join(WORKTREES_DIR, name);

  if (!existsSync(workerDir)) {
    res.status(404).json({ error: `Worktree ${name} not found` });
    return;
  }

  let unstagedFiles: { path: string; status: string }[] = [];
  try {
    const out = execFileSync("git", ["-C", workerDir, "status", "--porcelain", "-uall"], {
      encoding: "utf-8",
    });
    unstagedFiles = out
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => ({ path: l.slice(3), status: l.slice(0, 2).trim() }));
  } catch {
    // git status failed
  }

  let note = "";
  const noteFile = join(NOTES_DIR, `${name}.md`);
  if (existsSync(noteFile)) {
    note = readFileSync(noteFile, "utf-8");
  }

  res.json({ unstagedFiles, note });
});

app.put("/api/workers/:name/note", (req, res) => {
  const { name } = req.params;
  const { note } = req.body ?? {};
  const workerDir = join(WORKTREES_DIR, name);

  if (!existsSync(workerDir)) {
    res.status(404).json({ error: `Worktree ${name} not found` });
    return;
  }

  if (typeof note !== "string") {
    res.status(400).json({ error: "note must be a string" });
    return;
  }

  mkdirSync(NOTES_DIR, { recursive: true });
  writeFileSync(join(NOTES_DIR, `${name}.md`), note);
  res.json({ ok: true });
});

app.post("/api/workers/:name/rename", (req, res) => {
  const { name } = req.params;
  const { newName } = req.body ?? {};

  if (!newName || typeof newName !== "string") {
    res.status(400).json({ error: "newName is required" });
    return;
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(newName)) {
    res.status(400).json({ error: "Invalid name (alphanumeric, hyphens, underscores, dots only)" });
    return;
  }
  if (newName === name) {
    res.status(400).json({ error: "New name is the same as the current name" });
    return;
  }

  const oldWorkerDir = join(WORKTREES_DIR, name);
  const newWorkerDir = join(WORKTREES_DIR, newName);

  if (!existsSync(oldWorkerDir)) {
    res.status(404).json({ error: `Worktree ${name} not found` });
    return;
  }
  if (existsSync(newWorkerDir)) {
    res.status(409).json({ error: `Worktree ${newName} already exists` });
    return;
  }

  const agents = getAgentProcesses();
  if (agents.has(oldWorkerDir)) {
    res.status(409).json({ error: "Cannot rename while agent is running. Stop it first." });
    return;
  }

  // Derive the git metadata dir from the worktree's .git file
  const dotGitContent = readFileSync(join(oldWorkerDir, ".git"), "utf-8").trim();
  const gitdirMatch = dotGitContent.match(/^gitdir:\s*(.+)$/);
  if (!gitdirMatch) {
    res.status(500).json({ error: "Cannot parse .git file in worktree" });
    return;
  }
  const oldMetaDir = resolve(oldWorkerDir, gitdirMatch[1]);
  const worktreesParent = resolve(oldMetaDir, "..");
  const newMetaDir = join(worktreesParent, newName);

  try {
    // Step 1: Rename worktree directory
    renameSync(oldWorkerDir, newWorkerDir);

    // Step 2: Update .git file inside worktree to point to new metadata dir
    writeFileSync(join(newWorkerDir, ".git"), `gitdir: ${newMetaDir}\n`);

    // Step 3: Update gitdir in metadata dir, then rename it
    writeFileSync(join(oldMetaDir, "gitdir"), `${newWorkerDir}/.git\n`);
    renameSync(oldMetaDir, newMetaDir);

    // Steps 4+5: Update submodule references if modules/ exists
    const modulesDir = join(newMetaDir, "modules");
    if (existsSync(modulesDir)) {
      // Step 4: Update submodule .git files inside the worktree
      const updateSubmoduleGitFiles = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const fullPath = join(dir, entry.name);
          if (entry.name === "node_modules") continue;
          if (entry.isDirectory()) {
            updateSubmoduleGitFiles(fullPath);
          } else if (entry.name === ".git" && entry.isFile() && fullPath !== join(newWorkerDir, ".git")) {
            const content = readFileSync(fullPath, "utf-8");
            if (content.includes(`/worktrees/${name}/`)) {
              writeFileSync(fullPath, content.replaceAll(`/worktrees/${name}/`, `/worktrees/${newName}/`));
            }
          }
        }
      };
      updateSubmoduleGitFiles(newWorkerDir);

      // Step 5: Update worktree paths in module config files
      const updateModuleConfigs = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            updateModuleConfigs(fullPath);
          } else if (entry.name === "config" && entry.isFile()) {
            const content = readFileSync(fullPath, "utf-8");
            if (content.includes(`psibase.worktrees/${name}/`)) {
              writeFileSync(fullPath, content.replaceAll(`psibase.worktrees/${name}/`, `psibase.worktrees/${newName}/`));
            }
          }
        }
      };
      updateModuleConfigs(modulesDir);
    }

    // Rename note file if it exists
    const oldNote = join(NOTES_DIR, `${name}.md`);
    if (existsSync(oldNote)) {
      renameSync(oldNote, join(NOTES_DIR, `${newName}.md`));
    }

    res.json({ ok: true, newName });
  } catch (err: any) {
    res.status(500).json({ error: `Rename failed: ${err.message}` });
  }
});

const WORKER_NAME_RE = /^[a-zA-Z0-9._-]+$/;

function resolveSafeWorkerDir(name: string): string | null {
  if (!WORKER_NAME_RE.test(name)) return null;
  const workerDir = join(WORKTREES_DIR, name);
  const resolved = resolve(workerDir);
  const base = resolve(WORKTREES_DIR);
  if (resolved !== base && !resolved.startsWith(base + sep)) return null;
  return workerDir;
}

app.delete("/api/workers/:name", async (req, res) => {
  const { name } = req.params;
  const workerDir = resolveSafeWorkerDir(name);
  if (!workerDir) {
    res.status(400).json({ error: "Invalid worker name" });
    return;
  }
  if (!existsSync(workerDir)) {
    res.status(404).json({ error: `Worktree ${name} not found` });
    return;
  }

  const agents = getAgentProcesses();
  const pid = agents.get(workerDir);
  if (pid) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* ignore */
    }
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      try {
        process.kill(pid, 0);
      } catch {
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  let branchForDelete = "";
  try {
    branchForDelete = execFileSync(
      "git",
      ["-C", workerDir, "rev-parse", "--abbrev-ref", "HEAD"],
      { encoding: "utf-8" },
    ).trim();
  } catch {
    branchForDelete = "";
  }

  const gitLogs: string[] = [];
  const runGit = (args: string[]) => {
    try {
      const out = execFileSync("git", args, { encoding: "utf-8" });
      if (out.trim()) gitLogs.push(out.trim());
    } catch (e: any) {
      const stderr = e.stderr?.toString?.() ?? e.message ?? String(e);
      throw new Error(stderr.trim() || `git ${args.join(" ")} failed`);
    }
  };

  try {
    runGit(["-C", REPO_ROOT, "worktree", "remove", "--force", workerDir]);
    runGit(["-C", REPO_ROOT, "worktree", "prune"]);
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Git worktree remove failed" });
    return;
  }

  let branchDeleted = false;
  let branchDeleteMessage: string | undefined;
  const canDeleteBranch =
    branchForDelete &&
    branchForDelete !== "HEAD" &&
    branchForDelete !== "(unknown)";

  if (canDeleteBranch) {
    try {
      execFileSync("git", ["-C", REPO_ROOT, "branch", "-D", branchForDelete], {
        encoding: "utf-8",
      });
      branchDeleted = true;
    } catch (e: any) {
      const stderr = e.stderr?.toString?.() ?? e.message ?? String(e);
      branchDeleteMessage = stderr.trim() || "branch -D failed";
    }
  } else if (branchForDelete === "HEAD") {
    branchDeleteMessage = "Skipped branch delete (detached HEAD)";
  } else if (!branchForDelete || branchForDelete === "(unknown)") {
    branchDeleteMessage = "Skipped branch delete (could not resolve branch)";
  }

  const noteFile = join(NOTES_DIR, `${name}.md`);
  try {
    if (existsSync(noteFile)) unlinkSync(noteFile);
  } catch {
    /* ignore */
  }

  res.json({
    ok: true,
    branch: branchForDelete || null,
    branchDeleted,
    branchDeleteMessage,
    output: gitLogs.length ? gitLogs.join("\n") : undefined,
  });
});

if (isProdEnv && existsSync(distDir)) {
  app.get("*", (_req, res) => {
    res.sendFile(join(distDir, "index.html"));
  });
}
const listenPort = isProdEnv ? PROD_PORT : PORT;
app.listen(listenPort, () => {
  console.log(`manage-agents server listening on http://localhost:${listenPort}`);
});
