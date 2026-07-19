// Slug-safe = the shape `slugify()` produces: lowercase alphanumerics in
// hyphen-separated groups, no leading/trailing/doubled hyphen. Kept here so
// auto-slugs and any author-chosen ids validate against one source of truth.
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isSlugSafe(value: string): boolean {
  return SLUG_RE.test(value);
}

export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "issue";
}

/** Prefer `base+suffix`; on collision use `{base}-{n}{suffix}` (smallest n ≥ 2). */
export function firstFreeSuffixedName(
  base: string,
  suffix: string,
  taken: Iterable<string>,
): string {
  const existing = taken instanceof Set ? taken : new Set(taken);
  const preferred = `${base}${suffix}`;
  if (!existing.has(preferred)) return preferred;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}${suffix}`;
    if (!existing.has(candidate)) return candidate;
  }
}

export function uniqueSlug(title: string, taken: Iterable<string>): string {
  return firstFreeSuffixedName(slugify(title), "", taken);
}
