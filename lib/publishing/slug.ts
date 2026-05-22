// Stable slugifier for publishing campaigns + tags. Lowercase, ascii-ish,
// hyphens for non-alphanumeric runs, no leading/trailing hyphens, capped at
// 100 chars (matches the column width on publishing_campaigns.slug).

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}
