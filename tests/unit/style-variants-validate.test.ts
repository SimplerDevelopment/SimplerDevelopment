// @vitest-environment node
/**
 * Unit tests for `validateStyleVariantsResponse` and helpers in
 * lib/ai/style-variants/validate.ts.
 *
 * Covers:
 *  - Top-level shape rejection (non-object, missing variants array)
 *  - Per-variant cleanup: dropping unknown keys, non-string values, invalid values,
 *    off-brand values when exploreOutsideBrand=false
 *  - elementStyles cleanup: dropping unknown element names
 *  - Diagnostics emission and "all variants empty after cleaning" rejection
 *  - isValidValue branches: enum, css-color, css-length, css-number, css-shadow,
 *    css-gradient, css-string
 *  - isOnBrandColor (named colors, hex, rgb/hsl, neutrals)
 *  - Brand-respect: fonts, border radius, gradients
 *  - StyleVariantsValidationError class
 */
import { describe, it, expect } from 'vitest';
import {
  validateStyleVariantsResponse,
  isOnBrandColor,
  StyleVariantsValidationError,
} from '@/lib/ai/style-variants/validate';
import { HERO_STYLE_SURFACE } from '@/lib/ai/style-variants/style-surface';
import type { BrandStyleContext } from '@/lib/ai/style-variants/prompt';

const BRAND: BrandStyleContext = {
  primaryColor: '#0066ff',
  accentColor: '#ff6600',
  backgroundColor: '#ffffff',
  textColor: '#111111',
  headingFont: '"Inter", sans-serif',
  bodyFont: '"Inter", sans-serif',
  borderRadius: '8px',
};

const EMPTY_BRAND: BrandStyleContext = {};

function makeVariant(propsDelta: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return {
    philosophyId: 'brutalist',
    label: 'Brutalist',
    rationale: 'Sharp edges',
    propsDelta,
    ...overrides,
  };
}

describe('StyleVariantsValidationError', () => {
  it('sets name and message', () => {
    const err = new StyleVariantsValidationError('boom', { extra: 1 });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('StyleVariantsValidationError');
    expect(err.message).toBe('boom');
    expect(err.details).toEqual({ extra: 1 });
  });

  it('details may be omitted', () => {
    const err = new StyleVariantsValidationError('boom');
    expect(err.details).toBeUndefined();
  });
});

describe('validateStyleVariantsResponse — top-level guard', () => {
  it('throws when raw is null', () => {
    expect(() => validateStyleVariantsResponse(null, HERO_STYLE_SURFACE, BRAND, false))
      .toThrow(StyleVariantsValidationError);
  });

  it('throws when raw is undefined', () => {
    expect(() => validateStyleVariantsResponse(undefined, HERO_STYLE_SURFACE, BRAND, false))
      .toThrow(/not an object/);
  });

  it('throws when raw is a string', () => {
    expect(() => validateStyleVariantsResponse('hello', HERO_STYLE_SURFACE, BRAND, false))
      .toThrow(/not an object/);
  });

  it('throws when raw is a number', () => {
    expect(() => validateStyleVariantsResponse(42, HERO_STYLE_SURFACE, BRAND, false))
      .toThrow(/not an object/);
  });

  it('throws when variants is missing', () => {
    expect(() => validateStyleVariantsResponse({}, HERO_STYLE_SURFACE, BRAND, false))
      .toThrow(/missing variants array/);
  });

  it('throws when variants is not an array', () => {
    expect(() => validateStyleVariantsResponse({ variants: 'nope' }, HERO_STYLE_SURFACE, BRAND, false))
      .toThrow(/missing variants array/);
  });

  it('throws when variants is empty array', () => {
    expect(() => validateStyleVariantsResponse({ variants: [] }, HERO_STYLE_SURFACE, BRAND, false))
      .toThrow(/missing variants array/);
  });
});

