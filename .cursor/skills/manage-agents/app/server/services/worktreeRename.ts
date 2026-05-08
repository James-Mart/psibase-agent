import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "fs";
import { join, resolve } from "path";
import { HttpError } from "../errors.js";

interface Layout {
  oldWorkerDir: string;
  newWorkerDir: string;
  oldMetaDir: string;
  newMetaDir: string;
}

function readGitdirFromDotGit(workerDir: string): string {
  const dotGitContent = readFileSync(join(workerDir, ".git"), "utf-8").trim();
  const match = dotGitContent.match(/^gitdir:\s*(.+)$/);
  if (!match) {
    throw new HttpError(500, "Cannot parse .git file in worktree");
  }
  return match[1];
}

function planLayout(
  oldWorkerDir: string,
  newWorkerDir: string,
  newName: string,
): Layout {
  const gitdirRel = readGitdirFromDotGit(oldWorkerDir);
  const oldMetaDir = resolve(oldWorkerDir, gitdirRel);
  const worktreesParent = resolve(oldMetaDir, "..");
  const newMetaDir = join(worktreesParent, newName);
  return { oldWorkerDir, newWorkerDir, oldMetaDir, newMetaDir };
}

function rewriteWorktreeDotGit(workerDir: string, metaDir: string): void {
  writeFileSync(join(workerDir, ".git"), `gitdir: ${metaDir}\n`);
}

function rewriteMetaGitdirPointer(metaDir: string, workerDir: string): void {
  writeFileSync(join(metaDir, "gitdir"), `${workerDir}/.git\n`);
}

function rewriteSubmoduleDotGitFiles(
  workerDir: string,
  oldName: string,
  newName: string,
): void {
  const skipNames = new Set(["node_modules"]);
  const rootDotGit = join(workerDir, ".git");
  const needle = `/worktrees/${oldName}/`;
  const replacement = `/worktrees/${newName}/`;

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (skipNames.has(entry.name)) continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.name !== ".git" || !entry.isFile()) continue;
      if (fullPath === rootDotGit) continue;
      const content = readFileSync(fullPath, "utf-8");
      if (content.includes(needle)) {
        writeFileSync(fullPath, content.replaceAll(needle, replacement));
      }
    }
  };

  walk(workerDir);
}

function rewriteSubmoduleConfigs(
  modulesDir: string,
  oldName: string,
  newName: string,
): void {
  const needle = `psibase.worktrees/${oldName}/`;
  const replacement = `psibase.worktrees/${newName}/`;

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.name !== "config" || !entry.isFile()) continue;
      const content = readFileSync(fullPath, "utf-8");
      if (content.includes(needle)) {
        writeFileSync(fullPath, content.replaceAll(needle, replacement));
      }
    }
  };

  walk(modulesDir);
}

export function renameWorktreeOnDisk(
  oldWorkerDir: string,
  newWorkerDir: string,
  oldName: string,
  newName: string,
): void {
  const { oldMetaDir, newMetaDir } = planLayout(
    oldWorkerDir,
    newWorkerDir,
    newName,
  );

  renameSync(oldWorkerDir, newWorkerDir);
  rewriteWorktreeDotGit(newWorkerDir, newMetaDir);
  rewriteMetaGitdirPointer(oldMetaDir, newWorkerDir);
  renameSync(oldMetaDir, newMetaDir);

  const modulesDir = join(newMetaDir, "modules");
  if (existsSync(modulesDir)) {
    rewriteSubmoduleDotGitFiles(newWorkerDir, oldName, newName);
    rewriteSubmoduleConfigs(modulesDir, oldName, newName);
  }
}
