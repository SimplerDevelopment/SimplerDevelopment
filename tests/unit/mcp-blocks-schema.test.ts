// @vitest-environment node
/**
 * Unit tests for lib/mcp/blocks-schema.ts
 *
 * The module exports two constants that document the visual editor's block
 * schema for MCP clients:
 *   - BLOCKS_SCHEMA_REFERENCE — full markdown reference
 *   - BLOCKS_SCHEMA_TLDR     — short summary
 *
 * Both feed AI tool descriptions, so this suite locks in their shape:
 * exported types, non-empty content, presence of every block-type section,
 * presence of styling docs / authoring rules / worked examples, and a few
 * canonical-vs-legacy invariants the renderer relies on.
 */

import { describe, it, expect } from 'vitest';

import {
  BLOCKS_SCHEMA_REFERENCE,
  BLOCKS_SCHEMA_TLDR,
} from '@/lib/mcp/blocks-schema';

// ---------------------------------------------------------------------------
// BLOCKS_SCHEMA_REFERENCE — basics
// ---------------------------------------------------------------------------

describe('BLOCKS_SCHEMA_REFERENCE', () => {
  it('is a non-empty string', () => {
    expect(typeof BLOCKS_SCHEMA_REFERENCE).toBe('string');
    expect(BLOCKS_SCHEMA_REFERENCE.length).toBeGreaterThan(0);
  });

  it('is substantial (full reference, not a stub)', () => {
    // The reference doc is several hundred lines; assert at least ~2 KB so
    // accidental truncation surfaces in CI.
    expect(BLOCKS_SCHEMA_REFERENCE.length).toBeGreaterThan(2000);
  });

  it('opens with the canonical H1 title', () => {
    expect(BLOCKS_SCHEMA_REFERENCE.startsWith(
      '# SimplerDevelopment Visual Editor — Block Schema',
    )).toBe(true);
  });

  it('declares the BlockEditorData envelope shape', () => {
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('"blocks": Block[]');
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('"version": "1.0"');
  });

  it('documents the common Block fields', () => {
    for (const field of [
      '"id"',
      '"type"',
      '"order"',
      '"label"',
      '"anchor"',
      '"style"',
      '"elementStyles"',
    ]) {
      expect(BLOCKS_SCHEMA_REFERENCE).toContain(field);
    }
  });
});

// ---------------------------------------------------------------------------
// Styling docs
// ---------------------------------------------------------------------------

describe('BLOCKS_SCHEMA_REFERENCE — Styling section', () => {
  it('has a Styling H2 header', () => {
    expect(BLOCKS_SCHEMA_REFERENCE).toContain(
      '## Styling (style / elementStyles)',
    );
  });

  it('lists the core CSS-like style keys', () => {
    const keys = [
      'color',
      'backgroundColor',
      'backgroundGradient',
      'backgroundImage',
      'fontFamily',
      'fontSize',
      'fontWeight',
      'lineHeight',
      'letterSpacing',
      'textAlign',
      'textTransform',
      'textDecoration',
      'padding',
      'margin',
      'borderRadius',
      'borderWidth',
      'borderColor',
      'borderStyle',
      'width',
      'height',
      'minWidth',
      'minHeight',
      'maxWidth',
      'maxHeight',
      'display',
      'flexDirection',
      'justifyContent',
      'alignItems',
      'gap',
      'position',
      'zIndex',
      'opacity',
      'boxShadow',
      'overflow',
      'cursor',
      'customCSS',
    ];
    for (const key of keys) {
      expect(BLOCKS_SCHEMA_REFERENCE).toContain(key);
    }
  });

  it('mentions per-side border variants', () => {
    expect(BLOCKS_SCHEMA_REFERENCE).toMatch(/borderTop\*/);
    expect(BLOCKS_SCHEMA_REFERENCE).toMatch(/borderLeft\*/);
  });

  it('shows a hero elementStyles example with title/subtitle/description', () => {
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('"elementStyles": {');
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('"subtitle":');
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('"title":');
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('"description":');
  });
});

// ---------------------------------------------------------------------------
// Block-type sections
// ---------------------------------------------------------------------------

describe('BLOCKS_SCHEMA_REFERENCE — block-type sections', () => {
  // Each "### name" header in the reference doc maps to a block type the
  // renderer understands. Locking these in prevents accidental removal.
  const blockTypes = [
    'text',
    'heading',
    'image',
    'button',
    'spacer',
    'divider',
    'quote',
    'hero',
    'hero-slideshow',
    'cta',
    'stats',
    'testimonial',
    'services-grid',
    'card-grid',
    'timeline',
    'featured-content',
    'accordion',
    'tabs',
    'gallery',
    'marquee',
    'columns',
    'blog-posts',
    'video / youtube',
    'code',
    'html-render',
    'html-embed',
  ];

  it.each(blockTypes)('declares a "### %s" section', (type) => {
    expect(BLOCKS_SCHEMA_REFERENCE).toContain(`### ${type}`);
  });

  it('mentions every block type at least once in body text', () => {
    // Sanity: every type label also appears as a "type:" tag somewhere.
    for (const t of [
      'text',
      'heading',
      'image',
      'button',
      'spacer',
      'divider',
      'quote',
      'hero',
      'cta',
      'stats',
      'testimonial',
      'services-grid',
      'card-grid',
      'timeline',
      'featured-content',
      'accordion',
      'tabs',
      'gallery',
      'marquee',
      'columns',
      'blog-posts',
      'code',
      'html-render',
      'html-embed',
    ]) {
      expect(BLOCKS_SCHEMA_REFERENCE).toContain(`type:"${t}"`);
    }
  });
});

