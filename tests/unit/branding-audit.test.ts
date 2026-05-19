// @vitest-environment node
/**
 * Unit tests for `auditBranding` in lib/branding/audit.ts.
 *
 * Pure rule-based auditor — no DB, no AI, no DOM. Tests exercise every
 * category branch (accessibility, identity, assets, typography, messaging,
 * consistency) plus the severity/counts/worst summary.
 */
import { describe, it, expect } from 'vitest';
import { auditBranding, type AuditInput } from '@/lib/branding/audit';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** A profile with zero issues: high-contrast colors, all logos/favicon/og, distinct fonts. */
function cleanProfile(): AuditInput['profile'] {
  return {
    name: 'Acme',
    primaryColor: '#000000',
    secondaryColor: '#222222',
    accentColor: '#444444',
    backgroundColor: '#ffffff',
    textColor: '#111111',
    navBackground: '#ffffff',
    navTextColor: '#111111',
    linkColor: '#0000cc',
    headingFont: 'Inter',
    bodyFont: 'Georgia',
    logoUrl: 'https://cdn.example.com/logo.png',
    logoSquareUrl: 'https://cdn.example.com/logo-sq.png',
    logoRectUrl: 'https://cdn.example.com/logo-rect.png',
    logoIconUrl: 'https://cdn.example.com/logo-icon.png',
    faviconUrl: 'https://cdn.example.com/fav.ico',
    ogImageUrl: 'https://cdn.example.com/og.png',
    buttonStyle: { primaryBg: '#000000', primaryText: '#ffffff' },
  };
}

function cleanMessaging() {
  return {
    companyName: 'Acme',
    tagline: 'We make things',
    valueProposition: 'Solid value',
    elevatorPitch: 'Our 30-second pitch.',
    keyDifferentiators: ['Fast', 'Friendly', 'Free trial'],
  };
}

