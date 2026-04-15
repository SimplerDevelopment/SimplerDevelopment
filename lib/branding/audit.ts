/**
 * Pure branding-profile auditor.
 *
 * Inspects a resolved branding profile + optional messaging and returns a
 * structured list of issues that a user should address. Rule-based: no AI,
 * no DB — fast, deterministic, testable.
 *
 * An AI-assisted tone-vs-personality consistency pass is layered on top
 * in the API route when the caller opts into it.
 */

import { analyzeContrast, defaultContrastPairs } from './contrast';
import type { BrandMessagingContext } from './block-defaults';

export type AuditSeverity = 'error' | 'warn' | 'info';

export type AuditCategory =
  | 'accessibility'
  | 'messaging'
  | 'identity'
  | 'assets'
  | 'typography'
  | 'consistency';

export interface AuditIssue {
  id: string;
  severity: AuditSeverity;
  category: AuditCategory;
  message: string;
  /** Optional actionable suggestion the user can follow. */
  suggestion?: string;
  /** Optional related field(s) for UI jump-to behavior. */
  field?: string;
}

export interface AuditInput {
  profile: {
    name?: string;
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    backgroundColor?: string;
    textColor?: string;
    navBackground?: string;
    navTextColor?: string;
    linkColor?: string;
    headingFont?: string;
    bodyFont?: string;
    logoUrl?: string;
    logoSquareUrl?: string;
    logoRectUrl?: string;
    logoIconUrl?: string;
    faviconUrl?: string;
    ogImageUrl?: string;
    buttonStyle?: { primaryBg?: string; primaryText?: string } | null;
  };
  messaging?: BrandMessagingContext;
}

export interface AuditReport {
  issues: AuditIssue[];
  /** Count of issues at each severity — handy for the UI summary badge. */
  counts: Record<AuditSeverity, number>;
  /** Highest severity encountered; null if no issues. */
  worst: AuditSeverity | null;
}

function issue(
  id: string,
  severity: AuditSeverity,
  category: AuditCategory,
  message: string,
  opts?: { suggestion?: string; field?: string },
): AuditIssue {
  return { id, severity, category, message, ...opts };
}

export function auditBranding(input: AuditInput): AuditReport {
  const { profile, messaging } = input;
  const issues: AuditIssue[] = [];

  // ─── Accessibility (contrast) ─────────────────────────────────────────────
  const pairs = defaultContrastPairs(profile);
  for (const p of pairs) {
    if (!p.fg || !p.bg) continue;
    const r = analyzeContrast(p.fg, p.bg);
    if (r.normalText === 'fail') {
      issues.push(issue(
        `contrast-${p.id}`,
        'error',
        'accessibility',
        `${p.label} fails WCAG AA for normal text (ratio ${r.ratio}:1)`,
        { suggestion: 'Darken or lighten one of the two colors to reach at least 4.5:1 contrast.', field: p.id },
      ));
    } else if (r.normalText === 'AA-large') {
      issues.push(issue(
        `contrast-${p.id}`,
        'warn',
        'accessibility',
        `${p.label} only passes AA for large text (ratio ${r.ratio}:1)`,
        { suggestion: 'Increase contrast to 4.5:1 to pass AA for body text.', field: p.id },
      ));
    }
  }

  // ─── Identity (required core fields) ──────────────────────────────────────
  if (!profile.primaryColor) {
    issues.push(issue('missing-primary', 'error', 'identity', 'No primary color set', { field: 'primaryColor' }));
  }
  if (!profile.backgroundColor) {
    issues.push(issue('missing-bg', 'error', 'identity', 'No background color set', { field: 'backgroundColor' }));
  }
  if (!profile.textColor) {
    issues.push(issue('missing-text', 'error', 'identity', 'No text color set', { field: 'textColor' }));
  }
  if (profile.primaryColor && profile.backgroundColor && profile.primaryColor.toLowerCase() === profile.backgroundColor.toLowerCase()) {
    issues.push(issue(
      'primary-equals-bg',
      'error',
      'accessibility',
      'Primary color matches background — primary elements will be invisible',
      { suggestion: 'Choose a primary color that contrasts with the background.' },
    ));
  }

  // ─── Assets ───────────────────────────────────────────────────────────────
  const hasAnyLogo = !!(profile.logoUrl || profile.logoSquareUrl || profile.logoRectUrl || profile.logoIconUrl);
  if (!hasAnyLogo) {
    issues.push(issue('no-logo', 'warn', 'assets', 'No logo uploaded', {
      suggestion: 'Add at least one logo (square, rectangle, or icon) so the brand shows up in site headers and emails.',
      field: 'logoUrl',
    }));
  }
  if (!profile.faviconUrl) {
    issues.push(issue('no-favicon', 'info', 'assets', 'No favicon uploaded', {
      suggestion: 'A 32×32 or 48×48 favicon appears in browser tabs and bookmarks.',
      field: 'faviconUrl',
    }));
  }
  if (!profile.ogImageUrl) {
    issues.push(issue('no-og-image', 'info', 'assets', 'No social share image set', {
      suggestion: 'A 1200×630 Open Graph image controls how pages preview on social media.',
      field: 'ogImageUrl',
    }));
  }

  // ─── Typography ───────────────────────────────────────────────────────────
  if (profile.headingFont && profile.bodyFont && profile.headingFont === profile.bodyFont) {
    issues.push(issue(
      'headings-match-body',
      'info',
      'typography',
      'Heading and body use the same font',
      { suggestion: 'Pair a distinctive heading font with a neutral body font for stronger visual hierarchy.' },
    ));
  }

  // ─── Messaging completeness ───────────────────────────────────────────────
  if (!messaging) {
    issues.push(issue('no-messaging', 'warn', 'messaging', 'No brand messaging configured', {
      suggestion: 'Add messaging (tagline, value prop, elevator pitch) so blocks can pre-fill with on-brand copy.',
    }));
  } else {
    if (!messaging.companyName) {
      issues.push(issue('no-company-name', 'warn', 'messaging', 'Missing company name', { field: 'companyName' }));
    }
    if (!messaging.tagline) {
      issues.push(issue('no-tagline', 'info', 'messaging', 'Missing tagline', {
        suggestion: 'A one-line tagline is used for hero sections and browser titles.',
        field: 'tagline',
      }));
    }
    if (!messaging.valueProposition) {
      issues.push(issue('no-value-prop', 'info', 'messaging', 'Missing value proposition', { field: 'valueProposition' }));
    }
    if (!messaging.elevatorPitch) {
      issues.push(issue('no-elevator-pitch', 'info', 'messaging', 'Missing elevator pitch', { field: 'elevatorPitch' }));
    }
    const diffs = messaging.keyDifferentiators;
    if (!diffs || diffs.length === 0) {
      issues.push(issue('no-differentiators', 'info', 'messaging', 'No key differentiators listed', {
        suggestion: 'List 3–5 concrete differentiators to feed into on-brand block copy and AI-generated content.',
        field: 'keyDifferentiators',
      }));
    }
  }

  // ─── Counts + summary ─────────────────────────────────────────────────────
  const counts = { error: 0, warn: 0, info: 0 } as Record<AuditSeverity, number>;
  for (const i of issues) counts[i.severity]++;
  const worst: AuditSeverity | null = counts.error ? 'error' : counts.warn ? 'warn' : counts.info ? 'info' : null;

  return { issues, counts, worst };
}
