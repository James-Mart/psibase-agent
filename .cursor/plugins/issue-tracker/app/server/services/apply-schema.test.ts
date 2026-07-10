import { describe, expect, it } from "vitest";
import {
  flattenApplyDoc,
  parseApplyDoc,
  type DesiredIssue,
} from "./apply-schema";

// A representative doc covering every kind and every inferred relationship:
// two epics, root and stacked branches (nested to depth 2), commits, and an
// explicit blockedBy reference.
const doc = {
  project: {
    id: "my-project",
    title: "My Project",
    description: "Overview...",
    epics: [
      {
        id: "epic-billing",
        title: "Billing rework",
        description: "Cross-cutting invariants...",
        branches: [
          {
            id: "phase-0",
            title: "Extract tx cache",
            description: "Scope + approach.",
            commits: [
              {
                id: "p0-extract-module",
                title: "Extract tx-cache module",
                description: "What to do + how to verify.",
              },
            ],
            stacked: [
              {
                id: "phase-1",
                title: "Stats tables",
                blockedBy: ["phase-0b"],
                stacked: [
                  {
                    id: "phase-2",
                    title: "Deeper stack",
                  },
                ],
              },
            ],
          },
          {
            id: "phase-0b",
            title: "Parallel work",
          },
        ],
      },
      {
        id: "epic-empty",
        title: "Empty epic",
      },
    ],
  },
};

function byId(desired: DesiredIssue[]): Map<string, DesiredIssue> {
  return new Map(desired.map((issue) => [issue.id, issue]));
}

describe("parseApplyDoc", () => {
  it("accepts a well-formed doc", () => {
    const result = parseApplyDoc(doc);
    expect(result.ok).toBe(true);
  });

  it("rejects a missing project", () => {
    const result = parseApplyDoc({});
    expect(result).toEqual({
      ok: false,
      message: expect.stringContaining("project"),
    });
  });

  it("rejects a node missing its id", () => {
    const result = parseApplyDoc({
      project: { title: "No id" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("project.id");
  });

  it("rejects a non-kebab id", () => {
    const result = parseApplyDoc({
      project: { id: "Not A Slug", title: "Bad" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("kebab-case");
  });

  it("rejects an empty title", () => {
    const result = parseApplyDoc({
      project: { id: "p", title: "" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("title");
  });

  it("rejects unknown keys", () => {
    const result = parseApplyDoc({
      project: { id: "p", title: "P", bogus: 1 },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects duplicate ids across the doc", () => {
    const result = parseApplyDoc({
      project: {
        id: "dupe",
        title: "Root",
        epics: [{ id: "dupe", title: "Clash" }],
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('duplicate id "dupe"');
  });

  it("detects a duplicate id nested deep in the tree", () => {
    const result = parseApplyDoc({
      project: {
        id: "p",
        title: "P",
        epics: [
          {
            id: "e",
            title: "E",
            branches: [
              {
                id: "b",
                title: "B",
                commits: [{ id: "b", title: "collides with branch" }],
              },
            ],
          },
        ],
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('duplicate id "b"');
  });
});

describe("flattenApplyDoc", () => {
  const result = parseApplyDoc(doc);
  if (!result.ok) throw new Error(`fixture doc should parse: ${result.message}`);
  const desired = flattenApplyDoc(result.doc);
  const map = byId(desired);

  it("emits every node exactly once", () => {
    expect(desired.map((issue) => issue.id).sort()).toEqual(
      [
        "my-project",
        "epic-billing",
        "epic-empty",
        "phase-0",
        "phase-0b",
        "phase-1",
        "phase-2",
        "p0-extract-module",
      ].sort(),
    );
  });

  it("infers kind from the child key", () => {
    expect(map.get("my-project")?.kind).toBe("project");
    expect(map.get("epic-billing")?.kind).toBe("epic");
    expect(map.get("phase-0")?.kind).toBe("branch");
    expect(map.get("p0-extract-module")?.kind).toBe("commit");
  });

  it("leaves the project without a partOf", () => {
    const project = map.get("my-project");
    expect(project && "partOf" in project).toBe(false);
  });

  it("infers partOf from the enclosing container", () => {
    const epic = map.get("epic-billing");
    const branch = map.get("phase-0");
    const commit = map.get("p0-extract-module");
    expect(epic && "partOf" in epic && epic.partOf).toBe("my-project");
    expect(branch && "partOf" in branch && branch.partOf).toBe("epic-billing");
    expect(commit && "partOf" in commit && commit.partOf).toBe("phase-0");
  });

  it("keeps a stacked branch in its epic and records the fork point", () => {
    const stacked = map.get("phase-1");
    if (!stacked || stacked.kind !== "branch") throw new Error("missing branch");
    expect(stacked.partOf).toBe("epic-billing");
    expect(stacked.stackedOn).toBe("phase-0");
  });

  it("infers stackedOn through nested stacking", () => {
    const deep = map.get("phase-2");
    if (!deep || deep.kind !== "branch") throw new Error("missing branch");
    expect(deep.partOf).toBe("epic-billing");
    expect(deep.stackedOn).toBe("phase-1");
  });

  it("leaves a root branch without a stackedOn", () => {
    const root = map.get("phase-0");
    if (!root || root.kind !== "branch") throw new Error("missing branch");
    expect(root.stackedOn).toBeUndefined();
  });

  it("carries blockedBy verbatim and defaults it to []", () => {
    const withBlock = map.get("phase-1");
    const withoutBlock = map.get("phase-0");
    if (withBlock?.kind !== "branch" || withoutBlock?.kind !== "branch") {
      throw new Error("missing branch");
    }
    expect(withBlock.blockedBy).toEqual(["phase-0b"]);
    expect(withoutBlock.blockedBy).toEqual([]);
  });

  it("carries descriptions and omits them when absent", () => {
    expect(map.get("my-project")?.description).toBe("Overview...");
    expect(map.get("phase-0b")?.description).toBeUndefined();
  });
});
