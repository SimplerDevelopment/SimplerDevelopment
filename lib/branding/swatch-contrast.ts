/**
 * PUX-189 (design doc screen 48): contrast as a pill on the swatch it is
 * about. Uses the same pairs and grader the brand audit runs
 * (defaultContrastPairs + analyzeContrast), so a swatch's pill and the audit
 * never disagree. A swatch that no default pair involves gets no pill.
 */
import { analyzeContrast, defaultContrastPairs, type ContrastGrade } from './contrast';

export type SwatchPill = { grade: ContrastGrade; ratio: number; tone: 'ok' | 'warn' | 'fail' };

export const SWATCH_KEYS = ['primaryColor', 'secondaryColor', 'accentColor', 'backgroundColor', 'textColor', 'navBackground', 'navTextColor'] as const;

export function swatchPills(profile: Parameters<typeof defaultContrastPairs>[0] & Partial<Record<(typeof SWATCH_KEYS)[number], string>>): Partial<Record<(typeof SWATCH_KEYS)[number], SwatchPill>> {
  const out: Partial<Record<(typeof SWATCH_KEYS)[number], SwatchPill>> = {};
  const pairs = defaultContrastPairs(profile);
  for (const key of SWATCH_KEYS) {
    const v = profile[key];
    if (!v) continue;
    let worst: SwatchPill | null = null;
    for (const p of pairs) {
      if (p.fg !== v && p.bg !== v) continue;
      const r = analyzeContrast(p.fg, p.bg);
      if (!worst || r.ratio < worst.ratio) {
        worst = { grade: r.normalText, ratio: r.ratio, tone: r.passesAA ? 'ok' : r.normalText === 'AA-large' ? 'warn' : 'fail' };
      }
    }
    if (worst) out[key] = worst;
  }
  return out;
}
