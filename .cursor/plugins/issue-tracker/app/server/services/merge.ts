import type { Issue, IssuePatch } from "../schemas.js";
import { CLEARABLE_KEYS, MERGEABLE_KEYS } from "../fields.js";

const clearable = new Set<string>(CLEARABLE_KEYS);

export function mergeIssue(existing: Issue, patch: IssuePatch): Issue {
  const merged: Record<string, unknown> = { ...existing };
  for (const key of MERGEABLE_KEYS) {
    const value = patch[key];
    if (value === undefined) continue;
    if (value === null && clearable.has(key)) {
      delete merged[key];
    } else {
      merged[key] = value;
    }
  }
  return merged as Issue;
}
