import { describe, expect, it } from "vitest";
import { parseIssueLink } from "./links";

describe("parseIssueLink", () => {
  it("extracts ids from issue: hrefs", () => {
    expect(parseIssueLink("issue:attachments-core")).toBe("attachments-core");
    expect(parseIssueLink("https://example.com")).toBeNull();
    expect(parseIssueLink("foo.tsx")).toBeNull();
    expect(parseIssueLink(undefined)).toBeNull();
  });
});
