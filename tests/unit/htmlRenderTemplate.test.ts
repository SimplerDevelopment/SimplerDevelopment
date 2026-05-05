import { describe, it, expect } from 'vitest';
import {
  renderHtmlTemplate,
  substituteAllPlaceholders,
  substitutePlaceholders,
  substituteDataFields,
  detectFields,
  countFieldUsage,
  renameFieldInTemplate,
  reconcileFields,
  findRegions,
  findRepeatRegions,
  expandRepeats,
  expandGroups,
} from '@/lib/blocks/html-render-template';
import type { HtmlRenderField } from '@/types/blocks';

describe('html-render template substitution', () => {
  describe('substitutePlaceholders', () => {
    it('substitutes top-level {{name}}', () => {
      expect(substitutePlaceholders('Hi {{who}}', { who: 'world' })).toBe('Hi world');
    });

    it('escapes HTML in values', () => {
      expect(substitutePlaceholders('<p>{{x}}</p>', { x: '<script>1</script>' }))
        .toBe('<p>&lt;script&gt;1&lt;/script&gt;</p>');
    });

    it('falls back to defaults when value missing', () => {
      expect(substitutePlaceholders('Hi {{who}}', {}, { who: 'there' })).toBe('Hi there');
    });

    it('emits empty string when no value or default', () => {
      expect(substitutePlaceholders('a={{a}}', {})).toBe('a=');
    });
  });

  describe('substituteAllPlaceholders (top-level + dotted)', () => {
    it('resolves dotted paths against object values', () => {
      const html = '<a href="{{cta.url}}">{{cta.label}}</a>';
      const out = substituteAllPlaceholders(html, { cta: { url: 'https://x', label: 'Go' } }, {});
      expect(out).toBe('<a href="https://x">Go</a>');
    });

    it('emits empty for dotted path against missing object', () => {
      expect(substituteAllPlaceholders('{{cta.url}}', {}, {})).toBe('');
    });

    it('emits empty for dotted path against string value (not object)', () => {
      expect(substituteAllPlaceholders('{{x.y}}', { x: 'just a string' }, {})).toBe('');
    });

    it('falls back to scalar default when bare placeholder hits an object value', () => {
      const html = '{{x}}';
      // x is an object, no scalar at the head — should fall back to default
      expect(substituteAllPlaceholders(html, { x: { sub: 'v' } }, { x: 'fallback' }))
        .toBe('fallback');
    });
  });

  describe('substituteDataFields', () => {
    it('replaces inner HTML, keeping the outer tag and attributes', () => {
      const html = '<h2 class="big" data-field="title">Old</h2>';
      const out = substituteDataFields(html, { title: '<em>New</em>' });
      expect(out).toBe('<h2 class="big" data-field="title"><em>New</em></h2>');
    });

    it('keeps original inner when no value present (treats element as fallback)', () => {
      const html = '<h2 data-field="title">Fallback</h2>';
      expect(substituteDataFields(html, {})).toBe(html);
    });

    it('marks elements with data-field-resolved when requested', () => {
      const html = '<p data-field="body">x</p>';
      const out = substituteDataFields(html, { body: 'new' }, {}, true);
      expect(out).toContain('data-field-resolved=""');
      expect(out).toContain('data-field="body"');
      expect(out).toContain('new');
    });
  });

  describe('renderHtmlTemplate (end-to-end)', () => {
    it('renders a simple template with bare placeholders + data-field', () => {
      const tpl = '<section><h2 data-field="title">x</h2><p>{{body}}</p></section>';
      const out = renderHtmlTemplate(
        tpl,
        [{ name: 'title', type: 'richtext' }, { name: 'body', type: 'text' }],
        { title: '<em>Hello</em>', body: 'World' },
      );
      expect(out).toContain('<em>Hello</em>');
      expect(out).toContain('World');
    });

    it('strips data-field-resolved markers from output', () => {
      const tpl = '<div data-group="cta"><a href="{{cta.url}}" data-field="label">x</a></div>';
      const out = renderHtmlTemplate(
        tpl,
        [{ name: 'cta', type: 'group', itemFields: [{ name: 'url', type: 'url' }, { name: 'label', type: 'richtext' }] }],
        { cta: { url: 'https://x', label: 'Click me' } },
      );
      expect(out).not.toContain('data-field-resolved');
    });

    it('annotates `<img src="{{name}}">` with data-field-image', () => {
      const tpl = '<img alt="" src="{{logo}}" />';
      const out = renderHtmlTemplate(tpl, [{ name: 'logo', type: 'image' }], { logo: 'https://cdn/logo.png' });
      expect(out).toContain('data-field-image="logo"');
      expect(out).toContain('src="https://cdn/logo.png"');
    });

    it('preserves the dotted reference in the data-field-image annotation', () => {
      // Pre-bug regression: annotator captures the full placeholder path so
      // the iframe edit layer can scope dotted-path images correctly.
      const tpl = '<img src="{{cta.image}}">';
      const out = renderHtmlTemplate(
        tpl,
        [{ name: 'cta', type: 'group', itemFields: [{ name: 'image', type: 'image' }] }],
        { cta: { image: 'https://cdn/x.png' } },
      );
      expect(out).toContain('data-field-image="cta.image"');
    });

    it('returns empty string for empty template', () => {
      expect(renderHtmlTemplate('', undefined, undefined)).toBe('');
    });

    it('uses field defaults when value missing', () => {
      const out = renderHtmlTemplate(
        'Hi {{who}}',
        [{ name: 'who', type: 'text', default: 'stranger' }],
        {},
      );
      expect(out).toBe('Hi stranger');
    });
  });

  describe('expandRepeats', () => {
    it('repeats the marked element once per array item', () => {
      const tpl = '<ul><li data-repeat="items"><span data-field="label">X</span></li></ul>';
      const fields: HtmlRenderField[] = [
        { name: 'items', type: 'array', itemFields: [{ name: 'label', type: 'text' }] },
      ];
      const out = expandRepeats(tpl, fields, { items: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] });
      expect((out.match(/<li/g) || []).length).toBe(3);
      expect(out).toContain('A');
      expect(out).toContain('B');
      expect(out).toContain('C');
    });

    it('drops the element when the array is empty', () => {
      const tpl = '<div>before</div><li data-repeat="items">x</li><div>after</div>';
      const out = expandRepeats(tpl, [], { items: [] });
      expect(out).not.toContain('data-repeat');
      expect(out).not.toContain('<li');
      expect(out).toContain('before');
      expect(out).toContain('after');
    });

    it('tags each iteration with data-repeat-item="<name>:<idx>"', () => {
      const tpl = '<li data-repeat="items"><span data-field="label">x</span></li>';
      const out = expandRepeats(
        tpl,
        [{ name: 'items', type: 'array', itemFields: [{ name: 'label', type: 'text' }] }],
        { items: [{ label: 'A' }, { label: 'B' }] },
      );
      expect(out).toContain('data-repeat-item="items:0"');
      expect(out).toContain('data-repeat-item="items:1"');
    });

    it('substitutes {{name.subfield}} per item', () => {
      const tpl = '<li data-repeat="items"><a href="{{items.url}}">x</a></li>';
      const out = expandRepeats(
        tpl,
        [{ name: 'items', type: 'array', itemFields: [{ name: 'url', type: 'url' }] }],
        { items: [{ url: '/a' }, { url: '/b' }] },
      );
      expect(out).toContain('href="/a"');
      expect(out).toContain('href="/b"');
      expect(out).not.toContain('{{items.url}}');
    });

    it("per-item value isn't clobbered by a top-level field with the same name", () => {
      const tpl = '<div data-field="title">Top</div><li data-repeat="items"><span data-field="title">Item</span></li>';
      const out = renderHtmlTemplate(
        tpl,
        [
          { name: 'title', type: 'richtext' },
          { name: 'items', type: 'array', itemFields: [{ name: 'title', type: 'richtext' }] },
        ],
        { title: 'TOP', items: [{ title: 'one' }, { title: 'two' }] },
      );
      // The top-level field reaches the <div>; the per-item titles reach the <span>s
      expect(out).toMatch(/<div[^>]*>TOP<\/div>/);
      expect(out).toContain('>one<');
      expect(out).toContain('>two<');
      // No leakage: the top value never overwrites a per-item slot
      expect(out.match(/>TOP</g)?.length).toBe(1);
    });
  });

  describe('expandGroups', () => {
    it('substitutes group sub-fields inline', () => {
      const tpl = '<div data-group="cta"><a href="{{cta.url}}" data-field="label">x</a></div>';
      const out = expandGroups(
        tpl,
        [{ name: 'cta', type: 'group', itemFields: [{ name: 'url', type: 'url' }, { name: 'label', type: 'richtext' }] }],
        { cta: { url: 'https://x', label: 'Click' } },
      );
      expect(out).toContain('href="https://x"');
      expect(out).toContain('>Click<');
      expect(out).not.toContain('data-group="cta"'); // attribute stripped
    });

    it('tags the wrapper with data-group-item="<name>" (regression: inline-edit needs this)', () => {
      // This is the bugfix verifier — without `data-group-item` the iframe
      // inline-edit layer can't resolve `<group>.<sub>` paths and edits
      // collide with top-level fields of the same name.
      const tpl = '<div data-group="testimonial"><blockquote data-field="quote">x</blockquote></div>';
      const out = expandGroups(
        tpl,
        [{ name: 'testimonial', type: 'group', itemFields: [{ name: 'quote', type: 'richtext' }] }],
        { testimonial: { quote: 'Great work' } },
      );
      expect(out).toContain('data-group-item="testimonial"');
    });

    it('strips the original data-group attribute from the wrapper', () => {
      const tpl = '<div class="cta" data-group="cta">x</div>';
      const out = expandGroups(tpl, [{ name: 'cta', type: 'group' }], { cta: {} });
      expect(out).not.toMatch(/data-group="cta"/);
      // class survives
      expect(out).toContain('class="cta"');
    });
  });

  describe('findRegions', () => {
    it('finds nested matching tags correctly (depth tracking)', () => {
      const html = '<div data-group="outer"><div>nested same tag</div></div>';
      const regions = findRegions(html, 'data-group');
      expect(regions).toHaveLength(1);
      expect(regions[0].name).toBe('outer');
      expect(html.slice(regions[0].start, regions[0].end)).toBe(html);
    });

    it('finds multiple top-level regions', () => {
      const html = '<li data-repeat="a">1</li><li data-repeat="b">2</li>';
      const regions = findRepeatRegions(html);
      expect(regions).toHaveLength(2);
      expect(regions[0].name).toBe('a');
      expect(regions[1].name).toBe('b');
    });

    it('ignores self-closing and void tags', () => {
      // An <img> can't be a region container; finder should skip it cleanly
      const html = '<img data-repeat="x" src="" /><div data-repeat="y">ok</div>';
      const regions = findRepeatRegions(html);
      expect(regions).toHaveLength(1);
      expect(regions[0].name).toBe('y');
    });
  });

  describe('detectFields', () => {
    it('infers types from surrounding context', () => {
      const tpl = '<a href="{{link}}"><img src="{{logo}}"><h1 data-field="headline">x</h1><p>{{body}}</p><div style="color: {{accent}}">x</div></a>';
      const fields = detectFields(tpl);
      const byName = Object.fromEntries(fields.map(f => [f.name, f]));
      expect(byName.link.type).toBe('url');
      expect(byName.logo.type).toBe('image');
      expect(byName.headline.type).toBe('richtext');
      expect(byName.body.type).toBe('text');
      expect(byName.accent.type).toBe('color');
    });

    it('emits one array field per data-repeat region with detected itemFields', () => {
      const tpl = '<li data-repeat="items"><a href="{{items.url}}"><span data-field="label">x</span></a></li>';
      const fields = detectFields(tpl);
      expect(fields).toHaveLength(1);
      expect(fields[0].name).toBe('items');
      expect(fields[0].type).toBe('array');
      const subNames = (fields[0].itemFields || []).map(f => f.name).sort();
      expect(subNames).toEqual(['label', 'url']);
    });

    it('emits one group field per data-group region', () => {
      const tpl = '<div data-group="cta"><a href="{{cta.url}}" data-field="label">x</a></div>';
      const fields = detectFields(tpl);
      expect(fields).toHaveLength(1);
      expect(fields[0].name).toBe('cta');
      expect(fields[0].type).toBe('group');
    });

    it('does not leak repeat sub-fields up to the top level', () => {
      // `body` is referenced inside a repeat — should not appear as a top-level field
      const tpl = '<li data-repeat="items"><span data-field="body">x</span></li>';
      const fields = detectFields(tpl);
      expect(fields.map(f => f.name)).toEqual(['items']);
    });
  });

  describe('countFieldUsage', () => {
    it('counts every reference form', () => {
      const tpl = '{{x}} {{x}} <span data-field="x">y</span> <li data-repeat="x">z</li> {{x.sub}}';
      expect(countFieldUsage(tpl, 'x')).toBe(5);
    });

    it('returns 0 for unused field', () => {
      expect(countFieldUsage('<div>nothing here</div>', 'x')).toBe(0);
    });

    it('returns 0 for empty name (defensive)', () => {
      expect(countFieldUsage('{{x}}', '')).toBe(0);
    });
  });

  describe('renameFieldInTemplate', () => {
    it('rewrites bare and dotted placeholders, plus all data-* refs', () => {
      const tpl = '{{old}} <h1 data-field="old">x</h1> <li data-repeat="old">y</li> <div data-group="old">{{old.sub}}</div>';
      const { template, replacements } = renameFieldInTemplate(tpl, 'old', 'new');
      expect(replacements).toBe(5);
      expect(template).not.toMatch(/\bold\b/);
      expect(template).toContain('{{new}}');
      expect(template).toContain('data-field="new"');
      expect(template).toContain('data-repeat="new"');
      expect(template).toContain('data-group="new"');
      expect(template).toContain('{{new.sub}}');
    });

    it('no-op when oldName === newName or either is empty', () => {
      expect(renameFieldInTemplate('{{x}}', 'x', 'x').replacements).toBe(0);
      expect(renameFieldInTemplate('{{x}}', '', 'y').replacements).toBe(0);
      expect(renameFieldInTemplate('{{x}}', 'x', '').replacements).toBe(0);
    });
  });

  describe('reconcileFields', () => {
    it('preserves author overrides on existing fields', () => {
      const tpl = '<h1 data-field="title">x</h1>';
      const existing: HtmlRenderField[] = [
        { name: 'title', type: 'richtext', label: 'My Custom Label', help: 'tip' },
      ];
      const out = reconcileFields(tpl, existing);
      expect(out[0].label).toBe('My Custom Label');
      expect(out[0].help).toBe('tip');
    });

    it('drops fields no longer in the template', () => {
      const tpl = '<h1 data-field="title">x</h1>';
      const existing: HtmlRenderField[] = [
        { name: 'title', type: 'richtext' },
        { name: 'gone', type: 'text' },
      ];
      expect(reconcileFields(tpl, existing).map(f => f.name)).toEqual(['title']);
    });

    it('adds newly detected fields with default type', () => {
      const tpl = '<h1 data-field="title">x</h1><p>{{body}}</p>';
      const out = reconcileFields(tpl, [{ name: 'title', type: 'richtext' }]);
      expect(out.map(f => f.name).sort()).toEqual(['body', 'title']);
    });

    it('recursively reconciles itemFields on array fields', () => {
      const tpl = '<li data-repeat="items"><a href="{{items.url}}"><span data-field="label">x</span></a></li>';
      const existing: HtmlRenderField[] = [{
        name: 'items',
        type: 'array',
        itemFields: [
          { name: 'label', type: 'richtext', help: 'kept' },
          { name: 'url', type: 'url' },
        ],
      }];
      const out = reconcileFields(tpl, existing);
      expect(out[0].type).toBe('array');
      const labelField = out[0].itemFields?.find(f => f.name === 'label');
      expect(labelField?.help).toBe('kept');
    });
  });
});
