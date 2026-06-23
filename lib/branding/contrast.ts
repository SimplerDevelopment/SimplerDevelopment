/**
 * WCAG 2.1 color contrast utilities.
 *
 * Pure — no DOM, no DB, safe to call from anywhere.
 * Reference: https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export type ContrastGrade = 'AAA' | 'AA' | 'AA-large' | 'fail';

export interface ContrastResult {
  /** Contrast ratio, 1–21. */
  ratio: number;
  /** Best grade this pair clears for normal text. */
  normalText: ContrastGrade;
  /** Best grade this pair clears for large text (18pt+ or 14pt+ bold). */
  largeText: ContrastGrade;
  /** Does this pass WCAG AA for normal text (≥ 4.5)? */
  passesAA: boolean;
  /** Does this pass WCAG AAA for normal text (≥ 7.0)? */
  passesAAA: boolean;
}

/** Parse a CSS color string (#rgb, #rrggbb, #rrggbbaa, rgb(), rgba()) → Rgb. Returns null on failure. */
export function parseColor(color: string | undefined | null): Rgb | null {
  if (!color) return null;
  const s = color.trim();

  // Hex
  if (s.startsWith('#')) {
    let hex = s.slice(1);
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    } else if (hex.length === 4) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    } else if (hex.length === 8) {
      hex = hex.slice(0, 6);
    }
    if (hex.length !== 6 || !/^[0-9a-f]{6}$/i.test(hex)) return null;
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }

  // rgb(r,g,b) / rgba(r,g,b,a)
  const m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) {
    return { r: +m[1], g: +m[2], b: +m[3] };
  }

  return null;
}

/** Relative luminance per WCAG formula. Input Rgb channels are 0–255. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** Contrast ratio between two colors, 1.0–21.0. Returns NaN if either color is unparseable. */
export function contrastRatio(fg: string | undefined | null, bg: string | undefined | null): number {
  const f = parseColor(fg);
  const b = parseColor(bg);
  if (!f || !b) return NaN;
  const lf = relativeLuminance(f);
  const lb = relativeLuminance(b);
  const brighter = Math.max(lf, lb);
  const darker = Math.min(lf, lb);
  return (brighter + 0.05) / (darker + 0.05);
}

/** Grade a ratio for normal text per WCAG. */
export function gradeNormalText(ratio: number): ContrastGrade {
  if (!isFinite(ratio)) return 'fail';
  if (ratio >= 7.0) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3.0) return 'AA-large';
  return 'fail';
}

/** Grade a ratio for large text (18pt+ or 14pt+ bold) per WCAG. */
export function gradeLargeText(ratio: number): ContrastGrade {
  if (!isFinite(ratio)) return 'fail';
  if (ratio >= 4.5) return 'AAA';
  if (ratio >= 3.0) return 'AA';
  return 'fail';
}

/** Full contrast report between two colors. */
export function analyzeContrast(
  fg: string | undefined | null,
  bg: string | undefined | null,
): ContrastResult {
  const ratio = contrastRatio(fg, bg);
  return {
    ratio: isFinite(ratio) ? Math.round(ratio * 100) / 100 : 0,
    normalText: gradeNormalText(ratio),
    largeText: gradeLargeText(ratio),
    passesAA: ratio >= 4.5,
    passesAAA: ratio >= 7.0,
  };
}

/** Describes a color pair that should be audited together in the UI. */
export interface ContrastPair {
  id: string;
  label: string;
  /** Human description of where this pair applies. */
  context: string;
  fg: string | undefined | null;
  bg: string | undefined | null;
}

/**
 * The default audit set for a branding profile — these are the pairs that
 * actually matter for accessibility at the page level.
 */
export function defaultContrastPairs(branding: {
  primaryColor?: string;
  textColor?: string;
  backgroundColor?: string;
  navBackground?: string;
  navTextColor?: string;
  linkColor?: string;
  buttonStyle?: { primaryBg?: string; primaryText?: string } | null;
}): ContrastPair[] {
  const btnBg = branding.buttonStyle?.primaryBg;
  const btnText = branding.buttonStyle?.primaryText;
  return [
    {
      id: 'text-on-bg',
      label: 'Body text',
      context: 'text on background',
      fg: branding.textColor,
      bg: branding.backgroundColor,
    },
    {
      id: 'primary-on-bg',
      label: 'Primary accent',
      context: 'primary color on background',
      fg: branding.primaryColor,
      bg: branding.backgroundColor,
    },
    {
      id: 'nav-text-on-nav-bg',
      label: 'Nav text',
      context: 'nav text on nav background',
      fg: branding.navTextColor,
      bg: branding.navBackground,
    },
    {
      id: 'btn-text-on-btn-bg',
      label: 'Primary button',
      context: 'button text on button background',
      fg: btnText,
      bg: btnBg,
    },
    {
      id: 'link-on-bg',
      label: 'Link',
      context: 'link color on background',
      fg: branding.linkColor,
      bg: branding.backgroundColor,
    },
  ];
}
