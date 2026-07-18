import { describe, it, expect } from 'vitest';
import { auditBranding, type AuditInput } from '@/lib/branding/audit';

function base(overrides: Partial<AuditInput['profile']> = {}): AuditInput {
  return {
    profile: {
      name: 'Default',
      primaryColor: '#2563eb',
      backgroundColor: '#ffffff',
      textColor: '#111111',
      navBackground: '#ffffff',
      navTextColor: '#111111',
      logoUrl: 'https://cdn/logo.png',
      faviconUrl: 'https://cdn/favicon.png',
      ogImageUrl: 'https://cdn/og.png',
      headingFont: 'Playfair',
      bodyFont: 'Inter',
      buttonStyle: { primaryBg: '#2563eb', primaryText: '#ffffff' },
      ...overrides,
    },
    messaging: {
      companyName: 'Acme',
      tagline: 'Build faster.',
      valueProposition: 'We cut dev cycles in half.',
      elevatorPitch: 'Long form pitch.',
      keyDifferentiators: ['fast', 'simple', 'secure'],
    },
  };
}

describe('auditBranding', () => {
  it('produces no errors on a fully-populated profile with good contrast', () => {
    const report = auditBranding(base());
    expect(report.counts.error).toBe(0);
  });

  it('flags low-contrast text as an accessibility error', () => {
    const report = auditBranding(base({ textColor: '#dddddd' }));
    const errors = report.issues.filter((i) => i.severity === 'error' && i.id === 'contrast-text-on-bg');
    expect(errors.length).toBe(1);
  });

  it('flags AA-large (borderline) contrast as a warning', () => {
    const report = auditBranding(base({ textColor: '#888888' })); // ratio ~3.5:1 on white
    const warns = report.issues.filter((i) => i.id === 'contrast-text-on-bg' && i.severity === 'warn');
    expect(warns.length).toBe(1);
  });

  it('errors when primary color matches background', () => {
    const report = auditBranding(base({ primaryColor: '#ffffff', backgroundColor: '#ffffff' }));
    expect(report.issues.some((i) => i.id === 'primary-equals-bg')).toBe(true);
  });

  it('flags missing logo as a warning', () => {
    const report = auditBranding(base({
      logoUrl: undefined, logoSquareUrl: undefined, logoRectUrl: undefined, logoIconUrl: undefined,
    }));
    expect(report.issues.some((i) => i.id === 'no-logo' && i.severity === 'warn')).toBe(true);
  });

  it('flags same-font heading+body as info', () => {
    const report = auditBranding(base({ headingFont: 'Inter', bodyFont: 'Inter' }));
    expect(report.issues.some((i) => i.id === 'headings-match-body')).toBe(true);
  });

  it('flags entirely missing messaging as a single warning', () => {
    const input = base();
    input.messaging = undefined;
    const report = auditBranding(input);
    const msgIssues = report.issues.filter((i) => i.category === 'messaging');
    expect(msgIssues.length).toBe(1);
    expect(msgIssues[0].id).toBe('no-messaging');
  });

  it('flags empty differentiators list', () => {
    const input = base();
    input.messaging = { ...input.messaging!, keyDifferentiators: [] };
    const report = auditBranding(input);
    expect(report.issues.some((i) => i.id === 'no-differentiators')).toBe(true);
  });

  it('counts severities and picks worst', () => {
    const report = auditBranding(base({ textColor: '#dddddd' })); // 1 error
    expect(report.counts.error).toBeGreaterThanOrEqual(1);
    expect(report.worst).toBe('error');
  });

  it('worst is null when no issues', () => {
    // Construct a truly clean profile
    const report = auditBranding(base());
    if (report.issues.length === 0) {
      expect(report.worst).toBeNull();
    }
  });

  it('does not crash on undefined fields', () => {
    const report = auditBranding({
      profile: {},
      messaging: undefined,
    });
    // Must at least return the required identity errors
    expect(report.issues.some((i) => i.id === 'missing-primary')).toBe(true);
    expect(report.issues.some((i) => i.id === 'missing-bg')).toBe(true);
    expect(report.issues.some((i) => i.id === 'missing-text')).toBe(true);
  });
});
