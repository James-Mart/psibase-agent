import { Agent } from "@cursor/sdk";
import { upsertChatAgentId } from "../db.js";
import { getRemoteUrl } from "./git.js";

const FIRST_MESSAGE =
  "Explicitly acknowledge that you will use /manual-mode for the duration of this chat. If you do not recognize the /manual-mode skill, alert me.";

export type ChatError =
  | { kind: "missing_api_key" }
  | { kind: "sdk"; message: string };

const errors = new Map<string, ChatError>();

export function getChatError(name: string): ChatError | null {
  return errors.get(name) ?? null;
}

export async function initWorkerChat(
  name: string,
  workerDir: string,
): Promise<void> {
  errors.delete(name);
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) {
    errors.set(name, { kind: "missing_api_key" });
    console.warn(
      `CURSOR_API_KEY not set; skipping chat init for ${name}. ` +
        `Create one at https://cursor.com/dashboard/integrations.`,
    );
    return;
  }
  try {
    const rawRemote = getRemoteUrl(workerDir);
    if (!rawRemote) {
      throw new Error(`No origin remote configured in ${workerDir}`);
    }
    const agent = await Agent.create({
      apiKey,
      cloud: {
        env: { type: "machine", name },
        repos: [
          { url: normalizeRepoUrl(rawRemote), startingRef: "main" },
        ],
        autoCreatePR: false,
      },
    });
    try {
      await agent.send(FIRST_MESSAGE);
      upsertChatAgentId(name, agent.agentId);
    } finally {
      await agent[Symbol.asyncDispose]();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.set(name, { kind: "sdk", message });
    throw err;
  }
}

function normalizeRepoUrl(raw: string): string {
  let url = raw.trim();
  const ssh = url.match(/^git@([^:]+):(.+)$/);
  if (ssh) url = `https://${ssh[1]}/${ssh[2]}`;
  if (url.endsWith(".git")) url = url.slice(0, -".git".length);
  return url;
}
