/**
 * Filename helpers shared by the viewer's download actions — the PDF export
 * (E8-S3) and the Download-source action (E8-S5) — so the slugging and
 * extension rules live in one tested place rather than being duplicated.
 */

/**
 * Slugs a document title into a safe filename stem (lowercase, alphanumerics
 * collapsed to dashes, no leading/trailing dashes), or `null` when there is
 * nothing usable — letting the caller fall back to a default stem.
 */
export function slugifyFilename(title: string): string | null {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : null;
}

/**
 * Ensures `name` ends in `ext` (case-insensitive), appending it when absent. A
 * blank name falls back to `default<ext>`. `ext` is the dotted extension, e.g.
 * `'.pdf'` or `'.json'`.
 */
export function ensureExtension(name: string, ext: string): string {
  const trimmed = name.trim();
  if (trimmed === '') {
    return `report${ext}`;
  }
  const pattern = new RegExp(`${ext.replace(/[.]/g, '\\$&')}$`, 'i');
  return pattern.test(trimmed) ? trimmed : `${trimmed}${ext}`;
}
