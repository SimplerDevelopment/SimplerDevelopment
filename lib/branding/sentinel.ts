/**
 * Brand sentinel system.
 *
 * A block style value like `"brand.primary"` is a SENTINEL — a placeholder that
 * resolves to the brand's CSS variable (`var(--brand-primary)`) at render time.
 * This lets blocks declare "use brand primary color" as a first-class value
 * instead of hard-coding a hex, so the block follows brand changes automatically.
 *
 * Format: `brand.<key>` where <key> is a known token below.
 * Anything that isn't a recognized sentinel passes through unchanged.
 */

export type BrandSentinelKind = 'color' | 'font' | 'radius' | 'text';

export interface BrandSentinelDef {
  /** sentinel value as stored on a block, e.g. "brand.primary" */
  sentinel: string;
  /** CSS variable emitted by brandingToCssVars */
  cssVar: string;
  /** human label shown in the editor pill */
  label: string;
  /** category — used to filter sentinels per field (color vs font vs radius) */
  kind: BrandSentinelKind;
}

export const BRAND_SENTINELS: BrandSentinelDef[] = [
  // Colors
  { sentinel: 'brand.primary', cssVar: '--brand-primary', label: 'Brand Primary', kind: 'color' },
  { sentinel: 'brand.secondary', cssVar: '--brand-secondary', label: 'Brand Secondary', kind: 'color' },
  { sentinel: 'brand.accent', cssVar: '--brand-accent', label: 'Brand Accent', kind: 'color' },
  { sentinel: 'brand.bg', cssVar: '--brand-bg', label: 'Brand Background', kind: 'color' },
  { sentinel: 'brand.text', cssVar: '--brand-text', label: 'Brand Text', kind: 'color' },
  { sentinel: 'brand.navBg', cssVar: '--brand-nav-bg', label: 'Brand Nav Background', kind: 'color' },
  { sentinel: 'brand.navText', cssVar: '--brand-nav-text', label: 'Brand Nav Text', kind: 'color' },
  { sentinel: 'brand.link', cssVar: '--brand-link-color', label: 'Brand Link', kind: 'color' },
  { sentinel: 'brand.linkHover', cssVar: '--brand-link-hover-color', label: 'Brand Link Hover', kind: 'color' },
  { sentinel: 'brand.btnPrimaryBg', cssVar: '--brand-btn-primary-bg', label: 'Button Primary BG', kind: 'color' },
  { sentinel: 'brand.btnPrimaryText', cssVar: '--brand-btn-primary-text', label: 'Button Primary Text', kind: 'color' },
  { sentinel: 'brand.btnSecondaryBg', cssVar: '--brand-btn-secondary-bg', label: 'Button Secondary BG', kind: 'color' },
  { sentinel: 'brand.btnSecondaryText', cssVar: '--brand-btn-secondary-text', label: 'Button Secondary Text', kind: 'color' },
  // Fonts
  { sentinel: 'brand.headingFont', cssVar: '--brand-heading-font', label: 'Brand Heading Font', kind: 'font' },
  { sentinel: 'brand.bodyFont', cssVar: '--brand-body-font', label: 'Brand Body Font', kind: 'font' },
  // Radius
  { sentinel: 'brand.radius', cssVar: '--brand-border-radius', label: 'Brand Radius', kind: 'radius' },
  { sentinel: 'brand.btnRadius', cssVar: '--brand-btn-border-radius', label: 'Brand Button Radius', kind: 'radius' },
];

const BY_SENTINEL: Record<string, BrandSentinelDef> = Object.fromEntries(
  BRAND_SENTINELS.map((s) => [s.sentinel, s]),
);

/** True if `value` is a recognized brand sentinel like "brand.primary". */
export function isBrandSentinel(value: unknown): value is string {
  return typeof value === 'string' && value in BY_SENTINEL;
}

/**
 * Resolve a value to its CSS-ready form.
 * - `"brand.primary"` → `"var(--brand-primary)"`
 * - `"#ff0000"` → `"#ff0000"` (unchanged)
 * - `undefined` → `undefined`
 *
 * For font sentinels, we return a CSS `var(...)` with a safe fallback because
 * `fontFamily` values are commonly used in quoted form.
 */
export function resolveBrandSentinel(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const def = BY_SENTINEL[value];
  if (!def) return value;
  if (def.kind === 'font') {
    return `var(${def.cssVar}, sans-serif)`;
  }
  return `var(${def.cssVar})`;
}

/** Return the human label for a sentinel value, or null if not a sentinel. */
export function getSentinelLabel(value: unknown): string | null {
  if (!isBrandSentinel(value)) return null;
  return BY_SENTINEL[value].label;
}

/** Get the sentinel definition, or null. */
export function getSentinelDef(value: unknown): BrandSentinelDef | null {
  if (!isBrandSentinel(value)) return null;
  return BY_SENTINEL[value];
}

/** List sentinels of a given kind for picker UIs. */
export function listSentinels(kind: BrandSentinelKind): BrandSentinelDef[] {
  return BRAND_SENTINELS.filter((s) => s.kind === kind);
}
