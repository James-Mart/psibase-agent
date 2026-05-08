import { execFile, execFileSync } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface DiskStats {
  total: number;
  used: number;
  free: number;
}

export function getDiskStats(): DiskStats {
  const out = execFileSync("df", ["-B1", "--output=size,used,avail", "/"], {
    encoding: "utf-8",
  });
  const lines = out.trim().split("\n");
  const parts = lines[lines.length - 1].trim().split(/\s+/);
  return {
    total: Number(parts[0]),
    used: Number(parts[1]),
    free: Number(parts[2]),
  };
}

export async function getWorktreeDiskSize(dir: string): Promise<number> {
  const { stdout } = await execFileAsync("du", ["-sb", dir], {
    encoding: "utf-8",
    timeout: 60_000,
  });
  return Number(stdout.trim().split(/\s+/)[0]);
}
