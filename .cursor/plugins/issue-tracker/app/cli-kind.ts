import type { Command } from "commander";
import { coerceBoolean, coerceEnum, coerceJson } from "./cli-coerce.js";
import { readCliFileArg } from "./cli-io.js";
import {
  isClearableSetField,
  KIND_GET_FIELDS,
  KIND_SET_FIELDS,
  type SetFieldSpec,
} from "./server/kind-fields.js";
import { list, read, update } from "./server/services/issues.js";
import { validateFullCommitSha } from "./server/services/commit-sha.js";
import type { IssueDetail, IssueKind, IssuePatch } from "./server/schemas.js";

export type KindSetOptions = {
  clear?: boolean;
  file?: string;
  reason?: string;
  add?: string[];
  remove?: string[];
};

function articleFor(kind: IssueKind): "a" | "an" {
  return kind === "epic" || kind === "idea" ? "an" : "a";
}

function assertKind(expected: IssueKind, id: string): IssueDetail {
  const detail = read(id);
  if (detail.kind !== expected) {
    throw new Error(
      `"${id}" is ${articleFor(detail.kind)} ${detail.kind}, not ${articleFor(expected)} ${expected}`,
    );
  }
  return detail;
}

function resolveFileOrValue(
  value: string | undefined,
  file: string | undefined,
): string | undefined {
  if (file !== undefined) {
    if (value !== undefined) {
      throw new Error("--file cannot be combined with a positional value");
    }
    return readCliFileArg(file);
  }
  return value;
}

function countSetModes(
  value: string | undefined,
  opts: KindSetOptions,
): string[] {
  const modes: string[] = [];
  if (value !== undefined) modes.push("value");
  if (opts.file !== undefined) modes.push("--file");
  if (opts.clear) modes.push("--clear");
  if (opts.add !== undefined) modes.push("--add");
  if (opts.remove !== undefined) modes.push("--remove");
  return modes;
}

function formatModes(modes: string[]): string {
  return modes.join(", ");
}

function coerceArrayPatch(
  field: string,
  value: string | undefined,
  opts: KindSetOptions,
  current: string[] | undefined,
): IssuePatch {
  const modes = countSetModes(value, opts);
  if (modes.length === 0) {
    throw new Error(
      `provide a JSON array value, --file, --add, --remove, or --clear for ${field}`,
    );
  }
  if (modes.length > 1) {
    throw new Error(
      `value, --file, --clear, --add, and --remove are mutually exclusive (got ${formatModes(modes)})`,
    );
  }
  if (opts.clear) {
    return { [field]: [] } as IssuePatch;
  }
  if (opts.add !== undefined) {
    if (!current) {
      throw new Error(`current value required for --add on ${field}`);
    }
    return {
      [field]: [
        ...current,
        ...opts.add.filter((id) => !current.includes(id)),
      ],
    } as IssuePatch;
  }
  if (opts.remove !== undefined) {
    if (!current) {
      throw new Error(`current value required for --remove on ${field}`);
    }
    return {
      [field]: current.filter((id) => !opts.remove!.includes(id)),
    } as IssuePatch;
  }

  const raw = resolveFileOrValue(value, opts.file);
  if (raw === undefined) {
    throw new Error(`provide a value for ${field}`);
  }
  const parsed = coerceJson(raw, field);
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
    throw new Error(`invalid ${field}: expected a JSON array of strings`);
  }
  return { [field]: parsed } as IssuePatch;
}

