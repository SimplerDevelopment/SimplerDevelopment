/**
 * @vitest-environment node
 *
 * PUX-255. Tenant customJs (site / type / post layers) must only be emitted when
 * the page is served on the tenant's own host. The same renderer also runs on
 * APP hosts — /sites/<domain> on www, the visual-editor iframe, approval
 * previews — where the script would run with the portal's origin. CSS layers
 * are harmless and stay everywhere.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement, ReactNode } from 'react';

let host = '';
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host }),
}));
vi.mock('./../../components/blocks/render/BlockRenderer', () => ({ BlockRenderer: () => null }));
vi.mock('@/components/blocks/render/SiteBlockRenderer.client', () => ({
  HydrationSignal: () => null,
  SiteEditRenderer: () => null,
}));
vi.mock('@/lib/blocks/page-fonts', () => ({
  collectBlockFonts: () => [],
  googleFontsHref: () => null,
}));

import { SiteBlockRenderer } from '@/components/blocks/render/SiteBlockRenderer';

const props = {
  content: '{"blocks":[]}',
  site: { customCss: 'body{}', customJs: 'window.siteJs=1' },
  type: { customJs: 'window.typeJs=1' },
  customJs: 'window.postJs=1',
};

/** Resolve the async SiteCodeAndFonts element and collect its data-layer labels. */
async function emittedLayers(isEditMode = false): Promise<string[]> {
  const tree = SiteBlockRenderer({ ...props, isEditMode }) as ReactElement<{ children: ReactNode[] }>;
  const codeAndFonts = (tree.props.children as ReactElement[]).find(
    (child) => typeof child?.type === 'function' && child.type.name === 'SiteCodeAndFonts',
  )!;
  const out = (await (codeAndFonts.type as (p: unknown) => Promise<ReactElement>)(codeAndFonts.props)) as ReactElement<{
    children: ReactNode[];
  }>;
  return (out.props.children as ReactNode[])
    .flat()
    .filter(Boolean)
    .map((el) => (el as ReactElement<{ 'data-layer'?: string }>).props['data-layer'])
    .filter((label): label is string => !!label);
}

describe('tenant customJs only on tenant hosts', () => {
  beforeEach(() => {
    host = '';
  });

  it('emits every JS layer on the tenant host', async () => {
    host = 'acme.simplerdevelopment.com';
    expect(await emittedLayers()).toEqual(
      expect.arrayContaining(['site-custom-css', 'site-custom-js', 'type-custom-js', 'post-custom-js']),
    );
  });

  it.each(['www.simplerdevelopment.com', 'simplerdevelopment.com', 'pr-1-team.vercel.app', 'localhost:3000'])(
    'emits no JS layer on app host %s — CSS stays',
    async (appHost) => {
      host = appHost;
      const layers = await emittedLayers();
      expect(layers).toContain('site-custom-css');
      expect(layers.filter((l) => l.endsWith('-custom-js'))).toEqual([]);
    },
  );

  it('emits no JS layer in the visual-editor iframe (served from the app host)', async () => {
    host = 'www.simplerdevelopment.com';
    const layers = await emittedLayers(true);
    expect(layers.filter((l) => l.endsWith('-custom-js'))).toEqual([]);
  });
});

/** Resolve SiteCodeAndFonts and serialize it the way the server would. */
async function renderCodeAndFonts(overrides: Record<string, unknown>): Promise<string> {
  const tree = SiteBlockRenderer({ ...props, ...overrides }) as ReactElement<{ children: ReactNode[] }>;
  const codeAndFonts = (tree.props.children as ReactElement[]).find(
    (child) => typeof child?.type === 'function' && child.type.name === 'SiteCodeAndFonts',
  )!;
  const out = await (codeAndFonts.type as (p: unknown) => Promise<ReactElement>)(codeAndFonts.props);
  return renderToStaticMarkup(out);
}

describe('tenant CSS cannot break out of its <style> tag (PUX-255)', () => {
  beforeEach(() => {
    host = 'www.simplerdevelopment.com'; // the worst case: an app host, session live
  });

  // CSS layers stay on app hosts (unlike JS), so a </style> breakout would run
  // on the portal origin. The children form escapes the terminator.
  it('neutralizes a </style> breakout payload in custom CSS', async () => {
    const html = await renderCodeAndFonts({
      site: { customCss: `x{} </style><img src=x onerror="fetch('/api/users',{method:'POST'})">` },
      type: {},
      customJs: undefined,
    });
    // The payload text may appear as inert CSS; what must not appear is a real
    // closing tag that lets the <img> become an element. React escapes the
    // terminator to `</\73 tyle`, so the style element never closes early.
    expect(html).not.toMatch(/<\/style\s*>\s*<img/i);
    expect(html).toContain('</\\73 tyle'); // proof the terminator was escaped
    // Exactly one real </style>: React's own closing tag.
    expect(html.match(/<\/style>/gi)).toHaveLength(1);
  });

  // Real CSS must survive verbatim — a child-escaping bug would corrupt `>`/`&`.
  it('leaves ordinary CSS (child combinators, entities) intact', async () => {
    const html = await renderCodeAndFonts({
      site: { customCss: '.a > .b { content: "&"; }' },
      type: {},
      customJs: undefined,
    });
    expect(html).toContain('.a > .b { content: "&"; }');
  });
});
