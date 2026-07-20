import { describe, expect, it } from "vitest";
import {
  emptySupportingDocDraft,
  formatSupportingDocRef,
  supportingDocDraftForMode,
  supportingDocDraftFromRef,
  supportingDocRefFromDraft,
  supportingDocsDraftFromIssue,
  supportingDocsEqual,
  supportingDocsFromDraft,
} from "./supporting-docs";

describe("formatSupportingDocRef", () => {
  it("formats attachment and workspace refs", () => {
    expect(
      formatSupportingDocRef({ type: "attachment", name: "vision.md" }),
    ).toBe("attachment:vision.md");
    expect(
      formatSupportingDocRef({ type: "workspace", path: "docs/vision.md" }),
    ).toBe("workspace:docs/vision.md");
  });
});

describe("supportingDocDraftFromRef / supportingDocRefFromDraft", () => {
  it("round-trips attachment and workspace refs", () => {
    const attachment = { type: "attachment" as const, name: "vision.md" };
    const workspace = { type: "workspace" as const, path: "docs/standards.md" };
    expect(supportingDocRefFromDraft(supportingDocDraftFromRef(attachment))).toEqual(
      attachment,
    );
    expect(supportingDocRefFromDraft(supportingDocDraftFromRef(workspace))).toEqual(
      workspace,
    );
    expect(supportingDocRefFromDraft(supportingDocDraftFromRef(undefined))).toBeUndefined();
  });

  it("treats blank attachment/workspace values as absent", () => {
    expect(
      supportingDocRefFromDraft({ mode: "attachment", name: "  " }),
    ).toBeUndefined();
    expect(
      supportingDocRefFromDraft({ mode: "workspace", path: "  " }),
    ).toBeUndefined();
    expect(supportingDocRefFromDraft(emptySupportingDocDraft())).toBeUndefined();
  });
});

describe("supportingDocDraftForMode", () => {
  it("returns a fresh draft without stale sibling fields", () => {
    expect(supportingDocDraftForMode("absent")).toEqual({ mode: "absent" });
    expect(supportingDocDraftForMode("attachment")).toEqual({
      mode: "attachment",
      name: "",
    });
    expect(supportingDocDraftForMode("workspace")).toEqual({
      mode: "workspace",
      path: "",
    });
  });
});

describe("supportingDocsFromDraft", () => {
  it("omits absent keys and returns null when all absent", () => {
    const draft = supportingDocsDraftFromIssue(undefined);
    expect(supportingDocsFromDraft(draft)).toBeNull();

    draft.vision = { mode: "attachment", name: "vision.md" };
    draft.codingStandards = {
      mode: "workspace",
      path: "testdata/supporting-docs/sample.md",
    };
    expect(supportingDocsFromDraft(draft)).toEqual({
      vision: { type: "attachment", name: "vision.md" },
      codingStandards: {
        type: "workspace",
        path: "testdata/supporting-docs/sample.md",
      },
    });
  });
});

describe("supportingDocsEqual", () => {
  it("treats undefined and null as equal empty", () => {
    expect(supportingDocsEqual(undefined, null)).toBe(true);
    expect(
      supportingDocsEqual(
        { vision: { type: "attachment", name: "a.md" } },
        { vision: { type: "attachment", name: "a.md" } },
      ),
    ).toBe(true);
    expect(
      supportingDocsEqual(
        { vision: { type: "attachment", name: "a.md" } },
        { vision: { type: "attachment", name: "b.md" } },
      ),
    ).toBe(false);
  });
});