// ---------------------------------------------------------------------------
// Legacy aliases — renderer-supported back-compat
// ---------------------------------------------------------------------------

describe('BLOCKS_SCHEMA_REFERENCE — legacy aliases', () => {
  it('notes hero legacy aliases (headline/eyebrow/subheadline)', () => {
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('`headline` → title');
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('`eyebrow` → subtitle');
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('`subheadline` → description');
  });

  it('notes the stats stat-grid legacy alias', () => {
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('`type:"stat-grid"`');
  });

  it('notes the card-grid `body` legacy alias', () => {
    expect(BLOCKS_SCHEMA_REFERENCE).toContain(
      '`body` is accepted for card description',
    );
  });

  it('notes the timeline `{ label, body }` legacy step shape', () => {
    expect(BLOCKS_SCHEMA_REFERENCE).toContain(
      '`{ label, body }` is accepted',
    );
  });

  it('notes the text-block legacy `{ heading?, body? }` shape', () => {
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('{ heading?, body? }');
  });
});

// ---------------------------------------------------------------------------
// html-render coverage — the most schema-heavy section
// ---------------------------------------------------------------------------

describe('BLOCKS_SCHEMA_REFERENCE — html-render annotations', () => {
  it('documents all five template-annotation forms', () => {
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('`{{name}}`');
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('data-field="name"');
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('data-repeat="name"');
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('data-group="name"');
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('data-loop="posts"');
  });

  it('lists every HtmlRenderField type', () => {
    const fieldTypes = [
      '"text"',
      '"textarea"',
      '"number"',
      '"richtext"',
      '"boolean"',
      '"url"',
      '"image"',
      '"color"',
      '"select"',
      '"radio"',
      '"date"',
      '"datetime"',
      '"link"',
      '"post"',
      '"array"',
      '"group"',
      '"tab"',
    ];
    for (const t of fieldTypes) {
      expect(BLOCKS_SCHEMA_REFERENCE).toContain(t);
    }
  });

  it('documents conditional visibility operators', () => {
    for (const op of [
      '"eq"',
      '"neq"',
      '"in"',
      '"notIn"',
      '"truthy"',
      '"falsy"',
    ]) {
      expect(BLOCKS_SCHEMA_REFERENCE).toContain(op);
    }
  });

  it('documents HtmlRenderLoop options', () => {
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('source: "posts"');
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('"recent" | "oldest" | "title"');
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('exclude?: number[]');
  });

  it('mentions validation hints (required/min/max/pattern)', () => {
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('required?: boolean');
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('minLength?:');
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('maxLength?:');
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('pattern?:');
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('errorMessage?:');
  });

  it('documents the field-name regex constraint', () => {
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('^[a-zA-Z_][a-zA-Z0-9_-]*$');
  });

  it('includes worked examples (CTA, stats, post-loop, group/tabs/conditional)', () => {
    expect(BLOCKS_SCHEMA_REFERENCE).toContain(
      '#### Worked example — CTA card with link + image',
    );
    expect(BLOCKS_SCHEMA_REFERENCE).toContain(
      '#### Worked example — repeater (stats)',
    );
    expect(BLOCKS_SCHEMA_REFERENCE).toContain(
      '#### Worked example — dynamic post loop (related case studies)',
    );
    expect(BLOCKS_SCHEMA_REFERENCE).toContain(
      '#### Worked example — group + tabs + conditional',
    );
  });
});

// ---------------------------------------------------------------------------
// Authoring guidance + pitch-deck guidance
// ---------------------------------------------------------------------------

describe('BLOCKS_SCHEMA_REFERENCE — guidance sections', () => {
  it('has an Authoring guidance section', () => {
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('## Authoring guidance');
  });

  it('warns against emojis in favor of Material Icons', () => {
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('Material Icon names');
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('never emojis');
  });

  it('has Pitch-deck authoring section with pageSettings + customCss', () => {
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('## Pitch-deck authoring');
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('pageSettings?:');
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('customCss?:');
  });

  it('includes a fully styled multi-slide example', () => {
    expect(BLOCKS_SCHEMA_REFERENCE).toContain(
      '## Styled pitch-deck slide example',
    );
    // The example covers the canonical four slides.
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('"id": "slide-cover"');
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('"id": "slide-proof"');
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('"id": "slide-team"');
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('"id": "slide-audit"');
  });

  it('has a Minimal example section', () => {
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('## Minimal example');
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('"title": "About Us"');
  });
});

