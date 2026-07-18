import { describe, it, expect } from 'vitest';
import {
  brandingToolSchemas,
  handleBrandingCheckContrast,
  type BrandingToolName,
} from '@/lib/branding/mcp-schemas';

describe('branding MCP tool schemas', () => {
  it('exposes the full set of tool names', () => {
    const names: BrandingToolName[] = [
      'branding_list_profiles',
      'branding_get_profile',
      'branding_get_messaging',
      'branding_audit',
      'branding_check_contrast',
    ];
    for (const n of names) {
      expect(brandingToolSchemas[n]).toBeDefined();
      expect(brandingToolSchemas[n].description.length).toBeGreaterThan(10);
      expect(brandingToolSchemas[n].inputSchema).toBeDefined();
    }
  });

  it('branding_audit requires profileId', () => {
    const schema = brandingToolSchemas.branding_audit.inputSchema as unknown as { required?: string[] };
    expect(schema.required).toContain('profileId');
  });

  it('branding_check_contrast requires both colors', () => {
    const schema = brandingToolSchemas.branding_check_contrast.inputSchema as unknown as { required?: string[] };
    expect(schema.required).toEqual(['foreground', 'background']);
  });

  it('uses additionalProperties: false everywhere', () => {
    for (const name of Object.keys(brandingToolSchemas) as BrandingToolName[]) {
      const schema = brandingToolSchemas[name].inputSchema as unknown as { additionalProperties?: boolean };
      expect(schema.additionalProperties).toBe(false);
    }
  });
});

describe('handleBrandingCheckContrast (pure)', () => {
  it('grades black on white as AAA', () => {
    const out = handleBrandingCheckContrast({ clientId: 1 }, { foreground: '#000', background: '#fff' });
    expect(out.ratio).toBeGreaterThan(7);
    expect(out.normalText).toBe('AAA');
    expect(out.passesAAA).toBe(true);
  });

  it('grades #888 on white as AA-large', () => {
    const out = handleBrandingCheckContrast({ clientId: 1 }, { foreground: '#888', background: '#fff' });
    expect(out.normalText).toBe('AA-large');
    expect(out.passesAA).toBe(false);
  });

  it('returns 0 ratio for invalid color', () => {
    const out = handleBrandingCheckContrast({ clientId: 1 }, { foreground: 'not-a-color', background: '#fff' });
    expect(out.ratio).toBe(0);
  });

  it('symmetric: swapping fg/bg gives same ratio', () => {
    const a = handleBrandingCheckContrast({ clientId: 1 }, { foreground: '#111', background: '#eee' });
    const b = handleBrandingCheckContrast({ clientId: 1 }, { foreground: '#eee', background: '#111' });
    expect(a.ratio).toBe(b.ratio);
  });
});
