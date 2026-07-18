/**
 * Unit tests for three small, pure branding helpers:
 *   - lib/branding/palette-assign.ts  (autoAssignRoles)
 *   - lib/branding/mcp-schemas.ts     (brandingToolSchemas + handleBrandingCheckContrast)
 *   - lib/branding/css-vars.ts        (brandingToCssVars)
 *
 * All three modules are DB-free, so we can call them directly with hand-built fixtures.
 */

import { describe, expect, it } from 'vitest';
import { autoAssignRoles } from '@/lib/branding/palette-assign';
import type { PaletteColor } from '@/lib/branding/palette-extract';
import {
  brandingToolSchemas,
  handleBrandingCheckContrast,
  type BrandingToolName,
} from '@/lib/branding/mcp-schemas';
import { brandingToCssVars } from '@/lib/branding/css-vars';
import type { ResolvedBranding } from '@/lib/branding-types';

// ---------------------------------------------------------------------------
// autoAssignRoles (palette-assign.ts)
// ---------------------------------------------------------------------------

/** Quick fixture builder so tests stay readable. */
function color(
  hex: string,
  weight: number,
  h: number,
  s: number,
  l: number,
): PaletteColor {
  return { hex, weight, h, s, l };
}

describe('autoAssignRoles', () => {
  it('returns an empty object for an empty palette', () => {
    expect(autoAssignRoles([])).toEqual({});
  });

  it('falls back to default background + text when no light/dark candidates exist', () => {
    // All mid-lightness colors — no l>0.85, no l<0.2
    const palette: PaletteColor[] = [
      color('#aa5577', 0.5, 330, 0.4, 0.5),
      color('#5577aa', 0.3, 210, 0.4, 0.5),
    ];
    const result = autoAssignRoles(palette);
    expect(result.backgroundColor).toBe('#ffffff');
    expect(result.textColor).toBe('#111827');
  });

  it('picks the lightest near-white as background and the darkest as text', () => {
    const palette: PaletteColor[] = [
      color('#ffffff', 0.2, 0, 0, 1.0),
      color('#f5f5f5', 0.1, 0, 0, 0.96),
      color('#0a0a0a', 0.15, 0, 0, 0.04),
      color('#1a1a1a', 0.05, 0, 0, 0.1),
      color('#cc4444', 0.5, 0, 0.6, 0.53),
    ];
    const result = autoAssignRoles(palette);
    expect(result.backgroundColor).toBe('#ffffff');
    expect(result.textColor).toBe('#0a0a0a');
  });

  it('picks the most-weighted saturated mid-tone as primary', () => {
    const palette: PaletteColor[] = [
      color('#ffffff', 0.3, 0, 0, 0.95),
      color('#111111', 0.2, 0, 0, 0.07),
      // Heavy-weight saturated mid-tone — should win primary.
      color('#0066cc', 0.4, 210, 0.85, 0.45),
      // Lower-weight saturated color with a different hue — should become accent.
      color('#cc6600', 0.1, 30, 0.85, 0.4),
    ];
    const result = autoAssignRoles(palette);
    expect(result.primaryColor).toBe('#0066cc');
    expect(result.accentColor).toBe('#cc6600');
  });

  it('chooses a distinct hue for accent when possible (>40 degrees from primary)', () => {
    // Primary must beat accent candidate on the scoreForPrimary formula:
    //   score = s*0.6 + lightnessFit*0.25 + min(weight*5,1)*0.15
    // Both weights >0.2 saturate the weight term, so we differentiate via
    // saturation (primary higher) and lightness (primary closer to 0.5).
    const palette: PaletteColor[] = [
      color('#ffffff', 0.2, 0, 0, 0.95),
      color('#111111', 0.1, 0, 0, 0.07),
      color('#1166cc', 0.4, 215, 0.95, 0.5), // primary (blue) — top score
      color('#1577dd', 0.3, 213, 0.8, 0.47), // similar hue (should be skipped for accent)
      color('#cc6611', 0.25, 27, 0.7, 0.43), // far hue, lower s — accent
    ];
    const result = autoAssignRoles(palette);
    expect(result.primaryColor).toBe('#1166cc');
    expect(result.accentColor).toBe('#cc6611');
  });

  it('falls back to the second saturated color for accent when no distant-hue candidate exists', () => {
    // Only two saturated mids, both within 40deg — accent should still be assigned.
    const palette: PaletteColor[] = [
      color('#ffffff', 0.2, 0, 0, 0.95),
      color('#111111', 0.1, 0, 0, 0.07),
      color('#1166cc', 0.4, 215, 0.8, 0.43),
      color('#3377dd', 0.3, 220, 0.7, 0.55),
    ];
    const result = autoAssignRoles(palette);
    expect(result.primaryColor).toBe('#1166cc');
    expect(result.accentColor).toBe('#3377dd');
  });

  it('picks a secondary distinct from primary, accent, background, and text', () => {
    const palette: PaletteColor[] = [
      color('#ffffff', 0.2, 0, 0, 0.95),
      color('#111111', 0.1, 0, 0, 0.07),
      color('#1166cc', 0.4, 215, 0.95, 0.5), // primary (top score)
      color('#cc6611', 0.25, 27, 0.7, 0.43), // accent (distant hue)
      color('#888888', 0.05, 0, 0, 0.53), // secondary candidate (mid-tone, low saturation)
    ];
    const result = autoAssignRoles(palette);
    expect(result.primaryColor).toBe('#1166cc');
    expect(result.accentColor).toBe('#cc6611');
    expect(result.secondaryColor).toBe('#888888');
    // Confirm uniqueness.
    expect(new Set([
      result.primaryColor,
      result.secondaryColor,
      result.accentColor,
      result.backgroundColor,
      result.textColor,
    ]).size).toBe(5);
  });

  it('leaves primaryColor undefined when no color qualifies as saturated mid-tone', () => {
    // Only background + text — nothing in the s>=0.25, 0.2<=l<=0.75 band.
    const palette: PaletteColor[] = [
      color('#ffffff', 0.5, 0, 0, 0.95),
      color('#111111', 0.5, 0, 0, 0.07),
    ];
    const result = autoAssignRoles(palette);
    expect(result.backgroundColor).toBe('#ffffff');
    expect(result.textColor).toBe('#111111');
    expect(result.primaryColor).toBeUndefined();
    expect(result.accentColor).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// brandingToolSchemas + handleBrandingCheckContrast (mcp-schemas.ts)
// ---------------------------------------------------------------------------

describe('brandingToolSchemas', () => {
  it('exposes the expected tool names', () => {
    const names = Object.keys(brandingToolSchemas).sort();
    expect(names).toEqual(
      [
        'branding_audit',
        'branding_check_contrast',
        'branding_get_messaging',
        'branding_get_profile',
        'branding_list_profiles',
      ].sort(),
    );
  });

  it('gives every tool a description and an object inputSchema', () => {
    for (const [name, schema] of Object.entries(brandingToolSchemas)) {
      expect(schema.description, `${name} missing description`).toBeTypeOf('string');
      expect(schema.description.length).toBeGreaterThan(0);
      expect(schema.inputSchema.type).toBe('object');
      expect(schema.inputSchema.additionalProperties).toBe(false);
    }
  });

  it('requires foreground + background on branding_check_contrast', () => {
    const schema = brandingToolSchemas.branding_check_contrast;
    expect(schema.inputSchema.required).toEqual(['foreground', 'background']);
    expect(schema.inputSchema.properties.foreground.type).toBe('string');
    expect(schema.inputSchema.properties.background.type).toBe('string');
  });

  it('requires profileId on branding_audit', () => {
    const schema = brandingToolSchemas.branding_audit;
    expect(schema.inputSchema.required).toEqual(['profileId']);
    expect(schema.inputSchema.properties.profileId.type).toBe('number');
  });

  it('does not require profileId on branding_get_profile (defaults to default profile)', () => {
    const schema = brandingToolSchemas.branding_get_profile;
    // No `required` key, or required is empty.
    expect(
      (schema.inputSchema as { required?: readonly string[] }).required,
    ).toBeUndefined();
  });

  it('BrandingToolName type covers every key in the registry', () => {
    // This is a compile-time check, but we can sanity-check it at runtime too.
    const sample: BrandingToolName = 'branding_check_contrast';
    expect(brandingToolSchemas[sample]).toBeDefined();
  });
});

describe('handleBrandingCheckContrast', () => {
  it('returns ratio + AA/AAA flags for black on white', () => {
    const out = handleBrandingCheckContrast(
      { clientId: 1 },
      { foreground: '#000000', background: '#ffffff' },
    );
    expect(out.ratio).toBeCloseTo(21, 1);
    expect(out.passesAA).toBe(true);
    expect(out.passesAAA).toBe(true);
    expect(out.normalText).toBeTypeOf('string');
    expect(out.largeText).toBeTypeOf('string');
  });

  it('flags a low-contrast pair as failing AA', () => {
    const out = handleBrandingCheckContrast(
      { clientId: 1 },
      { foreground: '#cccccc', background: '#ffffff' },
    );
    expect(out.ratio).toBeLessThan(4.5);
    expect(out.passesAA).toBe(false);
    expect(out.passesAAA).toBe(false);
  });

  it('ignores its context argument (pure compute)', () => {
    const a = handleBrandingCheckContrast(
      { clientId: 1 },
      { foreground: '#222222', background: '#dddddd' },
    );
    const b = handleBrandingCheckContrast(
      { clientId: 999 },
      { foreground: '#222222', background: '#dddddd' },
    );
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// brandingToCssVars (css-vars.ts)
// ---------------------------------------------------------------------------

/** Minimum ResolvedBranding fixture — only the required fields populated. */
function minimalBranding(overrides: Partial<ResolvedBranding> = {}): ResolvedBranding {
  return {
    primaryColor: '#0066cc',
    secondaryColor: '#666666',
    accentColor: '#ffcc00',
    backgroundColor: '#ffffff',
    textColor: '#111111',
    headingFont: '',
    bodyFont: '',
    logoUrl: '',
    logoSquareUrl: '',
    logoRectUrl: '',
    logoIconUrl: '',
    logoText: '',
    logoAlt: '',
    navTemplate: '',
    navPosition: '',
    navBackground: '#ffffff',
    navTextColor: '#111111',
    ...overrides,
  };
}

describe('brandingToCssVars', () => {
  it('emits the five core color vars plus nav vars', () => {
    const vars = brandingToCssVars(minimalBranding());
    expect(vars['--brand-primary']).toBe('#0066cc');
    expect(vars['--brand-secondary']).toBe('#666666');
    expect(vars['--brand-accent']).toBe('#ffcc00');
    expect(vars['--brand-bg']).toBe('#ffffff');
    expect(vars['--brand-text']).toBe('#111111');
    expect(vars['--brand-nav-bg']).toBe('#ffffff');
    expect(vars['--brand-nav-text']).toBe('#111111');
  });

  it('omits optional font + radius + link vars when their source fields are empty', () => {
    const vars = brandingToCssVars(minimalBranding());
    expect(vars['--brand-heading-font']).toBeUndefined();
    expect(vars['--brand-body-font']).toBeUndefined();
    expect(vars['--brand-border-radius']).toBeUndefined();
    expect(vars['--brand-link-color']).toBeUndefined();
    expect(vars['--brand-link-hover-color']).toBeUndefined();
  });

  it('includes optional vars when populated', () => {
    const vars = brandingToCssVars(
      minimalBranding({
        headingFont: 'Inter',
        bodyFont: 'Source Sans 3',
        borderRadius: '6px',
        linkColor: '#0044aa',
        linkHoverColor: '#002266',
      }),
    );
    expect(vars['--brand-heading-font']).toBe('Inter');
    expect(vars['--brand-body-font']).toBe('Source Sans 3');
    expect(vars['--brand-border-radius']).toBe('6px');
    expect(vars['--brand-link-color']).toBe('#0044aa');
    expect(vars['--brand-link-hover-color']).toBe('#002266');
  });

  it('emits button-style vars when buttonStyle is present', () => {
    const vars = brandingToCssVars(
      minimalBranding({
        buttonStyle: {
          primaryBg: '#0066cc',
          primaryText: '#ffffff',
          primaryHoverBg: '#0055bb',
          secondaryBg: '#eeeeee',
          secondaryText: '#222222',
          secondaryHoverBg: '#dddddd',
          borderRadius: '4px',
          variant: 'filled',
        },
      }),
    );
    expect(vars['--brand-btn-primary-bg']).toBe('#0066cc');
    expect(vars['--brand-btn-primary-text']).toBe('#ffffff');
    expect(vars['--brand-btn-primary-hover-bg']).toBe('#0055bb');
    expect(vars['--brand-btn-secondary-bg']).toBe('#eeeeee');
    expect(vars['--brand-btn-secondary-text']).toBe('#222222');
    expect(vars['--brand-btn-secondary-hover-bg']).toBe('#dddddd');
    expect(vars['--brand-btn-border-radius']).toBe('4px');
    expect(vars['--brand-btn-variant']).toBe('filled');
  });

  it('emits only the populated button-style subfields', () => {
    const vars = brandingToCssVars(
      minimalBranding({
        buttonStyle: {
          primaryBg: '#0066cc',
          variant: 'outline',
        },
      }),
    );
    expect(vars['--brand-btn-primary-bg']).toBe('#0066cc');
    expect(vars['--brand-btn-variant']).toBe('outline');
    expect(vars['--brand-btn-primary-text']).toBeUndefined();
    expect(vars['--brand-btn-secondary-bg']).toBeUndefined();
    expect(vars['--brand-btn-border-radius']).toBeUndefined();
  });

  it('emits per-element typography vars with the --brand-<el>-<prop> shape', () => {
    const vars = brandingToCssVars(
      minimalBranding({
        typography: {
          h1: {
            font: 'Inter',
            size: '48px',
            weight: '700',
            lineHeight: '1.1',
            letterSpacing: '-0.02em',
          },
          body: {
            size: '16px',
            lineHeight: '1.6',
          },
        },
      }),
    );
    expect(vars['--brand-h1-font']).toBe('Inter');
    expect(vars['--brand-h1-size']).toBe('48px');
    expect(vars['--brand-h1-weight']).toBe('700');
    expect(vars['--brand-h1-line-height']).toBe('1.1');
    expect(vars['--brand-h1-letter-spacing']).toBe('-0.02em');
    expect(vars['--brand-body-size']).toBe('16px');
    expect(vars['--brand-body-line-height']).toBe('1.6');
    // Unset subfields stay unset.
    expect(vars['--brand-body-font']).toBeUndefined();
    expect(vars['--brand-body-weight']).toBeUndefined();
  });

  it('safely ignores null/undefined entries inside typography', () => {
    const vars = brandingToCssVars(
      minimalBranding({
        typography: {
          // Simulate a partial config where an element was cleared to undefined.
          h2: undefined as unknown as { size?: string },
          h3: { size: '24px' },
        },
      }),
    );
    expect(vars['--brand-h2-size']).toBeUndefined();
    expect(vars['--brand-h3-size']).toBe('24px');
  });

  it('emits a stable shape: no extra unexpected keys when only required fields are set', () => {
    const vars = brandingToCssVars(minimalBranding());
    expect(Object.keys(vars).sort()).toEqual(
      [
        '--brand-primary',
        '--brand-secondary',
        '--brand-accent',
        '--brand-bg',
        '--brand-text',
        '--brand-nav-bg',
        '--brand-nav-text',
      ].sort(),
    );
  });
});
