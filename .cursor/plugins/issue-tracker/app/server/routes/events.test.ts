import { describe, expect, it } from "vitest";
import { issueIdFromPath } from "./events.js";

describe("issueIdFromPath", () => {
  it("derives the id from a file inside an issue dir", () => {
    expect(issueIdFromPath("/issues", "/issues/add-auth/issue.json")).toBe(
      "add-auth",
    );
  });

  it("derives the id from any nested file", () => {
    expect(issueIdFromPath("/issues", "/issues/add-auth/chat.jsonl")).toBe(
      "add-auth",
    );
  });

  it("derives the id from the issue dir itself", () => {
    expect(issueIdFromPath("/issues", "/issues/add-auth")).toBe("add-auth");
  });

  it("returns null for the base dir and outside paths", () => {
    expect(issueIdFromPath("/issues", "/issues")).toBeNull();
    expect(issueIdFromPath("/issues", "/other/thing")).toBeNull();
  });
});
