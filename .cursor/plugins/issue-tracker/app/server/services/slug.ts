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

export function uniqueSlug(title: string, taken: Iterable<string>): string {
  const existing = new Set(taken);
  const base = slugify(title);
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}
