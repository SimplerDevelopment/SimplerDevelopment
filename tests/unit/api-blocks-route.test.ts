import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/blocks/route';

describe('GET /api/blocks', () => {
  it('returns a 200 response', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it('returns success: true', async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns a data envelope with blocks and categories', async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data.blocks)).toBe(true);
    expect(Array.isArray(body.data.categories)).toBe(true);
  });

  it('returns a non-empty blocks array', async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.data.blocks.length).toBeGreaterThan(0);
  });

  it('every block has required top-level keys (type, name, description, icon, category, inputs)', async () => {
    const res = await GET();
    const body = await res.json();
    for (const block of body.data.blocks) {
      expect(typeof block.type).toBe('string');
      expect(typeof block.name).toBe('string');
      expect(typeof block.description).toBe('string');
      expect(typeof block.icon).toBe('string');
      expect(typeof block.category).toBe('string');
      expect(Array.isArray(block.inputs)).toBe(true);
    }
  });

  it('every block has a unique type', async () => {
    const res = await GET();
    const body = await res.json();
    const types = body.data.blocks.map((b: { type: string }) => b.type);
    const unique = new Set(types);
    expect(unique.size).toBe(types.length);
  });

  it('every block category appears in the categories list', async () => {
    const res = await GET();
    const body = await res.json();
    const categoryIds = new Set(
      body.data.categories.map((c: { id: string }) => c.id),
    );
    for (const block of body.data.blocks) {
      expect(categoryIds.has(block.category)).toBe(true);
    }
  });

  it('every category has id, name, and description', async () => {
    const res = await GET();
    const body = await res.json();
    for (const cat of body.data.categories) {
      expect(typeof cat.id).toBe('string');
      expect(typeof cat.name).toBe('string');
      expect(typeof cat.description).toBe('string');
    }
  });

  it('exposes the six expected categories', async () => {
    const res = await GET();
    const body = await res.json();
    const ids = body.data.categories.map((c: { id: string }) => c.id).sort();
    expect(ids).toEqual(
      ['basic', 'component', 'ecommerce', 'forms', 'layout', 'media'].sort(),
    );
  });

  it('includes the core basic blocks (text, heading, button, quote, code)', async () => {
    const res = await GET();
    const body = await res.json();
    const types = new Set(
      body.data.blocks.map((b: { type: string }) => b.type),
    );
    for (const t of ['text', 'heading', 'button', 'quote', 'code']) {
      expect(types.has(t)).toBe(true);
    }
  });

  it('includes the core media blocks (image, video, youtube, gallery, html-embed)', async () => {
    const res = await GET();
    const body = await res.json();
    const types = new Set(
      body.data.blocks.map((b: { type: string }) => b.type),
    );
    for (const t of ['image', 'video', 'youtube', 'gallery', 'html-embed']) {
      expect(types.has(t)).toBe(true);
    }
  });

  it('includes the core layout blocks (spacer, divider, columns, tabs, accordion, section)', async () => {
    const res = await GET();
    const body = await res.json();
    const types = new Set(
      body.data.blocks.map((b: { type: string }) => b.type),
    );
    for (const t of [
      'spacer',
      'divider',
      'columns',
      'tabs',
      'accordion',
      'section',
    ]) {
      expect(types.has(t)).toBe(true);
    }
  });

  it('includes the core ecommerce blocks (product-grid, featured-products, shopping-cart, product-detail)', async () => {
    const res = await GET();
    const body = await res.json();
    const types = new Set(
      body.data.blocks.map((b: { type: string }) => b.type),
    );
    for (const t of [
      'product-grid',
      'featured-products',
      'shopping-cart',
      'product-detail',
    ]) {
      expect(types.has(t)).toBe(true);
    }
  });

  it('includes the core forms blocks (booking, booking-menu, survey, popup, survey-results)', async () => {
    const res = await GET();
    const body = await res.json();
    const types = new Set(
      body.data.blocks.map((b: { type: string }) => b.type),
    );
    for (const t of ['booking', 'booking-menu', 'survey', 'popup', 'survey-results']) {
      expect(types.has(t)).toBe(true);
    }
  });

  it('inputs are well-formed: name + type are strings; select inputs have an options array', async () => {
    const res = await GET();
    const body = await res.json();
    for (const block of body.data.blocks) {
      for (const input of block.inputs) {
        expect(typeof input.name).toBe('string');
        expect(typeof input.type).toBe('string');
        if (input.type === 'select') {
          expect(Array.isArray(input.options)).toBe(true);
          expect(input.options.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('inputs with default values use a permitted primitive type', async () => {
    const res = await GET();
    const body = await res.json();
    const allowed = new Set(['string', 'number', 'boolean']);
    for (const block of body.data.blocks) {
      for (const input of block.inputs) {
        if ('default' in input && input.default !== undefined) {
          const t = typeof input.default;
          // select inputs may default to numbers (heading levels, columns) — still primitive
          expect(allowed.has(t)).toBe(true);
        }
      }
    }
  });

  it('required-input flag, when present, is boolean', async () => {
    const res = await GET();
    const body = await res.json();
    for (const block of body.data.blocks) {
      for (const input of block.inputs) {
        if ('required' in input) {
          expect(typeof input.required).toBe('boolean');
        }
      }
    }
  });

  it('the post-content placeholder block exposes no inputs', async () => {
    const res = await GET();
    const body = await res.json();
    const postContent = body.data.blocks.find(
      (b: { type: string }) => b.type === 'post-content',
    );
    expect(postContent).toBeDefined();
    expect(postContent.inputs).toEqual([]);
  });

  it('the hero block declares title as required', async () => {
    const res = await GET();
    const body = await res.json();
    const hero = body.data.blocks.find(
      (b: { type: string }) => b.type === 'hero',
    );
    expect(hero).toBeDefined();
    const titleInput = hero.inputs.find(
      (i: { name: string }) => i.name === 'title',
    );
    expect(titleInput).toBeDefined();
    expect(titleInput.required).toBe(true);
  });

  it('the html-embed block defaults sandbox to "scripts"', async () => {
    const res = await GET();
    const body = await res.json();
    const block = body.data.blocks.find(
      (b: { type: string }) => b.type === 'html-embed',
    );
    expect(block).toBeDefined();
    const sandbox = block.inputs.find(
      (i: { name: string }) => i.name === 'sandbox',
    );
    expect(sandbox.default).toBe('scripts');
  });

  it('the popup block defaults trigger to "time-delay" and frequency to "once-per-session"', async () => {
    const res = await GET();
    const body = await res.json();
    const block = body.data.blocks.find(
      (b: { type: string }) => b.type === 'popup',
    );
    expect(block).toBeDefined();
    const trigger = block.inputs.find(
      (i: { name: string }) => i.name === 'trigger',
    );
    const frequency = block.inputs.find(
      (i: { name: string }) => i.name === 'frequency',
    );
    expect(trigger.default).toBe('time-delay');
    expect(frequency.default).toBe('once-per-session');
  });

  it('the response payload is deterministic across calls', async () => {
    const a = await (await GET()).json();
    const b = await (await GET()).json();
    expect(a).toEqual(b);
  });

  it('the response Content-Type is application/json', async () => {
    const res = await GET();
    const ct = res.headers.get('content-type') ?? '';
    expect(ct.toLowerCase()).toContain('application/json');
  });
});
