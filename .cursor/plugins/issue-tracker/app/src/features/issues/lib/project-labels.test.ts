import { describe, expect, it } from "vitest";
import {
  catalogDraftsFromIssue,
  catalogLabelsEqual,
  labelChipTextColor,
  normalizeCatalogLabel,
  planCatalogLabelsSave,
  validateCatalogDraft,
  validateCatalogDrafts,
} from "./project-labels";

describe("normalizeCatalogLabel", () => {
  it("omits empty description", () => {
    expect(
      normalizeCatalogLabel({
        key: "k",
        originalId: "bug",
        id: " bug ",
        color: " #ff0000 ",
        description: "  ",
      }),
    ).toEqual({ id: "bug", color: "#ff0000" });
  });

  it("keeps a non-empty description", () => {
    expect(
      normalizeCatalogLabel({
        key: "k",
        originalId: null,
        id: "feat",
        color: "#00ff00",
        description: " Features ",
      }),
    ).toEqual({ id: "feat", color: "#00ff00", description: "Features" });
  });
});

describe("validateCatalogDraft", () => {
  it("rejects invalid color", () => {
    expect(
      validateCatalogDraft({
        key: "k",
        originalId: null,
        id: "bug",
        color: "#fff",
        description: "",
      }),
    ).toMatch(/#RRGGBB/);
  });

  it("rejects non-kebab id", () => {
    expect(
      validateCatalogDraft({
        key: "k",
        originalId: null,
        id: "Bug Label",
        color: "#ff0000",
        description: "",
      }),
    ).toMatch(/kebab-case/);
  });

  it("rejects description over 120 chars", () => {
    expect(
      validateCatalogDraft({
        key: "k",
        originalId: null,
        id: "bug",
        color: "#ff0000",
        description: "x".repeat(121),
      }),
    ).toMatch(/120/);
  });
});

describe("validateCatalogDrafts", () => {
  it("rejects duplicate ids", () => {
    expect(
      validateCatalogDrafts([
        {
          key: "a",
          originalId: "bug",
          id: "bug",
          color: "#ff0000",
          description: "",
        },
        {
          key: "b",
          originalId: null,
          id: "bug",
          color: "#00ff00",
          description: "",
        },
      ]),
    ).toMatch(/Duplicate/);
  });
});

describe("catalogDraftsFromIssue / catalogLabelsEqual", () => {
  it("round-trips catalog entries", () => {
    const labels = [
      { id: "bug", color: "#ff0000", description: "Defects" },
      { id: "feat", color: "#00ff00" },
    ];
    const drafts = catalogDraftsFromIssue(labels);
    expect(drafts.map(normalizeCatalogLabel)).toEqual(labels);
    expect(catalogLabelsEqual(labels, labels)).toBe(true);
    expect(catalogLabelsEqual(undefined, [])).toBe(true);
  });
});

describe("labelChipTextColor", () => {
  it("uses dark text on light backgrounds", () => {
    expect(labelChipTextColor("#eeeeee")).toBe("#111827");
  });

  it("uses light text on dark backgrounds", () => {
    expect(labelChipTextColor("#111111")).toBe("#ffffff");
  });
});

describe("planCatalogLabelsSave", () => {
  it("returns null finalLabels when unchanged", () => {
    const labels = [{ id: "bug", color: "#ff0000" }];
    const result = planCatalogLabelsSave(labels, catalogDraftsFromIssue(labels));
    expect(result).toEqual({
      ok: true,
      plan: { stagingPatches: [], finalLabels: null },
    });
  });

  it("puts a single rename in finalLabels with no staging", () => {
    const persisted = [
      { id: "bug", color: "#ff0000" },
      { id: "feat", color: "#00ff00" },
    ];
    const drafts = catalogDraftsFromIssue(persisted);
    drafts[0] = { ...drafts[0], id: "defect", color: "#0000ff" };
    const result = planCatalogLabelsSave(persisted, drafts);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.stagingPatches).toEqual([]);
    expect(result.plan.finalLabels).toEqual([
      { id: "defect", color: "#0000ff" },
      { id: "feat", color: "#00ff00" },
    ]);
  });

  it("stages a single rename before an add so assignment rewrite can fire", () => {
    const persisted = [
      { id: "bug", color: "#ff0000" },
      { id: "feat", color: "#00ff00" },
    ];
    const drafts = [
      { ...catalogDraftsFromIssue(persisted)[0], id: "defect", color: "#111111" },
      catalogDraftsFromIssue(persisted)[1],
      {
        key: "new-1",
        originalId: null,
        id: "chore",
        color: "#0000ff",
        description: "",
      },
    ];
    const result = planCatalogLabelsSave(persisted, drafts);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.stagingPatches).toEqual([
      [
        { id: "defect", color: "#111111" },
        { id: "feat", color: "#00ff00" },
      ],
    ]);
    expect(result.plan.finalLabels).toEqual([
      { id: "defect", color: "#111111" },
      { id: "feat", color: "#00ff00" },
      { id: "chore", color: "#0000ff" },
    ]);
  });

  it("stages a single rename before a remove", () => {
    const persisted = [
      { id: "bug", color: "#ff0000" },
      { id: "feat", color: "#00ff00" },
    ];
    const drafts = [
      { ...catalogDraftsFromIssue(persisted)[0], id: "defect" },
    ];
    const result = planCatalogLabelsSave(persisted, drafts);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.stagingPatches).toEqual([
      [
        { id: "defect", color: "#ff0000" },
        { id: "feat", color: "#00ff00" },
      ],
    ]);
    expect(result.plan.finalLabels).toEqual([{ id: "defect", color: "#ff0000" }]);
  });

  it("stages multi-renames with draft color/description and skips final when done", () => {
    const persisted = [
      { id: "bug", color: "#ff0000", description: "old" },
      { id: "feat", color: "#00ff00" },
    ];
    const drafts = catalogDraftsFromIssue(persisted);
    drafts[0] = {
      ...drafts[0],
      id: "defect",
      color: "#111111",
      description: "new",
    };
    drafts[1] = { ...drafts[1], id: "feature", color: "#222222" };
    const result = planCatalogLabelsSave(persisted, drafts);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.stagingPatches).toEqual([
      [
        { id: "defect", color: "#111111", description: "new" },
        { id: "feat", color: "#00ff00" },
      ],
      [
        { id: "defect", color: "#111111", description: "new" },
        { id: "feature", color: "#222222" },
      ],
    ]);
    expect(result.plan.finalLabels).toBeNull();
  });

  it("keeps a finalLabels patch after multi-rename when adds remain", () => {
    const persisted = [
      { id: "bug", color: "#ff0000" },
      { id: "feat", color: "#00ff00" },
    ];
    const drafts = [
      ...catalogDraftsFromIssue(persisted).map((draft, i) =>
        i === 0
          ? { ...draft, id: "defect" }
          : { ...draft, id: "feature" },
      ),
      {
        key: "new-1",
        originalId: null,
        id: "chore",
        color: "#0000ff",
        description: "",
      },
    ];
    const result = planCatalogLabelsSave(persisted, drafts);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.stagingPatches).toHaveLength(2);
    expect(result.plan.finalLabels).toEqual([
      { id: "defect", color: "#ff0000" },
      { id: "feature", color: "#00ff00" },
      { id: "chore", color: "#0000ff" },
    ]);
  });

  it("returns validation errors", () => {
    const result = planCatalogLabelsSave([], [
      {
        key: "k",
        originalId: null,
        id: "bug",
        color: "#fff",
        description: "",
      },
    ]);
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/#RRGGBB/) });
  });
});
