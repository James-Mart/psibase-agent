import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { basename, join } from "path";
import mime from "mime";
import { issuesDir } from "../config.js";
import { IssueError } from "./errors.js";
import { readIssueOrThrow, serialize } from "./issues.js";

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export interface Attachment {
  name: string;
  size: number;
  mtime: string;
  mime: string;
}

export interface AttachmentBytes {
  meta: Attachment;
  bytes: Buffer;
}

function attachmentsDir(id: string): string {
  return join(issuesDir, id, "attachments");
}

/** Absolute on-disk path for `issues/<id>/attachments/<name>`. */
export function attachmentPath(id: string, name: string): string {
  return join(attachmentsDir(id), name);
}

function mimeOf(name: string): string {
  return mime.lookup(name) || "application/octet-stream";
}

function assertSafeBasename(name: string): void {
  if (
    !name ||
    name.includes("\0") ||
    name.includes("/") ||
    name.includes("\\") ||
    name === "." ||
    name === ".." ||
    basename(name) !== name
  ) {
    throw new IssueError("validation", `unsafe attachment name "${name}"`);
  }
}

function requireAttachable(id: string): void {
  const issue = readIssueOrThrow(id);
  if (issue.kind === "project") {
    throw new IssueError(
      "validation",
      `attachments are not allowed on a project`,
    );
  }
}

function toAttachment(dir: string, name: string): Attachment {
  const st = statSync(join(dir, name));
  return {
    name,
    size: st.size,
    mtime: st.mtime.toISOString(),
    mime: mimeOf(name),
  };
}

function withAttachmentFile<T>(
  id: string,
  name: string,
  fn: (path: string) => T,
): Promise<T> {
  return serialize(() => {
    requireAttachable(id);
    assertSafeBasename(name);
    return fn(attachmentPath(id, name));
  });
}

/** List attachment metadata under `issues/<id>/attachments/`. */
export function listAttachments(id: string): Attachment[] {
  requireAttachable(id);
  const dir = attachmentsDir(id);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => statSync(join(dir, name)).isFile())
    .sort()
    .map((name) => toAttachment(dir, name));
}

/** Read one attachment's metadata and bytes. */
export function getAttachment(
  id: string,
  name: string,
): Promise<AttachmentBytes> {
  return withAttachmentFile(id, name, (path) => {
    if (!existsSync(path) || !statSync(path).isFile()) {
      throw new IssueError(
        "not_found",
        `attachment "${name}" not found on "${id}"`,
      );
    }
    return {
      meta: toAttachment(attachmentsDir(id), name),
      bytes: readFileSync(path),
    };
  });
}

/** Upsert an attachment; creates the attachments directory when needed. */
export function putAttachment(
  id: string,
  name: string,
  bytes: Uint8Array,
): Promise<Attachment> {
  return withAttachmentFile(id, name, (path) => {
    if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
      throw new IssueError(
        "validation",
        `attachment exceeds ${MAX_ATTACHMENT_BYTES} byte limit`,
      );
    }
    mkdirSync(attachmentsDir(id), { recursive: true });
    writeFileSync(path, bytes);
    return toAttachment(attachmentsDir(id), name);
  });
}

/** Delete one attachment file. */
export function removeAttachment(id: string, name: string): Promise<void> {
  return withAttachmentFile(id, name, (path) => {
    if (!existsSync(path) || !statSync(path).isFile()) {
      throw new IssueError(
        "not_found",
        `attachment "${name}" not found on "${id}"`,
      );
    }
    rmSync(path);
  });
}
