// Canonical slugifier for the whole app. Lowercase, ascii-ish, hyphens for
// non-alphanumeric runs, no leading/trailing hyphens. maxLength defaults to 100
// (publishing_campaigns.slug width); pass 63 for DNS subdomains, etc.

export function slugify(input: string, maxLength = 100): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength);
}
