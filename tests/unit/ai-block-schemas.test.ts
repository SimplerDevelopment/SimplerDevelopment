// @vitest-environment node
/**
 * Unit tests for lib/ai/block-schemas.ts
 *
 * Covers:
 *   - getBuiltInBlockSchemas (built-in schema registry shape + content)
 *   - manifestToBlockSchema (custom manifest → BlockSchema conversion)
 *   - getAllBlockSchemas (merged built-in + custom, with dedupe on `type`)
 */

import { describe, it, expect } from 'vitest';

import {
  getBuiltInBlockSchemas,
  manifestToBlockSchema,
  getAllBlockSchemas,
  type BlockSchema,
  type PropertySchema,
} from '@/lib/ai/block-schemas';

import type { ComponentManifestEntry } from '@/types/visual-editor';

// ---------------------------------------------------------------------------
// getBuiltInBlockSchemas
// ---------------------------------------------------------------------------

describe('getBuiltInBlockSchemas', () => {
  it('returns a non-empty array', () => {
    const schemas = getBuiltInBlockSchemas();
    expect(Array.isArray(schemas)).toBe(true);
    expect(schemas.length).toBeGreaterThan(0);
  });

  it('returns the same reference on subsequent calls (module-level constant)', () => {
    const a = getBuiltInBlockSchemas();
    const b = getBuiltInBlockSchemas();
    expect(a).toBe(b);
  });

  it('every schema has the canonical BlockSchema shape', () => {
    for (const schema of getBuiltInBlockSchemas()) {
      expect(typeof schema.type).toBe('string');
      expect(schema.type.length).toBeGreaterThan(0);
      expect(typeof schema.label).toBe('string');
      expect(schema.label.length).toBeGreaterThan(0);
      expect(typeof schema.category).toBe('string');
      expect(schema.category.length).toBeGreaterThan(0);
      expect(typeof schema.description).toBe('string');
      expect(schema.description.length).toBeGreaterThan(0);
      expect(schema.properties).toBeTypeOf('object');
      expect(schema.properties).not.toBeNull();
    }
  });

  it('block `type` values are unique', () => {
    const types = getBuiltInBlockSchemas().map((s) => s.type);
    const dedup = new Set(types);
    expect(dedup.size).toBe(types.length);
  });

  it('uses only known PropertySchema.type values across all properties', () => {
    const allowed = new Set<PropertySchema['type']>([
      'string',
      'number',
      'boolean',
      'enum',
      'color',
      'url',
      'richtext',
      'image',
      'array',
      'object',
    ]);
    for (const schema of getBuiltInBlockSchemas()) {
      for (const [, prop] of Object.entries(schema.properties)) {
        expect(allowed.has(prop.type)).toBe(true);
      }
    }
  });

  it('every enum-typed property declares enumValues', () => {
    for (const schema of getBuiltInBlockSchemas()) {
      for (const [name, prop] of Object.entries(schema.properties)) {
        if (prop.type === 'enum') {
          expect(
            Array.isArray(prop.enumValues),
            `${schema.type}.${name} should declare enumValues`,
          ).toBe(true);
          expect((prop.enumValues ?? []).length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('includes core block types: heading, text, image, button, hero', () => {
    const types = new Set(getBuiltInBlockSchemas().map((s) => s.type));
    expect(types.has('heading')).toBe(true);
    expect(types.has('text')).toBe(true);
    expect(types.has('image')).toBe(true);
    expect(types.has('button')).toBe(true);
    expect(types.has('hero')).toBe(true);
  });

  it('covers all expected categories', () => {
    const cats = new Set(getBuiltInBlockSchemas().map((s) => s.category));
    expect(cats.has('Basic')).toBe(true);
    expect(cats.has('Media')).toBe(true);
    expect(cats.has('Layout')).toBe(true);
    expect(cats.has('Components')).toBe(true);
    expect(cats.has('eCommerce')).toBe(true);
    expect(cats.has('Interactive')).toBe(true);
    expect(cats.has('Email')).toBe(true);
  });

  it('heading schema declares required content + level with valid enum values', () => {
    const heading = getBuiltInBlockSchemas().find((s) => s.type === 'heading') as BlockSchema;
    expect(heading).toBeDefined();
    expect(heading.properties.content.required).toBe(true);
    expect(heading.properties.content.type).toBe('string');
    expect(heading.properties.level.required).toBe(true);
    expect(heading.properties.level.type).toBe('enum');
    expect(heading.properties.level.enumValues).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(heading.properties.alignment.default).toBe('left');
  });

  it('hero schema declares styledElements', () => {
    const hero = getBuiltInBlockSchemas().find((s) => s.type === 'hero') as BlockSchema;
    expect(hero).toBeDefined();
    expect(Array.isArray(hero.styledElements)).toBe(true);
    expect(hero.styledElements).toContain('title');
    expect(hero.styledElements).toContain('cta');
  });

  it('cta schema declares required title + primaryButtonText + primaryButtonUrl', () => {
    const cta = getBuiltInBlockSchemas().find((s) => s.type === 'cta') as BlockSchema;
    expect(cta).toBeDefined();
    expect(cta.properties.title.required).toBe(true);
    expect(cta.properties.primaryButtonText.required).toBe(true);
    expect(cta.properties.primaryButtonUrl.required).toBe(true);
    expect(cta.properties.backgroundStyle.default).toBe('gradient');
  });

  it('gallery schema declares array images with nested items shape', () => {
    const gallery = getBuiltInBlockSchemas().find((s) => s.type === 'gallery') as BlockSchema;
    expect(gallery).toBeDefined();
    expect(gallery.properties.images.type).toBe('array');
    expect(gallery.properties.images.required).toBe(true);
    // items is a Record<string, PropertySchema> (not a single PropertySchema)
    const items = gallery.properties.images.items as Record<string, PropertySchema>;
    expect(items).toBeDefined();
    expect(items.id.required).toBe(true);
    expect(items.url.required).toBe(true);
    expect(items.alt.required).toBe(true);
    // caption is optional
    expect(items.caption.required).toBeUndefined();
  });

  it('columns schema declares required columns array with nested column fields', () => {
    const columns = getBuiltInBlockSchemas().find((s) => s.type === 'columns') as BlockSchema;
    expect(columns).toBeDefined();
    expect(columns.properties.columns.type).toBe('array');
    expect(columns.properties.columns.required).toBe(true);
    expect(columns.properties.stackOnMobile.default).toBe(true);
  });

  it('section schema accepts a wide range of style/layout properties', () => {
    const section = getBuiltInBlockSchemas().find((s) => s.type === 'section') as BlockSchema;
    expect(section).toBeDefined();
    expect(section.properties.blocks.required).toBe(true);
    expect(section.properties.backgroundColor.type).toBe('color');
    expect(section.properties.backgroundImage.type).toBe('url');
    expect(section.properties.htmlTag.default).toBe('section');
  });

  it('booking and survey blocks live in Interactive category with required slug', () => {
    const schemas = getBuiltInBlockSchemas();
    const booking = schemas.find((s) => s.type === 'booking') as BlockSchema;
    const survey = schemas.find((s) => s.type === 'survey') as BlockSchema;
    expect(booking.category).toBe('Interactive');
    expect(survey.category).toBe('Interactive');
    expect(booking.properties.slug.required).toBe(true);
    expect(survey.properties.slug.required).toBe(true);
    expect(booking.properties.height.default).toBe('700px');
    expect(survey.properties.height.default).toBe('700px');
  });

  it('email-footer schema includes socialLinks array with platform/url items', () => {
    const footer = getBuiltInBlockSchemas().find(
      (s) => s.type === 'email-footer',
    ) as BlockSchema;
    expect(footer).toBeDefined();
    expect(footer.properties.socialLinks.type).toBe('array');
    const items = footer.properties.socialLinks.items as Record<string, PropertySchema>;
    expect(items.platform.type).toBe('string');
    expect(items.url.type).toBe('url');
  });

  it('product-grid sort enum has expected values', () => {
    const grid = getBuiltInBlockSchemas().find((s) => s.type === 'product-grid') as BlockSchema;
    expect(grid).toBeDefined();
    expect(grid.properties.sort.enumValues).toEqual([
      'newest',
      'price_asc',
      'price_desc',
      'featured',
    ]);
    expect(grid.properties.sort.default).toBe('newest');
  });

  it('blog-posts limit has a numeric default of 3', () => {
    const blog = getBuiltInBlockSchemas().find((s) => s.type === 'blog-posts') as BlockSchema;
    expect(blog).toBeDefined();
    expect(blog.properties.limit.type).toBe('number');
    expect(blog.properties.limit.default).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// manifestToBlockSchema
// ---------------------------------------------------------------------------

describe('manifestToBlockSchema', () => {
  it('converts a basic manifest with string inputs into a BlockSchema', () => {
    const manifest: ComponentManifestEntry = {
      type: 'custom-banner',
      label: 'Custom Banner',
      icon: 'banner',
      category: 'Custom',
      description: 'A custom banner block',
      inputs: [
        {
          name: 'title',
          label: 'Title',
          type: 'string',
          required: true,
        },
        {
          name: 'subtitle',
          label: 'Subtitle',
          type: 'string',
          defaultValue: 'Welcome',
        },
      ],
      defaultProps: {},
    };

    const result = manifestToBlockSchema(manifest);

    expect(result.type).toBe('custom-banner');
    expect(result.label).toBe('Custom Banner');
    expect(result.category).toBe('Custom');
    expect(result.description).toBe('A custom banner block');
    expect(result.properties.title.type).toBe('string');
    expect(result.properties.title.required).toBe(true);
    expect(result.properties.title.description).toBe('Title');
    expect(result.properties.subtitle.type).toBe('string');
    expect(result.properties.subtitle.default).toBe('Welcome');
  });

  it('maps PropSchemaType "list" to PropertySchema type "array"', () => {
    const manifest: ComponentManifestEntry = {
      type: 'list-block',
      label: 'List Block',
      icon: 'list',
      category: 'Custom',
      description: 'A block with a list input',
      inputs: [
        {
          name: 'items',
          label: 'Items',
          type: 'list',
          required: true,
        },
      ],
      defaultProps: {},
    };

    const result = manifestToBlockSchema(manifest);
    expect(result.properties.items.type).toBe('array');
    expect(result.properties.items.required).toBe(true);
  });

  it('passes through non-list input types verbatim (number/boolean/enum/color/url/richtext/image)', () => {
    const manifest: ComponentManifestEntry = {
      type: 'kitchen-sink',
      label: 'Kitchen Sink',
      icon: 'icon',
      category: 'Custom',
      description: 'Many input types',
      inputs: [
        { name: 'count', label: 'Count', type: 'number' },
        { name: 'visible', label: 'Visible', type: 'boolean' },
        { name: 'color', label: 'Color', type: 'color' },
        { name: 'href', label: 'Href', type: 'url' },
        { name: 'body', label: 'Body', type: 'richtext' },
        { name: 'photo', label: 'Photo', type: 'image' },
        {
          name: 'mode',
          label: 'Mode',
          type: 'enum',
          enumOptions: [
            { label: 'Light', value: 'light' },
            { label: 'Dark', value: 'dark' },
          ],
        },
      ],
      defaultProps: {},
    };

    const result = manifestToBlockSchema(manifest);
    expect(result.properties.count.type).toBe('number');
    expect(result.properties.visible.type).toBe('boolean');
    expect(result.properties.color.type).toBe('color');
    expect(result.properties.href.type).toBe('url');
    expect(result.properties.body.type).toBe('richtext');
    expect(result.properties.photo.type).toBe('image');
    expect(result.properties.mode.type).toBe('enum');
    expect(result.properties.mode.enumValues).toEqual(['light', 'dark']);
  });

  it('maps enumOptions to enumValues by extracting `.value`', () => {
    const manifest: ComponentManifestEntry = {
      type: 'enum-block',
      label: 'Enum Block',
      icon: 'icon',
      category: 'Custom',
      description: '',
      inputs: [
        {
          name: 'choice',
          label: 'Choice',
          type: 'enum',
          enumOptions: [
            { label: 'A', value: 'a' },
            { label: 'B', value: 'b' },
            { label: 'C', value: 'c' },
          ],
        },
      ],
      defaultProps: {},
    };

    const result = manifestToBlockSchema(manifest);
    expect(result.properties.choice.enumValues).toEqual(['a', 'b', 'c']);
  });

  it('leaves enumValues undefined when enumOptions is absent', () => {
    const manifest: ComponentManifestEntry = {
      type: 'no-enum',
      label: 'No Enum',
      icon: 'icon',
      category: 'Custom',
      description: '',
      inputs: [{ name: 'name', label: 'Name', type: 'string' }],
      defaultProps: {},
    };

    const result = manifestToBlockSchema(manifest);
    expect(result.properties.name.enumValues).toBeUndefined();
  });

  it('produces an empty properties object when inputs[] is empty', () => {
    const manifest: ComponentManifestEntry = {
      type: 'empty',
      label: 'Empty',
      icon: 'icon',
      category: 'Custom',
      description: '',
      inputs: [],
      defaultProps: {},
    };

    const result = manifestToBlockSchema(manifest);
    expect(result.properties).toEqual({});
  });

  it('preserves defaultValue verbatim (including falsy values like false / 0 / "")', () => {
    const manifest: ComponentManifestEntry = {
      type: 'falsy-defaults',
      label: 'Falsy Defaults',
      icon: 'icon',
      category: 'Custom',
      description: '',
      inputs: [
        { name: 'flag', label: 'Flag', type: 'boolean', defaultValue: false },
        { name: 'zero', label: 'Zero', type: 'number', defaultValue: 0 },
        { name: 'empty', label: 'Empty', type: 'string', defaultValue: '' },
      ],
      defaultProps: {},
    };

    const result = manifestToBlockSchema(manifest);
    expect(result.properties.flag.default).toBe(false);
    expect(result.properties.zero.default).toBe(0);
    expect(result.properties.empty.default).toBe('');
  });

  it('uses input.label as the property description', () => {
    const manifest: ComponentManifestEntry = {
      type: 'labels',
      label: 'Labels',
      icon: 'icon',
      category: 'Custom',
      description: '',
      inputs: [{ name: 'foo', label: 'A friendly label for foo', type: 'string' }],
      defaultProps: {},
    };

    const result = manifestToBlockSchema(manifest);
    expect(result.properties.foo.description).toBe('A friendly label for foo');
  });

  it('does not include styledElements (custom manifests do not provide them)', () => {
    const manifest: ComponentManifestEntry = {
      type: 'no-styled',
      label: 'No Styled',
      icon: 'icon',
      category: 'Custom',
      description: '',
      inputs: [{ name: 'x', label: 'X', type: 'string' }],
      defaultProps: {},
    };

    const result = manifestToBlockSchema(manifest);
    expect(result.styledElements).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getAllBlockSchemas
// ---------------------------------------------------------------------------

describe('getAllBlockSchemas', () => {
  it('returns just built-ins when customManifests is omitted', () => {
    const all = getAllBlockSchemas();
    const builtins = getBuiltInBlockSchemas();
    expect(all.length).toBe(builtins.length);
    expect(all.map((s) => s.type)).toEqual(builtins.map((s) => s.type));
  });

  it('returns just built-ins when customManifests is undefined explicitly', () => {
    const all = getAllBlockSchemas(undefined);
    const builtins = getBuiltInBlockSchemas();
    expect(all.length).toBe(builtins.length);
  });

  it('returns just built-ins when customManifests is an empty array', () => {
    const all = getAllBlockSchemas([]);
    expect(all.length).toBe(getBuiltInBlockSchemas().length);
  });

  it('returns a fresh array each call (does not leak the internal constant)', () => {
    const a = getAllBlockSchemas();
    const b = getAllBlockSchemas();
    expect(a).not.toBe(b);
    // But values should still match
    expect(a.map((s) => s.type)).toEqual(b.map((s) => s.type));
  });

  it('mutating the returned array does not affect subsequent calls', () => {
    const a = getAllBlockSchemas();
    const originalLength = a.length;
    a.push({
      type: 'mutated',
      label: 'Mutated',
      category: 'Test',
      description: 'should not leak',
      properties: {},
    });
    const b = getAllBlockSchemas();
    expect(b.length).toBe(originalLength);
    expect(b.find((s) => s.type === 'mutated')).toBeUndefined();
  });

  it('appends a brand-new custom manifest after built-ins', () => {
    const customManifest: ComponentManifestEntry = {
      type: 'totally-new-block-xyz',
      label: 'Totally New',
      icon: 'icon',
      category: 'Custom',
      description: 'A new block type that does not exist as built-in',
      inputs: [{ name: 'title', label: 'Title', type: 'string', required: true }],
      defaultProps: {},
    };

    const all = getAllBlockSchemas([customManifest]);
    const builtins = getBuiltInBlockSchemas();
    expect(all.length).toBe(builtins.length + 1);
    expect(all[all.length - 1].type).toBe('totally-new-block-xyz');
  });

  it('does NOT duplicate a custom manifest whose `type` already exists as built-in', () => {
    // "heading" is a built-in
    const overrideManifest: ComponentManifestEntry = {
      type: 'heading',
      label: 'Custom Heading Override',
      icon: 'icon',
      category: 'Custom',
      description: 'Should be ignored because built-in heading exists',
      inputs: [{ name: 'foo', label: 'Foo', type: 'string' }],
      defaultProps: {},
    };

    const all = getAllBlockSchemas([overrideManifest]);
    const builtins = getBuiltInBlockSchemas();
    expect(all.length).toBe(builtins.length);

    const headingEntries = all.filter((s) => s.type === 'heading');
    expect(headingEntries.length).toBe(1);

    // The built-in label should win, not the custom one
    expect(headingEntries[0].label).toBe('Heading');
    expect(headingEntries[0].label).not.toBe('Custom Heading Override');
  });

  it('mixes accepted custom manifests with skipped duplicate manifests in one call', () => {
    const manifests: ComponentManifestEntry[] = [
      {
        type: 'heading', // duplicate, should be skipped
        label: 'Dup',
        icon: 'icon',
        category: 'Custom',
        description: '',
        inputs: [],
        defaultProps: {},
      },
      {
        type: 'first-new-block',
        label: 'First New',
        icon: 'icon',
        category: 'Custom',
        description: '',
        inputs: [],
        defaultProps: {},
      },
      {
        type: 'second-new-block',
        label: 'Second New',
        icon: 'icon',
        category: 'Custom',
        description: '',
        inputs: [],
        defaultProps: {},
      },
    ];

    const all = getAllBlockSchemas(manifests);
    const builtins = getBuiltInBlockSchemas();
    expect(all.length).toBe(builtins.length + 2);

    const types = all.map((s) => s.type);
    expect(types).toContain('first-new-block');
    expect(types).toContain('second-new-block');
    // Still exactly one heading
    expect(types.filter((t) => t === 'heading').length).toBe(1);
  });

  it('when two custom manifests share the same new `type`, the second is suppressed by the first', () => {
    // The first manifest gets pushed; the second sees the first via .find() and is skipped.
    const manifests: ComponentManifestEntry[] = [
      {
        type: 'collision-type',
        label: 'First',
        icon: 'icon',
        category: 'Custom',
        description: '',
        inputs: [{ name: 'a', label: 'A', type: 'string' }],
        defaultProps: {},
      },
      {
        type: 'collision-type',
        label: 'Second',
        icon: 'icon',
        category: 'Custom',
        description: '',
        inputs: [{ name: 'b', label: 'B', type: 'string' }],
        defaultProps: {},
      },
    ];

    const all = getAllBlockSchemas(manifests);
    const builtins = getBuiltInBlockSchemas();
    expect(all.length).toBe(builtins.length + 1);
    const collision = all.filter((s) => s.type === 'collision-type');
    expect(collision.length).toBe(1);
    expect(collision[0].label).toBe('First');
  });

  it('appends custom blocks at the tail in the order they were supplied', () => {
    const manifests: ComponentManifestEntry[] = [
      {
        type: 'tail-a',
        label: 'A',
        icon: 'icon',
        category: 'Custom',
        description: '',
        inputs: [],
        defaultProps: {},
      },
      {
        type: 'tail-b',
        label: 'B',
        icon: 'icon',
        category: 'Custom',
        description: '',
        inputs: [],
        defaultProps: {},
      },
    ];

    const all = getAllBlockSchemas(manifests);
    const last = all.slice(-2);
    expect(last.map((s) => s.type)).toEqual(['tail-a', 'tail-b']);
  });
});