function findIssue(issues: ReturnType<typeof auditBranding>['issues'], id: string) {
  return issues.find((i) => i.id === id);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('auditBranding — clean baseline', () => {
  it('returns no issues for a fully-configured high-contrast brand with messaging', () => {
    const report = auditBranding({ profile: cleanProfile(), messaging: cleanMessaging() });
    expect(report.issues).toEqual([]);
    expect(report.counts).toEqual({ error: 0, warn: 0, info: 0 });
    expect(report.worst).toBeNull();
  });
});

describe('auditBranding — identity (required core fields)', () => {
  it('flags missing primary color as error', () => {
    const profile = cleanProfile();
    profile.primaryColor = undefined;
    const report = auditBranding({ profile, messaging: cleanMessaging() });
    const found = findIssue(report.issues, 'missing-primary');
    expect(found).toBeDefined();
    expect(found?.severity).toBe('error');
    expect(found?.category).toBe('identity');
    expect(found?.field).toBe('primaryColor');
  });

  it('flags missing background color as error', () => {
    const profile = cleanProfile();
    profile.backgroundColor = undefined;
    const report = auditBranding({ profile, messaging: cleanMessaging() });
    const found = findIssue(report.issues, 'missing-bg');
    expect(found?.severity).toBe('error');
    expect(found?.field).toBe('backgroundColor');
  });

  it('flags missing text color as error', () => {
    const profile = cleanProfile();
    profile.textColor = undefined;
    const report = auditBranding({ profile, messaging: cleanMessaging() });
    const found = findIssue(report.issues, 'missing-text');
    expect(found?.severity).toBe('error');
    expect(found?.field).toBe('textColor');
  });

  it('flags primary-equals-background (case-insensitive) as accessibility error', () => {
    const profile = cleanProfile();
    profile.primaryColor = '#FFFFFF';
    profile.backgroundColor = '#ffffff';
    const report = auditBranding({ profile, messaging: cleanMessaging() });
    const found = findIssue(report.issues, 'primary-equals-bg');
    expect(found).toBeDefined();
    expect(found?.severity).toBe('error');
    expect(found?.category).toBe('accessibility');
  });

  it('does not flag primary-equals-bg when either color is missing', () => {
    const profile = cleanProfile();
    profile.primaryColor = undefined;
    profile.backgroundColor = '#fff';
    const report = auditBranding({ profile, messaging: cleanMessaging() });
    expect(findIssue(report.issues, 'primary-equals-bg')).toBeUndefined();
  });
});

describe('auditBranding — accessibility (contrast)', () => {
  it('flags failing body text contrast as error', () => {
    const profile = cleanProfile();
    // Yellow on white is well below WCAG AA for normal text.
    profile.textColor = '#ffff00';
    profile.backgroundColor = '#ffffff';
    const report = auditBranding({ profile, messaging: cleanMessaging() });
    const found = findIssue(report.issues, 'contrast-text-on-bg');
    expect(found).toBeDefined();
    expect(found?.severity).toBe('error');
    expect(found?.category).toBe('accessibility');
    expect(found?.field).toBe('text-on-bg');
    expect(found?.message).toMatch(/ratio/);
  });

  it('flags AA-large-only contrast as a warning', () => {
    const profile = cleanProfile();
    // Mid-grey on white lands in the AA-large band (between 3 and 4.5).
    profile.textColor = '#949494';
    profile.backgroundColor = '#ffffff';
    const report = auditBranding({ profile, messaging: cleanMessaging() });
    const found = findIssue(report.issues, 'contrast-text-on-bg');
    expect(found).toBeDefined();
    expect(found?.severity).toBe('warn');
    expect(found?.message).toMatch(/large text/);
  });

  it('skips pairs where fg or bg is missing (no contrast issue emitted)', () => {
    const profile = cleanProfile();
    profile.navBackground = undefined;
    profile.navTextColor = undefined;
    profile.linkColor = undefined;
    profile.buttonStyle = null;
    const report = auditBranding({ profile, messaging: cleanMessaging() });
    expect(findIssue(report.issues, 'contrast-nav-text-on-nav-bg')).toBeUndefined();
    expect(findIssue(report.issues, 'contrast-link-on-bg')).toBeUndefined();
    expect(findIssue(report.issues, 'contrast-btn-text-on-btn-bg')).toBeUndefined();
  });

  it('flags failing nav contrast separately from body contrast', () => {
    const profile = cleanProfile();
    profile.navBackground = '#ffffff';
    profile.navTextColor = '#ffff00';
    const report = auditBranding({ profile, messaging: cleanMessaging() });
    const found = findIssue(report.issues, 'contrast-nav-text-on-nav-bg');
    expect(found).toBeDefined();
    expect(found?.severity).toBe('error');
  });
});

describe('auditBranding — assets', () => {
  it('flags no-logo as warn when every logo field is missing', () => {
    const profile = cleanProfile();
    profile.logoUrl = undefined;
    profile.logoSquareUrl = undefined;
    profile.logoRectUrl = undefined;
    profile.logoIconUrl = undefined;
    const report = auditBranding({ profile, messaging: cleanMessaging() });
    const found = findIssue(report.issues, 'no-logo');
    expect(found?.severity).toBe('warn');
    expect(found?.category).toBe('assets');
  });

  it('does NOT flag no-logo when only one of the four logo fields is set', () => {
    const profile = cleanProfile();
    profile.logoUrl = undefined;
    profile.logoSquareUrl = undefined;
    profile.logoRectUrl = undefined;
    // logoIconUrl still set
    const report = auditBranding({ profile, messaging: cleanMessaging() });
    expect(findIssue(report.issues, 'no-logo')).toBeUndefined();
  });

  it('flags missing favicon as info', () => {
    const profile = cleanProfile();
    profile.faviconUrl = undefined;
    const report = auditBranding({ profile, messaging: cleanMessaging() });
    const found = findIssue(report.issues, 'no-favicon');
    expect(found?.severity).toBe('info');
    expect(found?.field).toBe('faviconUrl');
  });

  it('flags missing OG image as info', () => {
    const profile = cleanProfile();
    profile.ogImageUrl = undefined;
    const report = auditBranding({ profile, messaging: cleanMessaging() });
    const found = findIssue(report.issues, 'no-og-image');
    expect(found?.severity).toBe('info');
    expect(found?.field).toBe('ogImageUrl');
  });
});

describe('auditBranding — typography', () => {
  it('flags identical heading and body fonts as info', () => {
    const profile = cleanProfile();
    profile.headingFont = 'Inter';
    profile.bodyFont = 'Inter';
    const report = auditBranding({ profile, messaging: cleanMessaging() });
    const found = findIssue(report.issues, 'headings-match-body');
    expect(found?.severity).toBe('info');
    expect(found?.category).toBe('typography');
  });

  it('does not flag typography when one of the fonts is missing', () => {
    const profile = cleanProfile();
    profile.headingFont = 'Inter';
    profile.bodyFont = undefined;
    const report = auditBranding({ profile, messaging: cleanMessaging() });
    expect(findIssue(report.issues, 'headings-match-body')).toBeUndefined();
  });
});

describe('auditBranding — messaging', () => {
  it('flags no-messaging when messaging is absent', () => {
    const report = auditBranding({ profile: cleanProfile() });
    const found = findIssue(report.issues, 'no-messaging');
    expect(found?.severity).toBe('warn');
    expect(found?.category).toBe('messaging');
    // Detailed messaging-field issues should NOT be emitted in this mode.
    expect(findIssue(report.issues, 'no-company-name')).toBeUndefined();
    expect(findIssue(report.issues, 'no-tagline')).toBeUndefined();
  });

  it('flags each missing messaging field with the expected severity', () => {
    const report = auditBranding({
      profile: cleanProfile(),
      messaging: {}, // all fields missing
    });
    expect(findIssue(report.issues, 'no-company-name')?.severity).toBe('warn');
    expect(findIssue(report.issues, 'no-tagline')?.severity).toBe('info');
    expect(findIssue(report.issues, 'no-value-prop')?.severity).toBe('info');
    expect(findIssue(report.issues, 'no-elevator-pitch')?.severity).toBe('info');
    expect(findIssue(report.issues, 'no-differentiators')?.severity).toBe('info');
  });

  it('flags empty keyDifferentiators array', () => {
    const report = auditBranding({
      profile: cleanProfile(),
      messaging: { ...cleanMessaging(), keyDifferentiators: [] },
    });
    const found = findIssue(report.issues, 'no-differentiators');
    expect(found).toBeDefined();
    expect(found?.field).toBe('keyDifferentiators');
  });

  it('clears messaging issues when all fields populated', () => {
    const report = auditBranding({ profile: cleanProfile(), messaging: cleanMessaging() });
    expect(findIssue(report.issues, 'no-company-name')).toBeUndefined();
    expect(findIssue(report.issues, 'no-tagline')).toBeUndefined();
    expect(findIssue(report.issues, 'no-value-prop')).toBeUndefined();
    expect(findIssue(report.issues, 'no-elevator-pitch')).toBeUndefined();
    expect(findIssue(report.issues, 'no-differentiators')).toBeUndefined();
  });
});

describe('auditBranding — tone-axis consistency', () => {
  it('flags formal+playful contradiction as consistency warning', () => {
    const report = auditBranding({
      profile: cleanProfile(),
      messaging: {
        ...cleanMessaging(),
        toneAxes: { formal: 0.8, playful: 0.8 },
      },
    });
    const found = findIssue(report.issues, 'tone-formal-vs-playful');
    expect(found).toBeDefined();
    expect(found?.severity).toBe('warn');
    expect(found?.category).toBe('consistency');
    expect(found?.field).toBe('toneAxes');
  });

  it('flags traditional+playful as consistency warning', () => {
    const report = auditBranding({
      profile: cleanProfile(),
      messaging: {
        ...cleanMessaging(),
        toneAxes: { traditional: 0.7, playful: 0.7 },
      },
    });
    const found = findIssue(report.issues, 'tone-traditional-vs-playful');
    expect(found?.severity).toBe('warn');
  });

  it('does not emit tone issues when toneAxes is absent', () => {
    const report = auditBranding({ profile: cleanProfile(), messaging: cleanMessaging() });
    expect(findIssue(report.issues, 'tone-formal-vs-playful')).toBeUndefined();
    expect(findIssue(report.issues, 'tone-traditional-vs-playful')).toBeUndefined();
  });

  it('does not emit tone issues for low axis values', () => {
    const report = auditBranding({
      profile: cleanProfile(),
      messaging: {
        ...cleanMessaging(),
        toneAxes: { formal: 0.3, playful: 0.3, traditional: 0.3 },
      },
    });
    expect(findIssue(report.issues, 'tone-formal-vs-playful')).toBeUndefined();
    expect(findIssue(report.issues, 'tone-traditional-vs-playful')).toBeUndefined();
  });
});

describe('auditBranding — counts and worst summary', () => {
  it('sets worst=error when any error is present', () => {
    const profile = cleanProfile();
    profile.primaryColor = undefined; // → error
    const report = auditBranding({ profile, messaging: cleanMessaging() });
    expect(report.worst).toBe('error');
    expect(report.counts.error).toBeGreaterThanOrEqual(1);
  });

  it('sets worst=warn when only warns/infos exist', () => {
    const profile = cleanProfile();
    profile.logoUrl = undefined;
    profile.logoSquareUrl = undefined;
    profile.logoRectUrl = undefined;
    profile.logoIconUrl = undefined; // → warn (no-logo)
    const report = auditBranding({ profile, messaging: cleanMessaging() });
    expect(report.worst).toBe('warn');
    expect(report.counts.error).toBe(0);
    expect(report.counts.warn).toBeGreaterThanOrEqual(1);
  });

  it('sets worst=info when only info-level issues exist', () => {
    const profile = cleanProfile();
    profile.faviconUrl = undefined; // → info
    const report = auditBranding({ profile, messaging: cleanMessaging() });
    expect(report.worst).toBe('info');
    expect(report.counts.error).toBe(0);
    expect(report.counts.warn).toBe(0);
    expect(report.counts.info).toBeGreaterThanOrEqual(1);
  });

  it('counts each severity correctly across mixed issues', () => {
    const profile = cleanProfile();
    profile.primaryColor = undefined;     // error
    profile.backgroundColor = undefined;  // error
    profile.logoUrl = undefined;
    profile.logoSquareUrl = undefined;
    profile.logoRectUrl = undefined;
    profile.logoIconUrl = undefined;      // warn
    profile.faviconUrl = undefined;       // info
    profile.ogImageUrl = undefined;       // info
    const report = auditBranding({ profile, messaging: cleanMessaging() });
    // Each severity should appear at least once and counts should equal the
    // number of issues of that severity in the issues array.
    const errs = report.issues.filter((i) => i.severity === 'error').length;
    const warns = report.issues.filter((i) => i.severity === 'warn').length;
    const infos = report.issues.filter((i) => i.severity === 'info').length;
    expect(report.counts.error).toBe(errs);
    expect(report.counts.warn).toBe(warns);
    expect(report.counts.info).toBe(infos);
    expect(report.worst).toBe('error');
  });
});

describe('auditBranding — issue shape', () => {
  it('every issue carries the required AuditIssue fields', () => {
    const profile = cleanProfile();
    profile.primaryColor = undefined;
    profile.textColor = '#ffff00';
    profile.backgroundColor = '#ffffff';
    profile.logoUrl = undefined;
    profile.logoSquareUrl = undefined;
    profile.logoRectUrl = undefined;
    profile.logoIconUrl = undefined;
    const report = auditBranding({ profile, messaging: {} });
    expect(report.issues.length).toBeGreaterThan(0);
    for (const i of report.issues) {
      expect(typeof i.id).toBe('string');
      expect(['error', 'warn', 'info']).toContain(i.severity);
      expect([
        'accessibility',
        'messaging',
        'identity',
        'assets',
        'typography',
        'consistency',
      ]).toContain(i.category);
      expect(typeof i.message).toBe('string');
      expect(i.message.length).toBeGreaterThan(0);
    }
  });

  it('attaches suggestions for issues that include them', () => {
    const profile = cleanProfile();
    profile.logoUrl = undefined;
    profile.logoSquareUrl = undefined;
    profile.logoRectUrl = undefined;
    profile.logoIconUrl = undefined;
    const report = auditBranding({ profile, messaging: cleanMessaging() });
    const noLogo = findIssue(report.issues, 'no-logo');
    expect(noLogo?.suggestion).toBeDefined();
    expect(noLogo?.suggestion).toMatch(/logo/i);
  });
});
