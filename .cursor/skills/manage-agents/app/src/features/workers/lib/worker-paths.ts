const WORKTREES_DIR = "/root/psibase.worktrees";

export const branchToWorkerName = (branch: string): string =>
  branch.replace(/\//g, "-");

export const branchToWorktreePath = (branch: string): string =>
  `${WORKTREES_DIR}/${branchToWorkerName(branch)}`;
