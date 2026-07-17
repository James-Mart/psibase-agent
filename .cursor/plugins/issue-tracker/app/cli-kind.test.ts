import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { coerceSetPatch } from "./cli-kind.js";

describe("coerceSetPatch", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it.each([
    {
      name: "string title",
      kind: "project" as const,
      field: "title",
      value: "Hello",
      opts: {},
      patch: { title: "Hello" },
    },
    {
      name: "enum mergePolicy",
      kind: "project" as const,
      field: "mergePolicy",
      value: "pull-request",
      opts: {},
      patch: { mergePolicy: "pull-request" },
    },
    {
      name: "clearable workspace via --clear",
      kind: "project" as const,
      field: "workspace",
      value: undefined,
      opts: { clear: true },
      patch: { workspace: null },
    },
    {
      name: "description positional",
      kind: "project" as const,
      field: "description",
      value: "body\n",
      opts: {},
      patch: { description: "body\n" },
    },
    {
      name: "boolean true",
      kind: "story" as const,
      field: "merged",
      value: "true",
      opts: {},
      patch: { merged: true },
    },
    {
      name: "boolean false",
      kind: "task" as const,
      field: "noDiff",
      value: "false",
      opts: {},
      patch: { noDiff: false },
    },
    {
      name: "commitSha",
      kind: "task" as const,
      field: "commitSha",
      value: "0123456789abcdef0123456789abcdef01234567",
      opts: {},
      patch: { commitSha: "0123456789abcdef0123456789abcdef01234567" },
    },
    {
      name: "array full replace",
      kind: "epic" as const,
      field: "blockedBy",
      value: '["a","b"]',
      opts: {},
      patch: { blockedBy: ["a", "b"] },
    },
    {
      name: "array --clear empties",
      kind: "epic" as const,
      field: "blockedBy",
      value: undefined,
      opts: { clear: true },
      patch: { blockedBy: [] },
    },
    {
      name: "needsAttention true with --reason",
      kind: "epic" as const,
      field: "needsAttention",
      value: "true",
      opts: { reason: "blocked on design" },
      patch: { needsAttention: true, attentionReason: "blocked on design" },
    },
    {
      name: "needsAttention false clears reason",
      kind: "epic" as const,
      field: "needsAttention",
      value: "false",
      opts: {},
      patch: { needsAttention: false, attentionReason: null },
    },
    {
      name: "needsAttention --clear matches attention --clear",
      kind: "epic" as const,
      field: "needsAttention",
      value: undefined,
      opts: { clear: true },
      patch: { needsAttention: false, attentionReason: null },
    },
  ])("$name", ({ kind, field, value, opts, patch }) => {
    expect(coerceSetPatch(kind, field, value, opts)).toEqual(patch);
  });

  it("unions --add into current blockedBy", () => {
    expect(
      coerceSetPatch("epic", "blockedBy", undefined, { add: ["b", "a"] }, ["a"]),
    ).toEqual({ blockedBy: ["a", "b"] });
  });

  it("drops --remove from current blockedBy", () => {
    expect(
      coerceSetPatch(
        "epic",
        "blockedBy",
        undefined,
        { remove: ["b"] },
        ["a", "b", "c"],
      ),
    ).toEqual({ blockedBy: ["a", "c"] });
  });

  it("reads description from --file", () => {
    dir = mkdtempSync(join(tmpdir(), "cli-kind-"));
    const path = join(dir, "d.md");
    writeFileSync(path, "from file\n");
    expect(
      coerceSetPatch("project", "description", undefined, { file: path }),
    ).toEqual({ description: "from file\n" });
  });

  it.each([
    {
      name: "unknown field",
      kind: "project" as const,
      field: "assignee",
      value: "x",
      opts: {},
      error: /unknown or unsettable field "assignee"/,
    },
    {
      name: "invalid enum",
      kind: "project" as const,
      field: "mergePolicy",
      value: "nope",
      opts: {},
      error: /invalid mergePolicy "nope"/,
    },
    {
      name: "invalid boolean",
      kind: "task" as const,
      field: "noDiff",
      value: "maybe",
      opts: {},
      error: /invalid noDiff "maybe"/,
    },
    {
      name: "invalid commitSha",
      kind: "task" as const,
      field: "commitSha",
      value: "4019c25",
      opts: {},
      error: /invalid commit sha/,
    },
    {
      name: "invalid array json",
      kind: "epic" as const,
      field: "blockedBy",
      value: "[",
      opts: {},
      error: /invalid blockedBy JSON/,
    },
    {
      name: "non-string array json",
      kind: "epic" as const,
      field: "blockedBy",
      value: "[1,2]",
      opts: {},
      error: /expected a JSON array of strings/,
    },
    {
      name: "non-clearable --clear",
      kind: "project" as const,
      field: "title",
      value: undefined,
      opts: { clear: true },
      error: /field "title" cannot be cleared/,
    },
    {
      name: "--clear with value",
      kind: "project" as const,
      field: "workspace",
      value: "/tmp",
      opts: { clear: true },
      error: /--clear cannot be combined/,
    },
    {
      name: "--file with positional value",
      kind: "project" as const,
      field: "description",
      value: "inline",
      opts: { file: "/dev/null" },
      error: /--file cannot be combined with a positional value/,
    },
    {
      name: "needsAttention true without --reason",
      kind: "epic" as const,
      field: "needsAttention",
      value: "true",
      opts: {},
      error: /provide --reason/,
    },
    {
      name: "missing value",
      kind: "project" as const,
      field: "title",
      value: undefined,
      opts: {},
      error: /provide a value for title/,
    },
    {
      name: "--add on non-array field",
      kind: "project" as const,
      field: "title",
      value: undefined,
      opts: { add: ["x"] },
      error: /only valid for array fields/,
    },
    {
      name: "array value with --add",
      kind: "epic" as const,
      field: "blockedBy",
      value: '["a"]',
      opts: { add: ["b"] },
      error: /mutually exclusive/,
    },
    {
      name: "array missing mode",
      kind: "epic" as const,
      field: "blockedBy",
      value: undefined,
      opts: {},
      error: /provide a JSON array value, --file, --add, --remove, or --clear/,
    },
  ])("rejects $name", ({ kind, field, value, opts, error }) => {
    expect(() => coerceSetPatch(kind, field, value, opts)).toThrow(error);
  });
});
