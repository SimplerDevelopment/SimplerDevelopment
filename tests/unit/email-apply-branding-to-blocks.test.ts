// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  applyBrandingToBlocks,
  brandingProfileToEmailBranding,
  type EmailBranding,
} from '@/lib/email/apply-branding-to-blocks';
import type { Block } from '@/types/blocks';

// Helper to build a block with minimal required fields. We cast through unknown
// because the test only exercises the apply-branding transform, which treats
// most properties opaquely.
function makeBlock(partial: Record<string, unknown>): Block {
  return {
    id: 'b-1',
    order: 0,
    ...partial,
  } as unknown as Block;
}

const FULL_BRANDING: EmailBranding = {
  primaryColor: '#ff0000',
  accentColor: '#00ff00',
  textColor: '#111111',
  backgroundColor: '#ffffff',
  headingFont: 'Georgia, serif',
  bodyFont: 'Arial, sans-serif',
  logoUrl: 'https://cdn.example.com/logo.png',
  logoAlt: 'Example Logo',
  borderRadius: '8px',
  buttonPrimaryBg: '#0000ff',
  buttonPrimaryText: '#ffffff',
  companyName: 'Acme Corp',
};

describe('applyBrandingToBlocks', () => {
  describe('email-header block', () => {
    it('sets logoUrl when branding has logoUrl', () => {
      const blocks = [makeBlock({ type: 'email-header' })];
      const result = applyBrandingToBlocks(blocks, FULL_BRANDING) as Array<
        Record<string, unknown>
      >;
      expect(result[0].logoUrl).toBe('https://cdn.example.com/logo.png');
    });

    it('does not set logoUrl when branding has no logoUrl', () => {
      const blocks = [makeBlock({ type: 'email-header' })];
      const result = applyBrandingToBlocks(blocks, {}) as Array<Record<string, unknown>>;
      expect(result[0].logoUrl).toBeUndefined();
    });

    it('preserves other email-header fields', () => {
      const blocks = [
        makeBlock({ type: 'email-header', id: 'hdr-1', order: 2, logoAlt: 'keep me' }),
      ];
      const result = applyBrandingToBlocks(blocks, FULL_BRANDING) as Array<
        Record<string, unknown>
      >;
      expect(result[0].id).toBe('hdr-1');
      expect(result[0].order).toBe(2);
      expect(result[0].logoAlt).toBe('keep me');
    });

    it('does not mutate the original block', () => {
      const original = makeBlock({ type: 'email-header' }) as Record<string, unknown>;
      applyBrandingToBlocks([original as unknown as Block], FULL_BRANDING);
      expect(original.logoUrl).toBeUndefined();
    });
  });

  describe('email-footer block', () => {
    it('sets companyName when branding has companyName', () => {
      const blocks = [makeBlock({ type: 'email-footer' })];
      const result = applyBrandingToBlocks(blocks, FULL_BRANDING) as Array<
        Record<string, unknown>
      >;
      expect(result[0].companyName).toBe('Acme Corp');
    });

    it('does not set companyName when missing from branding', () => {
      const blocks = [makeBlock({ type: 'email-footer' })];
      const result = applyBrandingToBlocks(blocks, {}) as Array<Record<string, unknown>>;
      expect(result[0].companyName).toBeUndefined();
    });
  });

  describe('heading block', () => {
    it('applies textColor and headingFont to style', () => {
      const blocks = [makeBlock({ type: 'heading', text: 'Hi' })];
      const result = applyBrandingToBlocks(blocks, FULL_BRANDING) as Array<
        Record<string, unknown>
      >;
      const style = result[0].style as Record<string, unknown>;
      expect(style.color).toBe('#111111');
      expect(style.fontFamily).toBe('Georgia, serif');
    });

    it('preserves existing style props while overriding branded ones', () => {
      const blocks = [
        makeBlock({
          type: 'heading',
          style: { color: '#oldcolor', fontWeight: 'bold' },
        }),
      ];
      const result = applyBrandingToBlocks(blocks, FULL_BRANDING) as Array<
        Record<string, unknown>
      >;
      const style = result[0].style as Record<string, unknown>;
      expect(style.color).toBe('#111111');
      expect(style.fontWeight).toBe('bold');
    });

    it('leaves style empty when branding has no relevant fields', () => {
      const blocks = [makeBlock({ type: 'heading' })];
      const result = applyBrandingToBlocks(blocks, {}) as Array<Record<string, unknown>>;
      const style = result[0].style as Record<string, unknown>;
      expect(style.color).toBeUndefined();
      expect(style.fontFamily).toBeUndefined();
    });

    it('only sets textColor when only textColor is provided', () => {
      const blocks = [makeBlock({ type: 'heading' })];
      const result = applyBrandingToBlocks(blocks, { textColor: '#abcabc' }) as Array<
        Record<string, unknown>
      >;
      const style = result[0].style as Record<string, unknown>;
      expect(style.color).toBe('#abcabc');
      expect(style.fontFamily).toBeUndefined();
    });
  });

  describe('text block', () => {
    it('applies bodyFont to style', () => {
      const blocks = [makeBlock({ type: 'text' })];
      const result = applyBrandingToBlocks(blocks, FULL_BRANDING) as Array<
        Record<string, unknown>
      >;
      const style = result[0].style as Record<string, unknown>;
      expect(style.fontFamily).toBe('Arial, sans-serif');
    });

    it('does not set fontFamily when bodyFont missing', () => {
      const blocks = [makeBlock({ type: 'text' })];
      const result = applyBrandingToBlocks(blocks, {}) as Array<Record<string, unknown>>;
      const style = result[0].style as Record<string, unknown>;
      expect(style.fontFamily).toBeUndefined();
    });
  });

  describe('button block', () => {
    it('applies buttonPrimaryBg, buttonPrimaryText, and borderRadius', () => {
      const blocks = [makeBlock({ type: 'button' })];
      const result = applyBrandingToBlocks(blocks, FULL_BRANDING) as Array<
        Record<string, unknown>
      >;
      const style = result[0].style as Record<string, unknown>;
      expect(style.backgroundColor).toBe('#0000ff');
      expect(style.color).toBe('#ffffff');
      expect(style.borderRadius).toBe('8px');
    });

    it('falls back to primaryColor for background when buttonPrimaryBg is absent', () => {
      const blocks = [makeBlock({ type: 'button' })];
      const result = applyBrandingToBlocks(blocks, {
        primaryColor: '#deadbe',
      }) as Array<Record<string, unknown>>;
      const style = result[0].style as Record<string, unknown>;
      expect(style.backgroundColor).toBe('#deadbe');
    });

    it('prefers buttonPrimaryBg over primaryColor', () => {
      const blocks = [makeBlock({ type: 'button' })];
      const result = applyBrandingToBlocks(blocks, {
        primaryColor: '#deadbe',
        buttonPrimaryBg: '#cafe00',
      }) as Array<Record<string, unknown>>;
      const style = result[0].style as Record<string, unknown>;
      expect(style.backgroundColor).toBe('#cafe00');
    });

    it('does not set backgroundColor when neither primaryColor nor buttonPrimaryBg provided', () => {
      const blocks = [makeBlock({ type: 'button' })];
      const result = applyBrandingToBlocks(blocks, {}) as Array<Record<string, unknown>>;
      const style = result[0].style as Record<string, unknown>;
      expect(style.backgroundColor).toBeUndefined();
      expect(style.color).toBeUndefined();
      expect(style.borderRadius).toBeUndefined();
    });

    it('preserves existing style fields not overridden by branding', () => {
      const blocks = [
        makeBlock({ type: 'button', style: { padding: '12px', fontSize: '16px' } }),
      ];
      const result = applyBrandingToBlocks(blocks, FULL_BRANDING) as Array<
        Record<string, unknown>
      >;
      const style = result[0].style as Record<string, unknown>;
      expect(style.padding).toBe('12px');
      expect(style.fontSize).toBe('16px');
      expect(style.backgroundColor).toBe('#0000ff');
    });
  });

  describe('divider block', () => {
    it('applies accentColor as borderColor', () => {
      const blocks = [makeBlock({ type: 'divider' })];
      const result = applyBrandingToBlocks(blocks, FULL_BRANDING) as Array<
        Record<string, unknown>
      >;
      const style = result[0].style as Record<string, unknown>;
      expect(style.borderColor).toBe('#00ff00');
    });

    it('does not set borderColor when accentColor missing', () => {
      const blocks = [makeBlock({ type: 'divider' })];
      const result = applyBrandingToBlocks(blocks, {}) as Array<Record<string, unknown>>;
      const style = result[0].style as Record<string, unknown>;
      expect(style.borderColor).toBeUndefined();
    });
  });

  describe('quote block', () => {
    it('applies primaryColor as borderColor', () => {
      const blocks = [makeBlock({ type: 'quote' })];
      const result = applyBrandingToBlocks(blocks, FULL_BRANDING) as Array<
        Record<string, unknown>
      >;
      const style = result[0].style as Record<string, unknown>;
      expect(style.borderColor).toBe('#ff0000');
    });

    it('does not set borderColor when primaryColor missing', () => {
      const blocks = [makeBlock({ type: 'quote' })];
      const result = applyBrandingToBlocks(blocks, {}) as Array<Record<string, unknown>>;
      const style = result[0].style as Record<string, unknown>;
      expect(style.borderColor).toBeUndefined();
    });
  });

  describe('section / columns nested blocks', () => {
    it('recurses into section.blocks', () => {
      const blocks = [
        makeBlock({
          type: 'section',
          blocks: [makeBlock({ type: 'heading' }), makeBlock({ type: 'text' })],
        }),
      ];
      const result = applyBrandingToBlocks(blocks, FULL_BRANDING) as Array<
        Record<string, unknown>
      >;
      const inner = result[0].blocks as Array<Record<string, unknown>>;
      const headingStyle = inner[0].style as Record<string, unknown>;
      const textStyle = inner[1].style as Record<string, unknown>;
      expect(headingStyle.color).toBe('#111111');
      expect(textStyle.fontFamily).toBe('Arial, sans-serif');
    });

    it('recurses into columns[].blocks', () => {
      const blocks = [
        makeBlock({
          type: 'columns',
          columns: [
            { id: 'c1', blocks: [makeBlock({ type: 'button' })] },
            { id: 'c2', blocks: [makeBlock({ type: 'heading' })] },
          ],
        }),
      ];
      const result = applyBrandingToBlocks(blocks, FULL_BRANDING) as Array<
        Record<string, unknown>
      >;
      const cols = result[0].columns as Array<Record<string, unknown>>;
      const btn = (cols[0].blocks as Array<Record<string, unknown>>)[0];
      const hdr = (cols[1].blocks as Array<Record<string, unknown>>)[0];
      expect((btn.style as Record<string, unknown>).backgroundColor).toBe('#0000ff');
      expect((hdr.style as Record<string, unknown>).color).toBe('#111111');
    });

    it('preserves column-level fields outside of blocks', () => {
      const blocks = [
        makeBlock({
          type: 'columns',
          columns: [
            { id: 'c1', width: '50%', blocks: [makeBlock({ type: 'heading' })] },
          ],
        }),
      ];
      const result = applyBrandingToBlocks(blocks, FULL_BRANDING) as Array<
        Record<string, unknown>
      >;
      const cols = result[0].columns as Array<Record<string, unknown>>;
      expect(cols[0].id).toBe('c1');
      expect(cols[0].width).toBe('50%');
    });

    it('returns the block untouched when section has neither blocks nor columns', () => {
      const blocks = [makeBlock({ type: 'section', misc: 'thing' })];
      const result = applyBrandingToBlocks(blocks, FULL_BRANDING) as Array<
        Record<string, unknown>
      >;
      expect(result[0]).toEqual({ id: 'b-1', order: 0, type: 'section', misc: 'thing' });
    });

    it('handles deeply nested sections', () => {
      const blocks = [
        makeBlock({
          type: 'section',
          blocks: [
            makeBlock({
              type: 'section',
              blocks: [makeBlock({ type: 'heading' })],
            }),
          ],
        }),
      ];
      const result = applyBrandingToBlocks(blocks, FULL_BRANDING) as Array<
        Record<string, unknown>
      >;
      const outer = result[0].blocks as Array<Record<string, unknown>>;
      const inner = outer[0].blocks as Array<Record<string, unknown>>;
      const style = inner[0].style as Record<string, unknown>;
      expect(style.color).toBe('#111111');
    });
  });

  describe('default / unknown block', () => {
    it('returns unknown block types unchanged', () => {
      const blocks = [makeBlock({ type: 'image', src: 'x.png' })];
      const result = applyBrandingToBlocks(blocks, FULL_BRANDING) as Array<
        Record<string, unknown>
      >;
      expect(result[0]).toEqual({ id: 'b-1', order: 0, type: 'image', src: 'x.png' });
    });
  });

  describe('multiple blocks', () => {
    it('processes a heterogeneous list and preserves order', () => {
      const blocks = [
        makeBlock({ type: 'email-header', id: 'h' }),
        makeBlock({ type: 'heading', id: 'a' }),
        makeBlock({ type: 'text', id: 'b' }),
        makeBlock({ type: 'button', id: 'c' }),
        makeBlock({ type: 'divider', id: 'd' }),
        makeBlock({ type: 'quote', id: 'e' }),
        makeBlock({ type: 'email-footer', id: 'f' }),
      ];
      const result = applyBrandingToBlocks(blocks, FULL_BRANDING) as Array<
        Record<string, unknown>
      >;
      expect(result.map((b) => b.id)).toEqual(['h', 'a', 'b', 'c', 'd', 'e', 'f']);
    });

    it('returns an empty array unchanged', () => {
      expect(applyBrandingToBlocks([], FULL_BRANDING)).toEqual([]);
    });
  });

  describe('partial branding', () => {
    it('is a no-op style-wise when branding is fully empty', () => {
      const blocks = [
        makeBlock({ type: 'heading' }),
        makeBlock({ type: 'button' }),
        makeBlock({ type: 'divider' }),
      ];
      const result = applyBrandingToBlocks(blocks, {}) as Array<Record<string, unknown>>;
      for (const b of result) {
        const style = b.style as Record<string, unknown>;
        // All style props should be undefined (empty cloned style).
        expect(style.color).toBeUndefined();
        expect(style.backgroundColor).toBeUndefined();
        expect(style.borderColor).toBeUndefined();
        expect(style.fontFamily).toBeUndefined();
      }
    });
  });
});

