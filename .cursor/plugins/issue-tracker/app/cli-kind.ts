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
import type { IssueDetail, IssueKind, IssuePatch } from "./server/schemas.js";

export type KindSetOptions = {
  clear?: boolean;
  file?: string;
  reason?: string;
};

function articleFor(kind: IssueKind): "a" | "an" {
  return kind === "epic" ? "an" : "a";
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
  return modes;
}

export function coerceSetPatch(
  kind: IssueKind,
  field: string,
  value: string | undefined,
  opts: KindSetOptions,
): IssuePatch {
  const tables = KIND_SET_FIELDS[kind] as Record<string, SetFieldSpec>;
  const spec = tables[field];
  if (!spec) {
    throw new Error(`unknown or unsettable field "${field}" for ${kind}`);
  }

  const modes = countSetModes(value, opts);
  if (opts.clear) {
    if (modes.length > 1) {
      throw new Error("--clear cannot be combined with a value or --file");
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
  switch (detail.kind) {
    case "project":
      switch (field) {
        case "id":
          return detail.id;
        case "kind":
          return detail.kind;
        case "title":
          return detail.title;
        case "workspace":
          return detail.workspace;
        case "mergePolicy":
          return detail.mergePolicy;
        case "order":
          return detail.order;
        case "createdAt":
          return detail.createdAt;
        case "updatedAt":
          return detail.updatedAt;
        default:
          throw new Error(`unknown field "${field}" for project`);
      }
    case "epic":
      switch (field) {
        case "id":
          return detail.id;
        case "kind":
          return detail.kind;
        case "title":
          return detail.title;
        case "partOf":
          return detail.partOf;
        case "assignee":
          return detail.assignee;
        case "needsAttention":
          return detail.needsAttention;
        case "attentionReason":
          return detail.attentionReason;
        case "blockedBy":
          return detail.blockedBy;
        case "order":
          return detail.order;
        case "createdAt":
          return detail.createdAt;
        case "updatedAt":
          return detail.updatedAt;
        default:
          throw new Error(`unknown field "${field}" for epic`);
      }
    case "branch":
      switch (field) {
        case "id":
          return detail.id;
        case "kind":
          return detail.kind;
        case "title":
          return detail.title;
        case "partOf":
          return detail.partOf;
        case "assignee":
          return detail.assignee;
        case "needsAttention":
          return detail.needsAttention;
        case "attentionReason":
          return detail.attentionReason;
        case "branchName":
          return detail.branchName;
        case "mergeBase":
          return detail.mergeBase;
        case "stackedOn":
          return detail.stackedOn;
        case "prUrl":
          return detail.prUrl;
        case "merged":
          return detail.merged;
        case "specReview":
          return detail.specReview;
        case "order":
          return detail.order;
        case "createdAt":
          return detail.createdAt;
        case "updatedAt":
          return detail.updatedAt;
        default:
          throw new Error(`unknown field "${field}" for branch`);
      }
    case "commit":
      switch (field) {
        case "id":
          return detail.id;
        case "kind":
          return detail.kind;
        case "title":
          return detail.title;
        case "partOf":
          return detail.partOf;
        case "assignee":
          return detail.assignee;
        case "needsAttention":
          return detail.needsAttention;
        case "attentionReason":
          return detail.attentionReason;
        case "status":
          return detail.status;
        case "commitSha":
          return detail.commitSha;
        case "noDiff":
          return detail.noDiff;
        case "order":
          return detail.order;
        case "createdAt":
          return detail.createdAt;
        case "updatedAt":
          return detail.updatedAt;
        default:
          throw new Error(`unknown field "${field}" for commit`);
      }
  }
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

export function kindSet(
  kind: IssueKind,
  id: string,
  field: string,
  value: string | undefined,
  opts: KindSetOptions,
): ReturnType<typeof update> {
  assertKind(kind, id);
  const patch = coerceSetPatch(kind, field, value, opts);
  return update(id, patch);
}

export function registerKindGetSet(
  program: Command,
  kind: IssueKind,
  run: (action: () => unknown) => Promise<void>,
): void {
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
    .action(
      (id: string, field: string, value: string | undefined, opts: KindSetOptions) =>
        run(() => kindSet(kind, id, field, value, opts)),
    );
}
