import type { IssueKind } from "@server/schemas";

/** Attachments are allowed on Epic, Branch, and Commit — not Project. */
export function supportsAttachments(kind: IssueKind): boolean {
  return kind !== "project";
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** List/upload collection path, or one attachment when `name` is set. */
export function attachmentsApiPath(id: string, name?: string): string {
  const base = `/api/issues/${encodeURIComponent(id)}/attachments`;
  return name === undefined
    ? base
    : `${base}/${encodeURIComponent(name)}`;
}
