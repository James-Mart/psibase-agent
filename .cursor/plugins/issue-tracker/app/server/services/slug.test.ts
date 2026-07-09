import { describe, expect, it } from "vitest";
import { slugify, uniqueSlug } from "./slug";

describe("slugify", () => {
  it("lowercases and hyphenates words", () => {
    expect(slugify("Add auth endpoints")).toBe("add-auth-endpoints");
  });

  it("strips punctuation and collapses separators", () => {
    expect(slugify("  Fix: the (login)  bug!! ")).toBe("fix-the-login-bug");
  });

  it("is stable for an already-slugged title", () => {
    expect(slugify("add-auth")).toBe("add-auth");
  });

  it("falls back to a placeholder when nothing usable remains", () => {
    expect(slugify("!!!")).toBe("issue");
  });
});

describe("uniqueSlug", () => {
  it("returns the base slug when free", () => {
    expect(uniqueSlug("Add auth", [])).toBe("add-auth");
  });

  it("suffixes numerically on collision", () => {
    expect(uniqueSlug("Add auth", ["add-auth"])).toBe("add-auth-2");
  });

  it("increments past consecutive collisions", () => {
    expect(uniqueSlug("Add auth", ["add-auth", "add-auth-2"])).toBe(
      "add-auth-3",
    );
  });

  it("skips gaps to the first free suffix", () => {
    expect(uniqueSlug("Add auth", ["add-auth", "add-auth-3"])).toBe(
      "add-auth-2",
    );
  });
});
