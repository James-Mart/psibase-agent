import {
  SUPPORTING_DOC_KEYS,
  type SupportingDocKey,
  type SupportingDocRef,
  type SupportingDocs,
} from "@server/schemas";

export const SUPPORTING_DOC_KEY_LABELS: Record<SupportingDocKey, string> = {
  vision: "Vision",
  codingStandards: "Coding standards",
  designSystem: "Design system",
};

export type SupportingDocMode = "absent" | "attachment" | "workspace";

export type SupportingDocDraft =
  | { mode: "absent" }
  | { mode: "attachment"; name: string }
  | { mode: "workspace"; path: string };

export type SupportingDocsDraft = Record<SupportingDocKey, SupportingDocDraft>;

export function emptySupportingDocDraft(): SupportingDocDraft {
  return { mode: "absent" };
}

export function supportingDocDraftForMode(
  mode: SupportingDocMode,
): SupportingDocDraft {
  switch (mode) {
    case "absent":
      return { mode: "absent" };
    case "attachment":
      return { mode: "attachment", name: "" };
    case "workspace":
      return { mode: "workspace", path: "" };
  }
}

export function supportingDocDraftFromRef(
  ref: SupportingDocRef | undefined,
): SupportingDocDraft {
  if (!ref) return emptySupportingDocDraft();
  if (ref.type === "attachment") {
    return { mode: "attachment", name: ref.name };
  }
  return { mode: "workspace", path: ref.path };
}

export function supportingDocsDraftFromIssue(
  docs: SupportingDocs | undefined,
): SupportingDocsDraft {
  const draft = {} as SupportingDocsDraft;
  for (const key of SUPPORTING_DOC_KEYS) {
    draft[key] = supportingDocDraftFromRef(docs?.[key]);
  }
  return draft;
}

export function formatSupportingDocRef(ref: SupportingDocRef): string {
  return ref.type === "attachment"
    ? `attachment:${ref.name}`
    : `workspace:${ref.path}`;
}

export function supportingDocRefFromDraft(
  draft: SupportingDocDraft,
): SupportingDocRef | undefined {
  if (draft.mode === "absent") return undefined;
  if (draft.mode === "attachment") {
    const name = draft.name.trim();
    if (!name) return undefined;
    return { type: "attachment", name };
  }
  const path = draft.path.trim();
  if (!path) return undefined;
  return { type: "workspace", path };
}

/** Build stored `supportingDocs` (or `null` to clear) from edit drafts. */
export function supportingDocsFromDraft(
  draft: SupportingDocsDraft,
): SupportingDocs | null {
  const next: SupportingDocs = {};
  for (const key of SUPPORTING_DOC_KEYS) {
    const ref = supportingDocRefFromDraft(draft[key]);
    if (ref) next[key] = ref;
  }
  return Object.keys(next).length === 0 ? null : next;
}

export function supportingDocsEqual(
  a: SupportingDocs | null | undefined,
  b: SupportingDocs | null | undefined,
): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
