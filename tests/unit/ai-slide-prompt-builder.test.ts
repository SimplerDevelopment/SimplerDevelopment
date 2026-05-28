// @vitest-environment node
/**
 * Unit tests for `buildSlideEditPrompt` in lib/ai/slide-prompt-builder.ts.
 * The function takes a theme + deck context (+ optional custom manifests) and
 * returns a single large prompt string. We mock `./block-schemas` so we can
 * control which BlockSchemas are present and exercise every branch of the
 * internal `formatProperty` and `formatBlockSchema` helpers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BlockSchema } from '@/lib/ai/block-schemas';

// -----------------------------------------------------------------------------
// Mock the block-schemas module so we can drive `getAllBlockSchemas` from tests.
// -----------------------------------------------------------------------------
const getAllBlockSchemasMock = vi.fn<(customManifests?: unknown) => BlockSchema[]>();

vi.mock('@/lib/ai/block-schemas', () => ({
  getAllBlockSchemas: (m?: unknown) => getAllBlockSchemasMock(m),
}));

// Re-import the SUT after the mock is registered.
import { buildSlideEditPrompt } from '@/lib/ai/slide-prompt-builder';

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------
const baseTheme = {
  primaryColor: '#111111',
  accentColor: '#22aa22',
  backgroundColor: '#ffffff',
  textColor: '#000000',
  headingFont: 'Inter',
  bodyFont: 'Georgia',
  // extra fields the type may carry; not referenced by the builder
} as unknown as Parameters<typeof buildSlideEditPrompt>[0];

const simpleHeadingSchema: BlockSchema = {
  type: 'heading',
  label: 'Heading',
  category: 'Basic',
  description: 'Section title',
  properties: {
    content: { type: 'string', required: true, description: 'The heading text' },
    level: {
      type: 'enum',
      required: true,
      enumValues: ['1', '2', '3'],
      default: '1',
      description: 'Heading level',
    },
    alignment: {
      type: 'enum',
      enumValues: ['left', 'center', 'right'],
      default: 'left',
    },
  },
  styledElements: ['title', 'subtitle'],
};

const allTypesSchema: BlockSchema = {
  type: 'kitchen-sink',
  label: 'Kitchen Sink',
  category: 'Advanced',
  description: 'Every property type',
  properties: {
    str: { type: 'string' },
    num: { type: 'number', required: true },
    bool: { type: 'boolean', default: false },
    color: { type: 'color' },
    link: { type: 'url' },
    img: { type: 'image' },
    items: { type: 'array' },
    obj: { type: 'object' }, // falls through to default "string" branch
    pickOne: { type: 'enum', enumValues: ['a', 'b', 'c'] },
    richtext: { type: 'richtext' }, // also default "string" branch
  },
  // no styledElements
};

beforeEach(() => {
  getAllBlockSchemasMock.mockReset();
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------
describe('buildSlideEditPrompt', () => {
  it('passes customManifests through to getAllBlockSchemas', () => {
    getAllBlockSchemasMock.mockReturnValue([simpleHeadingSchema]);
    const manifests = [{ type: 'foo' }] as never;
    buildSlideEditPrompt(
      baseTheme,
      {
        title: 'Deck',
        allSlides: [{ index: 0, label: 'Intro' }],
        currentSlideIndex: 0,
      },
      manifests,
    );
    expect(getAllBlockSchemasMock).toHaveBeenCalledTimes(1);
    expect(getAllBlockSchemasMock).toHaveBeenCalledWith(manifests);
  });

  it('returns a string containing core deck-context, theme, and rules sections', () => {
    getAllBlockSchemasMock.mockReturnValue([simpleHeadingSchema]);
    const out = buildSlideEditPrompt(baseTheme, {
      title: 'My Deck',
      description: 'A deck about decks',
      allSlides: [
        { index: 0, label: 'Cover' },
        { index: 1, label: 'Pitch' },
      ],
      currentSlideIndex: 1,
    });

    expect(typeof out).toBe('string');
    // Header / intro
    expect(out).toContain('You are an expert pitch deck editor');
    expect(out).toContain('Respond with valid JSON only');

    // Deck context
    expect(out).toContain('Title: "My Deck"');
    expect(out).toContain('Description: A deck about decks');
    expect(out).toContain('1. Cover');
    expect(out).toContain('2. Pitch ← (CURRENT)');

    // Theme
    expect(out).toContain('Primary Color: #111111');
    expect(out).toContain('Accent Color: #22aa22');
    expect(out).toContain('Background Color: #ffffff');
    expect(out).toContain('Text Color: #000000');
    expect(out).toContain('Heading Font: Inter');
    expect(out).toContain('Body Font: Georgia');

    // Theme value substituted into the elementStyles example
    expect(out).toContain('"color": "#111111"');

    // Sections / rules anchors
    expect(out).toContain('# Block Catalog');
    expect(out).toContain('# Styling System');
    expect(out).toContain('# Rules');
    expect(out).toContain('14. When in doubt');
  });

  it('omits the description line when description is missing/null', () => {
    getAllBlockSchemasMock.mockReturnValue([simpleHeadingSchema]);
    const out1 = buildSlideEditPrompt(baseTheme, {
      title: 'Untitled',
      allSlides: [{ index: 0, label: 'Only' }],
      currentSlideIndex: 0,
    });
    expect(out1).not.toContain('Description:');

    const out2 = buildSlideEditPrompt(baseTheme, {
      title: 'Untitled',
      description: null,
      allSlides: [{ index: 0, label: 'Only' }],
      currentSlideIndex: 0,
    });
    expect(out2).not.toContain('Description:');
  });

  it('renders contentSummary and (truncated) notes on slide outline rows', () => {
    getAllBlockSchemasMock.mockReturnValue([simpleHeadingSchema]);
    const longNote = 'x'.repeat(160); // > 150 -> should be truncated with ellipsis
    const shortNote = 'a short note';
    const out = buildSlideEditPrompt(baseTheme, {
      title: 'Deck',
      allSlides: [
        { index: 0, label: 'Cover', contentSummary: 'A cool cover', notes: longNote },
        { index: 1, label: 'Body', notes: shortNote },
        { index: 2, label: 'Closing' },
      ],
      currentSlideIndex: 0,
    });

    expect(out).toContain('Content: A cool cover');
    // Long note truncated to 150 chars + ellipsis
    expect(out).toContain('Notes: ' + 'x'.repeat(150) + '...');
    // Short note kept verbatim, no ellipsis
    expect(out).toContain('Notes: a short note');
    expect(out).not.toContain('a short note...');
    // Slide without contentSummary or notes still appears
    expect(out).toContain('3. Closing');
  });

  it('marks the current slide with the ← (CURRENT) tag exactly once', () => {
    getAllBlockSchemasMock.mockReturnValue([simpleHeadingSchema]);
    const out = buildSlideEditPrompt(baseTheme, {
      title: 'Deck',
      allSlides: [
        { index: 0, label: 'A' },
        { index: 1, label: 'B' },
        { index: 2, label: 'C' },
      ],
      currentSlideIndex: 2,
    });
    expect(out).toContain('3. C ← (CURRENT)');
    expect(out.match(/← \(CURRENT\)/g)).toHaveLength(1);
  });

  it('omits brand section entirely when brandInfo is missing', () => {
    getAllBlockSchemasMock.mockReturnValue([simpleHeadingSchema]);
    const out = buildSlideEditPrompt(baseTheme, {
      title: 'Deck',
      allSlides: [{ index: 0, label: 'A' }],
      currentSlideIndex: 0,
    });
    expect(out).not.toContain('# Brand Identity');
  });

  it('omits brand section when brandInfo exists but has no recognized fields', () => {
    getAllBlockSchemasMock.mockReturnValue([simpleHeadingSchema]);
    // headingFont/bodyFont are not surfaced into the brand section by the builder
    const out = buildSlideEditPrompt(baseTheme, {
      title: 'Deck',
      allSlides: [{ index: 0, label: 'A' }],
      currentSlideIndex: 0,
      brandInfo: { headingFont: 'X', bodyFont: 'Y' },
    });
    expect(out).not.toContain('# Brand Identity');
  });

  it('includes only the brand parts that are present', () => {
    getAllBlockSchemasMock.mockReturnValue([simpleHeadingSchema]);
    const out = buildSlideEditPrompt(baseTheme, {
      title: 'Deck',
      allSlides: [{ index: 0, label: 'A' }],
      currentSlideIndex: 0,
      brandInfo: { logoText: 'AcmeCo', primaryColor: '#ff0000' },
    });
    expect(out).toContain('# Brand Identity');
    expect(out).toContain('Company: AcmeCo');
    expect(out).toContain('Brand Primary: #ff0000');
    expect(out).not.toContain('Brand Accent:');
  });

  it('includes all three brand parts when fully populated', () => {
    getAllBlockSchemasMock.mockReturnValue([simpleHeadingSchema]);
    const out = buildSlideEditPrompt(baseTheme, {
      title: 'Deck',
      allSlides: [{ index: 0, label: 'A' }],
      currentSlideIndex: 0,
      brandInfo: { logoText: 'AcmeCo', primaryColor: '#ff0000', accentColor: '#00ff00' },
    });
    expect(out).toContain('Company: AcmeCo');
    expect(out).toContain('Brand Primary: #ff0000');
    expect(out).toContain('Brand Accent: #00ff00');
  });

  it('groups block schemas by category and emits a section heading per category', () => {
    getAllBlockSchemasMock.mockReturnValue([
      simpleHeadingSchema, // Basic
      { ...simpleHeadingSchema, type: 'text', label: 'Text', description: 'paragraph' }, // Basic
      allTypesSchema, // Advanced
    ]);
    const out = buildSlideEditPrompt(baseTheme, {
      title: 'Deck',
      allSlides: [{ index: 0, label: 'A' }],
      currentSlideIndex: 0,
    });
    expect(out).toContain('### Basic Blocks');
    expect(out).toContain('### Advanced Blocks');
    expect(out).toContain('## heading (Heading) — Section title');
    expect(out).toContain('## text (Text) — paragraph');
    expect(out).toContain('## kitchen-sink (Kitchen Sink) — Every property type');
  });

  it('formats every PropertySchema type variant inside the catalog', () => {
    getAllBlockSchemasMock.mockReturnValue([allTypesSchema]);
    const out = buildSlideEditPrompt(baseTheme, {
      title: 'Deck',
      allSlides: [{ index: 0, label: 'A' }],
      currentSlideIndex: 0,
    });

    // enum with values
    expect(out).toContain('"pickOne": "a" | "b" | "c"');
    // array
    expect(out).toContain('"items": [...]');
    // color
    expect(out).toContain('"color": "#hex"');
    // url
    expect(out).toContain('"link": "https://..."');
    // image (also url-shaped)
    expect(out).toContain('"img": "https://..."');
    // number
    expect(out).toContain('"num": number');
    // boolean
    expect(out).toContain('"bool": true | false');
    // string -> "string"
    expect(out).toContain('"str": "string"');
    // object / richtext fall through to the default "string" branch
    expect(out).toContain('"obj": "string"');
    expect(out).toContain('"richtext": "string"');
  });

  it('appends REQUIRED, default, and description metadata to property lines', () => {
    getAllBlockSchemasMock.mockReturnValue([simpleHeadingSchema]);
    const out = buildSlideEditPrompt(baseTheme, {
      title: 'Deck',
      allSlides: [{ index: 0, label: 'A' }],
      currentSlideIndex: 0,
    });
    // content: required + description
    expect(out).toContain('"content": "string"  // REQUIRED, The heading text');
    // level: required + default + description
    expect(out).toContain(
      '"level": "1" | "2" | "3"  // REQUIRED, default: "1", Heading level',
    );
    // alignment: default only (no required, no description)
    expect(out).toContain('"alignment": "left" | "center" | "right"  // default: "left"');
  });

  it('omits the metadata comment when a property has no flags', () => {
    getAllBlockSchemasMock.mockReturnValue([
      {
        type: 'plain',
        label: 'Plain',
        category: 'Basic',
        description: 'Bare',
        properties: {
          bare: { type: 'string' },
        },
      },
    ]);
    const out = buildSlideEditPrompt(baseTheme, {
      title: 'Deck',
      allSlides: [{ index: 0, label: 'A' }],
      currentSlideIndex: 0,
    });
    // The bare property should have no trailing "  //" comment.
    const bareLine = out
      .split('\n')
      .find((l) => l.includes('"bare":'));
    expect(bareLine).toBeDefined();
    expect(bareLine!).not.toContain('//');
  });

  it('emits "Styleable elements" line when schema declares styledElements', () => {
    getAllBlockSchemasMock.mockReturnValue([simpleHeadingSchema]);
    const out = buildSlideEditPrompt(baseTheme, {
      title: 'Deck',
      allSlides: [{ index: 0, label: 'A' }],
      currentSlideIndex: 0,
    });
    expect(out).toContain('Styleable elements (via elementStyles): title, subtitle');
  });

  it('omits "Styleable elements" line when schema has no styledElements', () => {
    getAllBlockSchemasMock.mockReturnValue([allTypesSchema]); // no styledElements
    const out = buildSlideEditPrompt(baseTheme, {
      title: 'Deck',
      allSlides: [{ index: 0, label: 'A' }],
      currentSlideIndex: 0,
    });
    // Only the explanatory line near `elementStyles` may mention "Styleable",
    // but our schema-emitted line must not appear:
    expect(out).not.toContain('Styleable elements (via elementStyles):');
  });

  it('omits "Styleable elements" line when styledElements is an empty array', () => {
    getAllBlockSchemasMock.mockReturnValue([
      { ...simpleHeadingSchema, styledElements: [] },
    ]);
    const out = buildSlideEditPrompt(baseTheme, {
      title: 'Deck',
      allSlides: [{ index: 0, label: 'A' }],
      currentSlideIndex: 0,
    });
    expect(out).not.toContain('Styleable elements (via elementStyles):');
  });

  it('handles an empty schema list without throwing', () => {
    getAllBlockSchemasMock.mockReturnValue([]);
    const out = buildSlideEditPrompt(baseTheme, {
      title: 'Empty Catalog Deck',
      allSlides: [{ index: 0, label: 'A' }],
      currentSlideIndex: 0,
    });
    expect(out).toContain('# Block Catalog');
    // No category headings present
    expect(out).not.toMatch(/### .+ Blocks/);
    // Still includes the styling and rules sections
    expect(out).toContain('# Styling System');
    expect(out).toContain('# Rules');
  });

  it('handles an empty allSlides outline gracefully', () => {
    getAllBlockSchemasMock.mockReturnValue([simpleHeadingSchema]);
    const out = buildSlideEditPrompt(baseTheme, {
      title: 'Deck',
      allSlides: [],
      currentSlideIndex: 0,
    });
    expect(out).toContain('Title: "Deck"');
    // No "← (CURRENT)" tag, no slide rows
    expect(out).not.toContain('← (CURRENT)');
  });

  it('does not call getAllBlockSchemas with manifests when none provided', () => {
    getAllBlockSchemasMock.mockReturnValue([simpleHeadingSchema]);
    buildSlideEditPrompt(baseTheme, {
      title: 'Deck',
      allSlides: [{ index: 0, label: 'A' }],
      currentSlideIndex: 0,
    });
    expect(getAllBlockSchemasMock).toHaveBeenCalledWith(undefined);
  });
});