export function coerceSetPatch(
  kind: IssueKind,
  field: string,
  value: string | undefined,
  opts: KindSetOptions,
  currentArray?: string[],
): IssuePatch {
  const tables = KIND_SET_FIELDS[kind] as Record<string, SetFieldSpec>;
  const spec = tables[field];
  if (!spec) {
    throw new Error(`unknown or unsettable field "${field}" for ${kind}`);
  }

  if (spec.type === "array") {
    return coerceArrayPatch(field, value, opts, currentArray);
  }

  if (opts.add !== undefined || opts.remove !== undefined) {
    throw new Error("--add and --remove are only valid for array fields");
  }

  const modes = countSetModes(value, opts);
  if (opts.clear) {
    if (modes.length > 1) {
      throw new Error(
        "--clear cannot be combined with a value, --file, --add, or --remove",
      );
    }
    if (spec.type === "needsAttention") {
      return { needsAttention: false, attentionReason: null };
    }
    if (!isClearableSetField(field)) {
      throw new Error(`field "${field}" cannot be cleared`);
    }
    return { [field]: null } as IssuePatch;
  }

  if (spec.type === "needsAttention") {
    const raw = resolveFileOrValue(value, opts.file);
    if (raw === undefined) {
      throw new Error(`provide a value for ${field}`);
    }
    const on = coerceBoolean(raw, field);
    if (on) {
      if (!opts.reason) {
        throw new Error("provide --reason <text> when setting needsAttention true");
      }
      return { needsAttention: true, attentionReason: opts.reason };
    }
    return { needsAttention: false, attentionReason: null };
  }

  if (spec.type === "description") {
    const raw = resolveFileOrValue(value, opts.file);
    if (raw === undefined) {
      throw new Error("provide a value or --file <path>");
    }
    return { description: raw };
  }

  const raw = resolveFileOrValue(value, opts.file);
  if (raw === undefined) {
    throw new Error(`provide a value for ${field}`);
  }

  switch (spec.type) {
    case "string":
      return { [field]: raw } as IssuePatch;
    case "commitSha":
      validateFullCommitSha(raw);
      return { commitSha: raw };
    case "boolean":
      return { [field]: coerceBoolean(raw, field) } as IssuePatch;
    case "enum":
      return { [field]: coerceEnum(raw, field, spec.values) } as IssuePatch;
    case "json":
      return { [field]: coerceJson(raw, field) } as IssuePatch;
  }
}

function formatGetValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value === "" ? null : value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function storedFieldValue(detail: IssueDetail, field: string): unknown {
  return (detail as Record<string, unknown>)[field];
}

export function kindGetValue(
  kind: IssueKind,
  id: string,
  field: string,
): string | null {
  const tables = KIND_GET_FIELDS[kind] as Record<
    string,
    { source: "stored" | "description" | "derived" }
  >;
  const spec = tables[field];
  if (!spec) {
    throw new Error(`unknown field "${field}" for ${kind}`);
  }

  const detail = assertKind(kind, id);

  if (spec.source === "description") {
    return formatGetValue(detail.description);
  }

  if (spec.source === "derived") {
    const { derived } = list();
    const state = derived[id];
    if (!state) return null;
    return formatGetValue(state[field as keyof typeof state]);
  }

  return formatGetValue(storedFieldValue(detail, field));
}

function currentArrayValue(detail: IssueDetail, field: string): string[] {
  const value = storedFieldValue(detail, field);
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`field "${field}" is not a string array on ${detail.kind}`);
  }
  return value;
}

export function kindSet(
  kind: IssueKind,
  id: string,
  field: string,
  value: string | undefined,
  opts: KindSetOptions,
): ReturnType<typeof update> {
  const detail = assertKind(kind, id);
  const tables = KIND_SET_FIELDS[kind] as Record<string, SetFieldSpec>;
  const spec = tables[field];
  const currentArray =
    spec?.type === "array" ? currentArrayValue(detail, field) : undefined;
  const patch = coerceSetPatch(kind, field, value, opts, currentArray);
  return update(id, patch);
}

export function registerKindGetSet(
  program: Command,
  kind: IssueKind,
  run: (action: () => unknown) => Promise<void>,
): Command {
  const cmd = program.command(kind);

  cmd
    .command("get")
    .argument("<id>", `${kind} id`)
    .argument("<field>", "field name (camelCase)")
    .action((id: string, field: string) =>
      run(() => {
        const value = kindGetValue(kind, id, field);
        if (value === null) return;
        process.stdout.write(value.endsWith("\n") ? value : `${value}\n`);
      }),
    );

  cmd
    .command("set")
    .argument("<id>", `${kind} id`)
    .argument("<field>", "field name (camelCase)")
    .argument("[value]", "new value")
    .option("--clear", "clear the field")
    .option("--file <path>", "read value from a file (use - for stdin)")
    .option("--reason <text>", "required when setting needsAttention true")
    .option("--add <ids...>", "union ids into an array field")
    .option("--remove <ids...>", "drop ids from an array field")
    .action(
      (id: string, field: string, value: string | undefined, opts: KindSetOptions) =>
        run(() => kindSet(kind, id, field, value, opts)),
    );

  return cmd;
}
