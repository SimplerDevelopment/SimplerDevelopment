/**
 * Pins that a posts_update cannot silently drop a field.
 *
 * There are two paths into a post update — direct (lib/mcp/tools/cms.ts) and
 * approval mode (`post:update` in lib/mcp/approvals.ts). They were hand-rolled
 * separately and drifted: approval mode applied four fields where direct
 * applied twelve, so every SEO field was discarded whenever approval mode was
 * on. Nothing surfaced it — tool returns pending, reviewer approves, row
 * updates, and only the rendered <title> disagrees (PUX-096).
 *
 * Both now share buildPostUpdatePatch. These tests cover what that builder
 * must do, plus a guard that neither call site goes back to hand-rolling one.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildPostUpdatePatch } from '@/lib/mcp/post-update-patch';

const ALL_FIELDS = {
  title: 'A title',
  excerpt: 'An excerpt',
  customCss: '.a{}',
  customJs: 'void 0;',
  seoTitle: 'SEO title',
  seoDescription: 'SEO description',
  ogImage: 'https://example.com/og.png',
  canonicalUrl: 'https://example.com/x',
  noIndex: true,
};

describe('buildPostUpdatePatch', () => {
  it('carries every supplied field through', () => {
    const patch = buildPostUpdatePatch({ ...ALL_FIELDS });
    for (const [k, v] of Object.entries(ALL_FIELDS)) {
      expect(patch[k], `${k} was dropped`).toEqual(v);
    }
  });

  // The original bug, stated as a test: these are the seven that went missing.
  it('carries the SEO and custom-code fields that caused the drift', () => {
    const patch = buildPostUpdatePatch({ ...ALL_FIELDS });
    for (const f of ['seoTitle', 'seoDescription', 'ogImage', 'canonicalUrl', 'noIndex', 'customCss', 'customJs']) {
      expect(Object.prototype.hasOwnProperty.call(patch, f), `${f} missing from patch`).toBe(true);
    }
  });

  it('omits fields that were not supplied, so a partial update stays partial', () => {
    const patch = buildPostUpdatePatch({ title: 'only this' });
    expect(patch.title).toBe('only this');
    for (const f of ['excerpt', 'seoTitle', 'ogImage', 'published', 'content']) {
      expect(Object.prototype.hasOwnProperty.call(patch, f), `${f} should be absent`).toBe(false);
    }
  });

  // null is "clear it" and must survive. A truthiness check here would make an
  // ogImage or canonical URL impossible to remove once set.
  it('passes null through so a field can be cleared', () => {
    const patch = buildPostUpdatePatch({ ogImage: null, canonicalUrl: null, seoTitle: null });
    expect(patch.ogImage).toBeNull();
    expect(patch.canonicalUrl).toBeNull();
    expect(patch.seoTitle).toBeNull();
  });

  it('stamps publishedAt when publishing', () => {
    const patch = buildPostUpdatePatch({ published: true });
    expect(patch.published).toBe(true);
    expect(patch.publishedAt).toBeInstanceOf(Date);
  });

  it('does not stamp publishedAt when unpublishing', () => {
    const patch = buildPostUpdatePatch({ published: false });
    expect(patch.published).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(patch, 'publishedAt')).toBe(false);
  });

  it('serializes blocks into content', () => {
    const patch = buildPostUpdatePatch({ blocks: [{ id: 'a', type: 'text', order: 0 }] });
    expect(typeof patch.content).toBe('string');
    expect(patch.content as string).toContain('"blocks"');
  });

  it('always bumps updatedAt', () => {
    expect(buildPostUpdatePatch({}).updatedAt).toBeInstanceOf(Date);
  });
});

describe('both post-update paths use the shared builder', () => {
  const root = process.cwd();

  // Scoped to the post-UPDATE region of each file. The same
  // `const patch: Record<string, unknown>` shape legitimately appears
  // elsewhere (posts_create, other approval branches), so an unscoped search
  // would fail on unrelated code.
  it.each([
    ['lib/mcp/tools/cms.ts', "'posts_update'", 'returning(postProjection(includeContent))'],
    ['lib/mcp/approvals.ts', "case 'post:update'", "case 'post:delete'"],
  ])('%s routes its post update through buildPostUpdatePatch', (file, startAnchor, endAnchor) => {
    const src = readFileSync(join(root, file), 'utf8');
    const start = src.indexOf(startAnchor);
    expect(start, `anchor not found in ${file}: ${startAnchor}`).toBeGreaterThan(-1);
    const end = src.indexOf(endAnchor, start);
    expect(end, `anchor not found in ${file}: ${endAnchor}`).toBeGreaterThan(-1);
    const region = src.slice(start, end);

    expect(region, `${file} no longer calls buildPostUpdatePatch`).toContain('buildPostUpdatePatch(');
    // The exact shape both files used before they were unified. Reintroducing
    // it here means a second, driftable copy of the field list.
    expect(
      region.includes('const patch: Record<string, unknown> = { updatedAt: new Date() };'),
      `${file} hand-rolls a post-update patch again — route it through buildPostUpdatePatch instead`,
    ).toBe(false);
  });
});
