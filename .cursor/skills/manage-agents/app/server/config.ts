import { existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

export const PORT = Number(process.env.PORT ?? 8071);
export const PROD_PORT = 8070;
export const WORKTREES_DIR = "/root/psibase.worktrees";
export const REPO_ROOT = process.env.PSIBASE_ROOT ?? "/root/psibase";
export const MAIN_WORKER_NAME = "main";

export const isProdEnv = process.env.NODE_ENV === "production";
export const distDir = join(fileURLToPath(import.meta.url), "../../dist");
export const hasBuiltClient = existsSync(distDir);
export const listenPort = isProdEnv ? PROD_PORT : PORT;