describe('brandingProfileToEmailBranding', () => {
  it('maps every field from a fully-populated profile', () => {
    const result = brandingProfileToEmailBranding(
      {
        primaryColor: '#aaa',
        accentColor: '#bbb',
        textColor: '#ccc',
        backgroundColor: '#ddd',
        headingFont: 'Serif',
        bodyFont: 'Sans',
        logoUrl: 'https://x/logo.png',
        logoAlt: 'Logo',
        borderRadius: '4px',
        buttonStyle: { primaryBg: '#eee', primaryText: '#fff' },
      },
      'Acme',
    );
    expect(result).toEqual({
      primaryColor: '#aaa',
      accentColor: '#bbb',
      textColor: '#ccc',
      backgroundColor: '#ddd',
      headingFont: 'Serif',
      bodyFont: 'Sans',
      logoUrl: 'https://x/logo.png',
      logoAlt: 'Logo',
      borderRadius: '4px',
      buttonPrimaryBg: '#eee',
      buttonPrimaryText: '#fff',
      companyName: 'Acme',
    });
  });

  it('converts nulls to undefined', () => {
    const result = brandingProfileToEmailBranding({
      primaryColor: null,
      accentColor: null,
      textColor: null,
      backgroundColor: null,
      headingFont: null,
      bodyFont: null,
      logoUrl: null,
      logoAlt: null,
      borderRadius: null,
      buttonStyle: null,
    });
    expect(result.primaryColor).toBeUndefined();
    expect(result.accentColor).toBeUndefined();
    expect(result.textColor).toBeUndefined();
    expect(result.backgroundColor).toBeUndefined();
    expect(result.headingFont).toBeUndefined();
    expect(result.bodyFont).toBeUndefined();
    expect(result.logoUrl).toBeUndefined();
    expect(result.logoAlt).toBeUndefined();
    expect(result.borderRadius).toBeUndefined();
    expect(result.buttonPrimaryBg).toBeUndefined();
    expect(result.buttonPrimaryText).toBeUndefined();
    expect(result.companyName).toBeUndefined();
  });

  it('returns undefined for buttonStyle when buttonStyle is null', () => {
    const result = brandingProfileToEmailBranding({ buttonStyle: null });
    expect(result.buttonPrimaryBg).toBeUndefined();
    expect(result.buttonPrimaryText).toBeUndefined();
  });

  it('handles partial buttonStyle (only primaryBg present)', () => {
    const result = brandingProfileToEmailBranding({
      buttonStyle: { primaryBg: '#123456' },
    });
    expect(result.buttonPrimaryBg).toBe('#123456');
    expect(result.buttonPrimaryText).toBeUndefined();
  });

  it('omits companyName when arg is not passed', () => {
    const result = brandingProfileToEmailBranding({});
    expect(result.companyName).toBeUndefined();
  });

  it('uses the companyName argument verbatim', () => {
    const result = brandingProfileToEmailBranding({}, 'Hello Co');
    expect(result.companyName).toBe('Hello Co');
  });

  it('accepts an empty profile object', () => {
    const result = brandingProfileToEmailBranding({});
    // All map keys should be present in the object (mapped to undefined).
    expect(Object.keys(result).sort()).toEqual(
      [
        'primaryColor',
        'accentColor',
        'textColor',
        'backgroundColor',
        'headingFont',
        'bodyFont',
        'logoUrl',
        'logoAlt',
        'borderRadius',
        'buttonPrimaryBg',
        'buttonPrimaryText',
        'companyName',
      ].sort(),
    );
  });

  it('result is consumable by applyBrandingToBlocks', () => {
    const branding = brandingProfileToEmailBranding(
      {
        primaryColor: '#abcdef',
        buttonStyle: { primaryBg: '#012345', primaryText: '#fedcba' },
      },
      'Round Trip Co',
    );
    const blocks = [
      makeBlock({ type: 'button' }),
      makeBlock({ type: 'email-footer' }),
    ];
    const result = applyBrandingToBlocks(blocks, branding) as Array<
      Record<string, unknown>
    >;
    const btnStyle = result[0].style as Record<string, unknown>;
    expect(btnStyle.backgroundColor).toBe('#012345');
    expect(btnStyle.color).toBe('#fedcba');
    expect(result[1].companyName).toBe('Round Trip Co');
  });
});
