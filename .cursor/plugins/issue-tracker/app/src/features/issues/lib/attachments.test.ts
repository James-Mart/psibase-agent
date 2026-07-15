import { describe, expect, it } from "vitest";
import {
  attachmentsApiPath,
  formatAttachmentSize,
  supportsAttachments,
} from "./attachments";

describe("supportsAttachments", () => {
  it("hides the panel for Project and shows it for other kinds", () => {
    expect(supportsAttachments("project")).toBe(false);
    expect(supportsAttachments("epic")).toBe(true);
    expect(supportsAttachments("branch")).toBe(true);
    expect(supportsAttachments("commit")).toBe(true);
  });
});

describe("formatAttachmentSize", () => {
  it("formats bytes, KB, and MB", () => {
    expect(formatAttachmentSize(0)).toBe("0 B");
    expect(formatAttachmentSize(512)).toBe("512 B");
    expect(formatAttachmentSize(1536)).toBe("1.5 KB");
    expect(formatAttachmentSize(10 * 1024)).toBe("10 KB");
    expect(formatAttachmentSize(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });
});

describe("attachmentsApiPath", () => {
  it("builds collection and item paths with consistent encoding", () => {
    expect(attachmentsApiPath("c1")).toBe("/api/issues/c1/attachments");
    expect(attachmentsApiPath("c1", "mock.tsx")).toBe(
      "/api/issues/c1/attachments/mock.tsx",
    );
    expect(attachmentsApiPath("c1", "a b.png")).toBe(
      "/api/issues/c1/attachments/a%20b.png",
    );
  });
});