// ---------------------------------------------------------------------------
// BLOCKS_SCHEMA_TLDR
// ---------------------------------------------------------------------------

describe('BLOCKS_SCHEMA_TLDR', () => {
  it('is a non-empty string', () => {
    expect(typeof BLOCKS_SCHEMA_TLDR).toBe('string');
    expect(BLOCKS_SCHEMA_TLDR.length).toBeGreaterThan(0);
  });

  it('is short — a summary, not a duplicate of the full reference', () => {
    // Reference is ~30 KB; TLDR should be << 5 KB and much shorter.
    expect(BLOCKS_SCHEMA_TLDR.length).toBeLessThan(5000);
    expect(BLOCKS_SCHEMA_TLDR.length).toBeLessThan(
      BLOCKS_SCHEMA_REFERENCE.length / 5,
    );
  });

  it('mentions the BlockEditorData envelope', () => {
    expect(BLOCKS_SCHEMA_TLDR).toContain('blocks: Block[]');
    expect(BLOCKS_SCHEMA_TLDR).toContain('version: "1.0"');
  });

  it('mentions the most common block types', () => {
    for (const t of [
      'hero',
      'cta',
      'stats',
      'columns',
      'card-grid',
      'timeline',
      'services-grid',
      'featured-content',
      'testimonial',
      'accordion',
      'tabs',
      'gallery',
      'marquee',
      'hero-slideshow',
      'image',
      'heading',
      'text',
    ]) {
      expect(BLOCKS_SCHEMA_TLDR).toContain(t);
    }
  });

  it('mentions the canonical hero fields', () => {
    expect(BLOCKS_SCHEMA_TLDR).toContain('title');
    expect(BLOCKS_SCHEMA_TLDR).toContain('subtitle');
    expect(BLOCKS_SCHEMA_TLDR).toContain('description');
    expect(BLOCKS_SCHEMA_TLDR).toContain('ctaText/ctaLink');
  });

  it('mentions hero legacy aliases', () => {
    expect(BLOCKS_SCHEMA_TLDR).toContain('headline/eyebrow/subheadline');
  });

  it('mentions the stat-grid legacy alias', () => {
    expect(BLOCKS_SCHEMA_TLDR).toContain('stat-grid');
  });

  it('mentions card-grid optional subtitle', () => {
    expect(BLOCKS_SCHEMA_TLDR).toContain('subtitle');
    expect(BLOCKS_SCHEMA_TLDR).toContain('card-grid cards accept');
  });

  it('mentions timeline canonical fields and legacy', () => {
    expect(BLOCKS_SCHEMA_TLDR).toContain('timeline steps use { title, description }');
    expect(BLOCKS_SCHEMA_TLDR).toContain('legacy: label/body');
  });

  it('points readers at the full MCP resource', () => {
    expect(BLOCKS_SCHEMA_TLDR).toContain('blocks://schema');
  });

  it('mentions pitch-deck pageSettings + customCss', () => {
    expect(BLOCKS_SCHEMA_TLDR).toContain('pageSettings');
    expect(BLOCKS_SCHEMA_TLDR).toContain('customCss');
  });
});

// ---------------------------------------------------------------------------
// Cross-constant invariants
// ---------------------------------------------------------------------------

describe('blocks-schema module — cross-constant invariants', () => {
  it('exports both constants as distinct strings', () => {
    expect(BLOCKS_SCHEMA_REFERENCE).not.toBe(BLOCKS_SCHEMA_TLDR);
  });

  it('TLDR is a strict subset summary — both must mention "Block" / "blocks"', () => {
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('Block');
    expect(BLOCKS_SCHEMA_TLDR).toContain('Block');
    expect(BLOCKS_SCHEMA_REFERENCE).toContain('blocks');
    expect(BLOCKS_SCHEMA_TLDR).toContain('blocks');
  });

  it('both reference the canonical { id, type, order } common-field triple', () => {
    expect(BLOCKS_SCHEMA_REFERENCE).toMatch(/id.*type.*order/s);
    expect(BLOCKS_SCHEMA_TLDR).toMatch(/id, type, order/);
  });

  it('constants are immutable references (no template-literal recomputation)', async () => {
    // Importing twice should yield the exact same instance — these are
    // module-level string literals, not getters.
    const mod = await import('@/lib/mcp/blocks-schema');
    expect(mod.BLOCKS_SCHEMA_REFERENCE).toBe(BLOCKS_SCHEMA_REFERENCE);
    expect(mod.BLOCKS_SCHEMA_TLDR).toBe(BLOCKS_SCHEMA_TLDR);
  });

  it('does not contain raw emoji characters (Material Icons policy)', () => {
    // The docs explicitly forbid emoji in authored content — the reference
    // itself should follow the same rule. We allow normal Unicode like em-dashes
    // and arrows used in prose.
    // Loose check: no emoji-pictograph variation selectors.
    expect(BLOCKS_SCHEMA_REFERENCE).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(BLOCKS_SCHEMA_TLDR).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });
});