describe('validateStyleVariantsResponse — variant cleaning', () => {
  it('accepts a fully valid wrapperStyle variant', () => {
    const raw = {
      variants: [
        makeVariant({
          style: {
            backgroundColor: '#0066ff',
            padding: '8rem 2rem',
            textAlign: 'center',
          },
        }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants).toHaveLength(1);
    expect(r.variants[0].propsDelta.style).toEqual({
      backgroundColor: '#0066ff',
      padding: '8rem 2rem',
      textAlign: 'center',
    });
    expect(r.variants[0].philosophyId).toBe('brutalist');
    expect(r.variants[0].label).toBe('Brutalist');
    expect(r.variants[0].rationale).toBe('Sharp edges');
  });

  it('drops unknown wrapperStyle keys', () => {
    const raw = {
      variants: [
        makeVariant({
          style: {
            backgroundColor: '#0066ff',
            notARealKey: 'whatever',
          },
        }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants).toHaveLength(1);
    expect(r.variants[0].propsDelta.style).toEqual({ backgroundColor: '#0066ff' });
    expect(r.diagnostics[0].droppedKeys.some((k) => k.includes('notARealKey'))).toBe(true);
  });

  it('drops non-string values', () => {
    const raw = {
      variants: [
        makeVariant({
          style: {
            backgroundColor: 12345 as unknown as string,
            padding: '8rem 2rem',
          },
        }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants[0].propsDelta.style).toEqual({ padding: '8rem 2rem' });
    expect(r.diagnostics[0].droppedKeys.some((k) => k.includes('non-string'))).toBe(true);
  });

  it('drops empty string values', () => {
    const raw = {
      variants: [
        makeVariant({
          style: {
            backgroundColor: '',
            padding: '8rem 2rem',
          },
        }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants[0].propsDelta.style).toEqual({ padding: '8rem 2rem' });
  });

  it('drops enum values that are not in the enum list', () => {
    const raw = {
      variants: [
        makeVariant({
          style: {
            textAlign: 'diagonal', // not in enum
            display: 'flex',
          },
        }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants[0].propsDelta.style).toEqual({ display: 'flex' });
    expect(r.diagnostics[0].droppedKeys.some((k) => k.includes('invalid value'))).toBe(true);
  });

  it('drops off-brand colors when exploreOutsideBrand=false', () => {
    const raw = {
      variants: [
        makeVariant({
          style: {
            backgroundColor: '#ff00ff', // not in brand palette, not a neutral
            padding: '8rem 2rem',
          },
        }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants[0].propsDelta.style).toEqual({ padding: '8rem 2rem' });
    expect(r.diagnostics[0].droppedKeys.some((k) => k.includes('off-brand'))).toBe(true);
  });

  it('allows off-brand colors when exploreOutsideBrand=true', () => {
    const raw = {
      variants: [
        makeVariant({
          style: {
            backgroundColor: '#ff00ff',
            padding: '8rem 2rem',
          },
        }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, true);
    expect(r.variants[0].propsDelta.style).toEqual({
      backgroundColor: '#ff00ff',
      padding: '8rem 2rem',
    });
  });

  it('allows brand primary color in brand-respect mode', () => {
    const raw = {
      variants: [makeVariant({ style: { backgroundColor: '#0066ff' } })],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants[0].propsDelta.style?.backgroundColor).toBe('#0066ff');
  });

  it('allows neutral (gray) colors in brand-respect mode', () => {
    const raw = {
      variants: [makeVariant({ style: { backgroundColor: '#444444' } })],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants[0].propsDelta.style?.backgroundColor).toBe('#444444');
  });

  it('skips non-object variants', () => {
    const raw = {
      variants: [
        null,
        'not an object',
        makeVariant({ style: { padding: '8rem 2rem' } }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants).toHaveLength(1);
  });

  it('falls back to default philosophyId/label/rationale when missing', () => {
    const raw = {
      variants: [
        {
          propsDelta: { style: { padding: '8rem 2rem' } },
        },
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants[0].philosophyId).toBe('variant-1');
    expect(r.variants[0].label).toBe('Variant 1');
    expect(r.variants[0].rationale).toBe('');
  });

  it('falls back to default label when empty string', () => {
    const raw = {
      variants: [
        {
          philosophyId: 'p1',
          label: '',
          rationale: 'meh',
          propsDelta: { style: { padding: '8rem 2rem' } },
        },
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants[0].label).toBe('Variant 1');
  });

  it('handles missing propsDelta entirely', () => {
    const raw = {
      variants: [
        { philosophyId: 'p1', label: 'X', rationale: 'y' },
        makeVariant({ style: { padding: '8rem 2rem' } }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants).toHaveLength(1);
  });

  it('treats non-object propsDelta as empty', () => {
    const raw = {
      variants: [
        makeVariant({} as Record<string, unknown>),
        { ...makeVariant({}), propsDelta: 'string-not-object' },
        makeVariant({ style: { padding: '8rem 2rem' } }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants).toHaveLength(1);
  });

  it('emits "(empty after cleaning)" diagnostic for variants stripped to nothing', () => {
    const raw = {
      variants: [
        makeVariant({}),
        makeVariant({ style: { padding: '8rem 2rem' } }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.diagnostics[0].droppedKeys).toContain('(empty after cleaning)');
  });

  it('throws when every variant is stripped empty', () => {
    const raw = {
      variants: [
        makeVariant({ style: { wonky: 'nope' } }),
        makeVariant({}),
      ],
    };
    expect(() => validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false))
      .toThrow(/All variants empty after cleaning/);
  });
});

describe('validateStyleVariantsResponse — elementStyles', () => {
  it('accepts a valid element style', () => {
    const raw = {
      variants: [
        makeVariant({
          elementStyles: {
            title: { color: '#0066ff', fontSize: '3rem' },
          },
        }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants[0].propsDelta.elementStyles).toEqual({
      title: { color: '#0066ff', fontSize: '3rem' },
    });
  });

  it('drops unknown element names', () => {
    const raw = {
      variants: [
        makeVariant({
          elementStyles: {
            unknownElement: { color: '#0066ff' },
            title: { color: '#0066ff' },
          },
        }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants[0].propsDelta.elementStyles).toEqual({ title: { color: '#0066ff' } });
    expect(r.diagnostics[0].droppedKeys.some((k) => k.includes('unknownElement') && k.includes('unknown element'))).toBe(true);
  });

  it('omits empty cleaned element styles entirely', () => {
    const raw = {
      variants: [
        makeVariant({
          elementStyles: {
            title: { weird: 'value' },
          },
          style: { padding: '8rem 2rem' },
        }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants[0].propsDelta.elementStyles).toBeUndefined();
    expect(r.variants[0].propsDelta.style).toEqual({ padding: '8rem 2rem' });
  });

  it('ignores non-object elementStyles', () => {
    const raw = {
      variants: [
        makeVariant({
          elementStyles: 'oops' as unknown,
          style: { padding: '8rem 2rem' },
        }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants[0].propsDelta.elementStyles).toBeUndefined();
  });

  it('keeps variant when elementStyles has at least one valid element', () => {
    const raw = {
      variants: [
        makeVariant({
          elementStyles: {
            title: { color: '#0066ff' },
          },
        }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants).toHaveLength(1);
    expect(r.variants[0].propsDelta.style).toBeUndefined();
  });
});

describe('isValidValue — css-color', () => {
  it('accepts hex 3-digit', () => {
    const raw = { variants: [makeVariant({ style: { backgroundColor: '#fff' } })] };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, true);
    expect(r.variants[0].propsDelta.style?.backgroundColor).toBe('#fff');
  });

  it('accepts hex 6-digit', () => {
    const raw = { variants: [makeVariant({ style: { backgroundColor: '#abcdef' } })] };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, true);
    expect(r.variants[0].propsDelta.style?.backgroundColor).toBe('#abcdef');
  });

  it('accepts hex 8-digit (with alpha)', () => {
    const raw = { variants: [makeVariant({ style: { backgroundColor: '#abcdef80' } })] };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, true);
    expect(r.variants[0].propsDelta.style?.backgroundColor).toBe('#abcdef80');
  });

  it('accepts rgb()', () => {
    const raw = { variants: [makeVariant({ style: { backgroundColor: 'rgb(0, 102, 255)' } })] };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, true);
    expect(r.variants[0].propsDelta.style?.backgroundColor).toBe('rgb(0, 102, 255)');
  });

  it('accepts rgba()', () => {
    const raw = { variants: [makeVariant({ style: { backgroundColor: 'rgba(0, 102, 255, 0.5)' } })] };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, true);
    expect(r.variants[0].propsDelta.style?.backgroundColor).toBe('rgba(0, 102, 255, 0.5)');
  });

  it('accepts hsl()', () => {
    const raw = { variants: [makeVariant({ style: { backgroundColor: 'hsl(210, 100%, 50%)' } })] };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, true);
    expect(r.variants[0].propsDelta.style?.backgroundColor).toBe('hsl(210, 100%, 50%)');
  });

  it('accepts named colors', () => {
    const raw = { variants: [makeVariant({ style: { backgroundColor: 'transparent' } })] };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, true);
    expect(r.variants[0].propsDelta.style?.backgroundColor).toBe('transparent');
  });

  it('rejects invalid color strings', () => {
    const raw = {
      variants: [makeVariant({
        style: { backgroundColor: 'not-a-color', padding: '8rem 2rem' },
      })],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, true);
    expect(r.variants[0].propsDelta.style).toEqual({ padding: '8rem 2rem' });
  });
});

describe('isValidValue — css-length', () => {
  it('accepts "0"', () => {
    const raw = { variants: [makeVariant({ style: { padding: '0' } })] };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, true);
    expect(r.variants[0].propsDelta.style?.padding).toBe('0');
  });

  it('accepts "auto"', () => {
    const raw = { variants: [makeVariant({ style: { padding: 'auto' } })] };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, true);
    expect(r.variants[0].propsDelta.style?.padding).toBe('auto');
  });

  it('accepts pixel length', () => {
    const raw = { variants: [makeVariant({ style: { padding: '24px' } })] };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, true);
    expect(r.variants[0].propsDelta.style?.padding).toBe('24px');
  });

  it('accepts rem length', () => {
    const raw = { variants: [makeVariant({ style: { padding: '1.5rem' } })] };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, true);
    expect(r.variants[0].propsDelta.style?.padding).toBe('1.5rem');
  });

  it('accepts viewport units', () => {
    const raw = { variants: [makeVariant({ style: { minHeight: '70vh' } })] };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, true);
    expect(r.variants[0].propsDelta.style?.minHeight).toBe('70vh');
  });

  it('accepts shorthand multi-token lengths', () => {
    const raw = { variants: [makeVariant({ style: { padding: '8rem 2rem' } })] };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, true);
    expect(r.variants[0].propsDelta.style?.padding).toBe('8rem 2rem');
  });

  it('accepts calc()', () => {
    const raw = { variants: [makeVariant({ style: { padding: 'calc(100% - 20px)' } })] };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, true);
    expect(r.variants[0].propsDelta.style?.padding).toBe('calc(100% - 20px)');
  });

  it('accepts clamp()', () => {
    const raw = { variants: [makeVariant({ style: { padding: 'clamp(1rem, 5vw, 4rem)' } })] };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, true);
    expect(r.variants[0].propsDelta.style?.padding).toBe('clamp(1rem, 5vw, 4rem)');
  });

  it('accepts min()', () => {
    const raw = { variants: [makeVariant({ style: { padding: 'min(15vh, 8rem)' } })] };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, true);
    expect(r.variants[0].propsDelta.style?.padding).toBe('min(15vh, 8rem)');
  });

  it('accepts max()', () => {
    const raw = { variants: [makeVariant({ style: { padding: 'max(2rem, 5vw)' } })] };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, true);
    expect(r.variants[0].propsDelta.style?.padding).toBe('max(2rem, 5vw)');
  });

  it('rejects garbage length', () => {
    const raw = {
      variants: [makeVariant({
        style: { padding: 'sploosh', backgroundColor: '#0066ff' },
      })],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, true);
    expect(r.variants[0].propsDelta.style?.padding).toBeUndefined();
  });

  it('accepts "inherit" length', () => {
    const raw = { variants: [makeVariant({ style: { padding: 'inherit' } })] };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, true);
    expect(r.variants[0].propsDelta.style?.padding).toBe('inherit');
  });
});

describe('isValidValue — css-gradient', () => {
  it('accepts linear-gradient using brand colors', () => {
    const raw = {
      variants: [makeVariant({
        style: { backgroundGradient: 'linear-gradient(45deg, #0066ff, #ff6600)' },
      })],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants[0].propsDelta.style?.backgroundGradient).toBeDefined();
  });

  it('accepts radial-gradient', () => {
    const raw = {
      variants: [makeVariant({
        style: { backgroundGradient: 'radial-gradient(circle, #0066ff, #ff6600)' },
      })],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, true);
    expect(r.variants[0].propsDelta.style?.backgroundGradient).toBeDefined();
  });

  it('accepts conic-gradient', () => {
    const raw = {
      variants: [makeVariant({
        style: { backgroundGradient: 'conic-gradient(#0066ff, #ff6600)' },
      })],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, true);
    expect(r.variants[0].propsDelta.style?.backgroundGradient).toBeDefined();
  });

  it('rejects non-gradient strings', () => {
    const raw = {
      variants: [makeVariant({
        style: {
          backgroundGradient: 'red',
          padding: '8rem 2rem',
        },
      })],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, true);
    expect(r.variants[0].propsDelta.style?.backgroundGradient).toBeUndefined();
  });

  it('rejects gradient with no brand color when brand-respect on', () => {
    const raw = {
      variants: [makeVariant({
        style: {
          backgroundGradient: 'linear-gradient(45deg, #abcdef, #fedcba)',
          padding: '8rem 2rem',
        },
      })],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants[0].propsDelta.style?.backgroundGradient).toBeUndefined();
    expect(r.diagnostics[0].droppedKeys.some((k) => k.includes('off-brand'))).toBe(true);
  });
});

describe('isValidValue — css-shadow', () => {
  it('accepts a typical box-shadow', () => {
    const raw = {
      variants: [
        makeVariant({
          elementStyles: {
            cta: { boxShadow: '0 4px 12px rgba(0,0,0,0.2)' },
          },
        }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants[0].propsDelta.elementStyles?.cta?.boxShadow).toBe('0 4px 12px rgba(0,0,0,0.2)');
  });

  it('accepts "none"', () => {
    const raw = {
      variants: [
        makeVariant({
          elementStyles: { cta: { boxShadow: 'none' } },
        }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants[0].propsDelta.elementStyles?.cta?.boxShadow).toBe('none');
  });

  it('accepts inset shadow', () => {
    const raw = {
      variants: [
        makeVariant({
          elementStyles: { cta: { boxShadow: 'inset 0 2px 4px #000' } },
        }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants[0].propsDelta.elementStyles?.cta?.boxShadow).toBe('inset 0 2px 4px #000');
  });

  it('rejects shadow longer than 200 chars', () => {
    const tooLong = '0 4px 12px ' + 'rgba(0,0,0,0.2),'.repeat(15);
    const raw = {
      variants: [
        makeVariant({
          elementStyles: {
            cta: {
              boxShadow: tooLong,
              padding: '12px',
            },
          },
        }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants[0].propsDelta.elementStyles?.cta?.boxShadow).toBeUndefined();
  });

  it('rejects shadow without rgb/hex/inset/none signal', () => {
    const raw = {
      variants: [
        makeVariant({
          elementStyles: {
            cta: {
              boxShadow: 'weirdkeyword',
              padding: '12px',
            },
          },
        }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants[0].propsDelta.elementStyles?.cta?.boxShadow).toBeUndefined();
  });
});

describe('isValidValue — enum (textAlign etc)', () => {
  it('accepts every enum value', () => {
    for (const align of ['left', 'center', 'right']) {
      const raw = {
        variants: [makeVariant({ style: { textAlign: align } })],
      };
      const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, true);
      expect(r.variants[0].propsDelta.style?.textAlign).toBe(align);
    }
  });
});

describe('Brand respect — fonts', () => {
  it('accepts brand heading font', () => {
    const raw = {
      variants: [
        makeVariant({
          elementStyles: { title: { fontFamily: 'Inter, sans-serif' } },
        }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants[0].propsDelta.elementStyles?.title?.fontFamily).toBe('Inter, sans-serif');
  });

  it('drops off-brand font when brand-respect on', () => {
    const raw = {
      variants: [
        makeVariant({
          elementStyles: {
            title: {
              fontFamily: '"Comic Sans MS", cursive',
              color: '#111111',
            },
          },
        }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants[0].propsDelta.elementStyles?.title?.fontFamily).toBeUndefined();
  });

  it('accepts system-ui everywhere', () => {
    const raw = {
      variants: [
        makeVariant({
          elementStyles: { title: { fontFamily: 'system-ui' } },
        }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants[0].propsDelta.elementStyles?.title?.fontFamily).toBe('system-ui');
  });

  it('accepts sans-serif fallback', () => {
    const raw = {
      variants: [
        makeVariant({
          elementStyles: { title: { fontFamily: 'sans-serif' } },
        }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants[0].propsDelta.elementStyles?.title?.fontFamily).toBe('sans-serif');
  });

  it('accepts off-brand font when exploreOutsideBrand=true', () => {
    const raw = {
      variants: [
        makeVariant({
          elementStyles: { title: { fontFamily: '"Comic Sans", cursive' } },
        }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, true);
    expect(r.variants[0].propsDelta.elementStyles?.title?.fontFamily).toBe('"Comic Sans", cursive');
  });
});

describe('Brand respect — border radius', () => {
  it('accepts 0 (sharp)', () => {
    const raw = {
      variants: [
        makeVariant({
          elementStyles: { cta: { borderRadius: '0' } },
        }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants[0].propsDelta.elementStyles?.cta?.borderRadius).toBe('0');
  });

  it('accepts pill (999px)', () => {
    const raw = {
      variants: [
        makeVariant({
          elementStyles: { cta: { borderRadius: '999px' } },
        }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants[0].propsDelta.elementStyles?.cta?.borderRadius).toBe('999px');
  });

  it('accepts very large pill values', () => {
    const raw = {
      variants: [
        makeVariant({
          elementStyles: { cta: { borderRadius: '9999px' } },
        }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants[0].propsDelta.elementStyles?.cta?.borderRadius).toBe('9999px');
  });

  it('accepts within ±50% of brand radius', () => {
    // brand radius = 8px → [4..12]
    const raw = {
      variants: [
        makeVariant({
          elementStyles: { cta: { borderRadius: '10px' } },
        }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants[0].propsDelta.elementStyles?.cta?.borderRadius).toBe('10px');
  });

  it('drops radius outside the brand range', () => {
    // 8px brand → 4..12. 50px is way outside but not pill.
    const raw = {
      variants: [
        makeVariant({
          elementStyles: {
            cta: { borderRadius: '50px', padding: '12px' },
          },
        }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants[0].propsDelta.elementStyles?.cta?.borderRadius).toBeUndefined();
  });

  it('allows anything when brand has no borderRadius set', () => {
    const noRadiusBrand: BrandStyleContext = { ...BRAND, borderRadius: undefined };
    const raw = {
      variants: [
        makeVariant({
          elementStyles: { cta: { borderRadius: '50px' } },
        }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, noRadiusBrand, false);
    expect(r.variants[0].propsDelta.elementStyles?.cta?.borderRadius).toBe('50px');
  });

  it('allows unparseable but valid CSS radius (e.g. percentage)', () => {
    const raw = {
      variants: [
        makeVariant({
          elementStyles: { cta: { borderRadius: '50%' } },
        }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.variants[0].propsDelta.elementStyles?.cta?.borderRadius).toBe('50%');
  });
});

describe('isOnBrandColor', () => {
  it('accepts named colors regardless of brand', () => {
    expect(isOnBrandColor('transparent', EMPTY_BRAND)).toBe(true);
    expect(isOnBrandColor('white', EMPTY_BRAND)).toBe(true);
    expect(isOnBrandColor('inherit', EMPTY_BRAND)).toBe(true);
    expect(isOnBrandColor('currentColor', EMPTY_BRAND)).toBe(true);
  });

  it('accepts brand primary hex', () => {
    expect(isOnBrandColor('#0066ff', BRAND)).toBe(true);
  });

  it('accepts brand accent hex', () => {
    expect(isOnBrandColor('#ff6600', BRAND)).toBe(true);
  });

  it('accepts neutral gray', () => {
    expect(isOnBrandColor('#888888', BRAND)).toBe(true);
  });

  it('accepts pure neutral 3-digit hex', () => {
    expect(isOnBrandColor('#555', BRAND)).toBe(true);
  });

  it('rejects off-brand saturated color', () => {
    expect(isOnBrandColor('#ff00ff', BRAND)).toBe(false);
  });

  it('rejects garbage string', () => {
    expect(isOnBrandColor('not-a-color', BRAND)).toBe(false);
  });

  it('accepts rgb that maps to brand color', () => {
    // #0066ff = rgb(0, 102, 255)
    expect(isOnBrandColor('rgb(0, 102, 255)', BRAND)).toBe(true);
  });

  it('rejects rgb that does not map to brand', () => {
    expect(isOnBrandColor('rgb(123, 45, 200)', BRAND)).toBe(false);
  });

  it('accepts neutral rgb (R≈G≈B)', () => {
    expect(isOnBrandColor('rgb(100, 100, 100)', BRAND)).toBe(true);
  });

  it('handles brand context with no defined colors', () => {
    // No brand colors means only neutrals + named pass
    expect(isOnBrandColor('#0066ff', EMPTY_BRAND)).toBe(false);
    expect(isOnBrandColor('#444444', EMPTY_BRAND)).toBe(true); // neutral
  });

  it('parses rgb with clipped 255+ channel values', () => {
    // #0066ff = rgb(0, 102, 255). Pass value > 255 to exercise Math.min clip.
    expect(isOnBrandColor('rgb(0, 102, 999)', BRAND)).toBe(true);
  });
});

describe('Diagnostics structure', () => {
  it('always returns one diagnostic per accepted variant', () => {
    const raw = {
      variants: [
        makeVariant({ style: { padding: '8rem 2rem' } }),
        makeVariant({ style: { padding: '6rem 2rem' } }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.diagnostics).toHaveLength(2);
    expect(r.diagnostics[0].index).toBe(0);
    expect(r.diagnostics[1].index).toBe(1);
  });

  it('preserves the original variant index in diagnostics', () => {
    const raw = {
      variants: [
        makeVariant({}), // empty → diagnostic only
        makeVariant({ style: { padding: '8rem 2rem' } }),
      ],
    };
    const r = validateStyleVariantsResponse(raw, HERO_STYLE_SURFACE, BRAND, false);
    expect(r.diagnostics.map((d) => d.index)).toEqual([0, 1]);
  });
});
