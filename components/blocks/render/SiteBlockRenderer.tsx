'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { BlockRenderer } from './BlockRenderer';
import type { ResolvedBranding } from '@/lib/branding';
import { BrandingProvider } from '@/contexts/BrandingContext';
import { collectBlockFonts, googleFontsHref } from '@/lib/blocks/page-fonts';
import { DeferredStylesheet } from '@/components/sites/DeferredStylesheet';

// The editor renderer (~40KB + the full editing UI) was statically imported,
// so it shipped to every PUBLIC page even though it only renders when
// `?_edit=true`. Lazy-load it (client-only) so visitors never download it.
const EditableBlockRenderer = dynamic(
  () => import('./EditableBlockRenderer').then((m) => m.EditableBlockRenderer),
  { ssr: false },
);

// The editor provider pulls in `useEditorMode` → the full block registry (all 64
// renderers) + dnd-kit. Statically importing it here shipped that ~400KB chunk
// to every PUBLIC page even though it only renders at `?_edit=true`. Lazy-load
// it (client-only) alongside EditableBlockRenderer so visitors never download it.
const EditorModeProvider = dynamic(
  () => import('@/components/visual-editor/EditorModeProvider').then((m) => m.EditorModeProvider),
  { ssr: false },
);

interface CodeLayer {
  customCss?: string | null;
  customJs?: string | null;
}

interface SiteBlockRendererProps {
  content: string;
  siteId?: number;
  branding?: ResolvedBranding;
  /** Site-wide custom code (cascades first, weakest) */
  site?: CodeLayer;
  /** Content-type custom code (cascades after site, before post) */
  type?: CodeLayer;
  /** Per-post custom code (cascades last, strongest). Aliases for the legacy
   *  customCss/customJs props are still accepted to avoid churn at every call site. */
  customCss?: string | null;
  customJs?: string | null;
}

// Wrap user JS in an IIFE so each layer's `var`/function declarations don't
// leak into the next, and so a thrown error in one layer doesn't kill the
// others. Layered tag names make stray errors easy to attribute in DevTools.
//
// Execution is gated on the `sd:hydrated` signal (dispatched by <HydrationSignal>
// once React has committed the block tree on the client). Custom JS frequently
// mutates block DOM imperatively — e.g. a hero block that prepends a canvas
// element for a particle network effect. Running that BEFORE React finishes
// hydrating the hero produces a hydration mismatch (React expected the section
// <div>, found the <canvas>). Waiting for hydration makes these progressive
// enhancements safe. A `load`-based fallback still fires if the hydration
// signal never arrives (JS error upstream, etc.) so enhancements are never
// silently lost.
function jsWrapper(label: string, body: string): string {
  return `(function(){function run(){try{${body}\n}catch(e){console.error('[${label}]',e);}}var done=false;function go(){if(done)return;done=true;run();}if(window.__sdSiteHydrated){go();}else{document.addEventListener('sd:hydrated',go,{once:true});function fb(){setTimeout(go,2500);}if(document.readyState==='complete'){fb();}else{window.addEventListener('load',fb,{once:true});}}})();`;
}

// Custom CSS + collected fonts + custom JS. Rendered OUTSIDE the Suspense
// boundary below (and without useSearchParams) so it is part of the initial
// SSR HTML and applies BEFORE first paint. Previously this lived inside
// SiteBlockRendererInner (which calls useSearchParams), so during SSR the
// Suspense fallback — which lacks these tags — was emitted and the custom CSS
// (including the hero's background-image and all layout styling) only applied
// after hydration. That produced a large layout shift (CLS) and a very late
// LCP once first paint got fast. Hoisting it fixes both.
function SiteCodeAndFonts({ content, branding, site, type, customCss, customJs }: SiteBlockRendererProps) {
  // Cascade order: site → type → post. Earliest in the document wins least.
  const cssLayers: Array<[string, string]> = [];
  if (site?.customCss) cssLayers.push(['site-custom-css', site.customCss]);
  if (type?.customCss) cssLayers.push(['type-custom-css', type.customCss]);
  if (customCss) cssLayers.push(['post-custom-css', customCss]);

  const jsLayers: Array<[string, string]> = [];
  if (site?.customJs) jsLayers.push(['site-custom-js', site.customJs]);
  if (type?.customJs) jsLayers.push(['type-custom-js', type.customJs]);
  if (customJs) jsLayers.push(['post-custom-js', customJs]);

  // Collect every Google Font used by this page's blocks into ONE combined
  // request. `branding.headingFont`/`bodyFont` are emitted by the site layout,
  // so exclude them here to avoid a duplicate request.
  const brandingFonts = [branding?.headingFont, branding?.bodyFont];
  const fontsHref = googleFontsHref(
    collectBlockFonts(content).filter(
      (f) => !brandingFonts.some((b) => (b || '').trim().split(',')[0].trim().replace(/^["']|["']$/g, '') === f),
    ),
  );

  // NOTE: the LCP/hero image preload is emitted from the SERVER component
  // <HeroPreload> (rendered in the page route) via ReactDOM.preload so it lands
  // in <head> early. Emitting it here (client component, in <body>) was too
  // late to help on real infra.

  return (
    <>
      {fontsHref && <DeferredStylesheet href={fontsHref} />}
      {cssLayers.map(([label, css]) => (
        <style key={label} data-layer={label} dangerouslySetInnerHTML={{ __html: css }} />
      ))}
      {jsLayers.map(([label, js]) => (
        <script
          key={label}
          data-layer={label}
          dangerouslySetInnerHTML={{ __html: jsWrapper(label, js) }}
        />
      ))}
    </>
  );
}

// Fires once the client has committed the block tree (effects run after the
// hydration commit), telling the gated custom-JS layers it is safe to mutate
// block DOM. See jsWrapper above for why this matters.
function HydrationSignal() {
  useEffect(() => {
    const w = window as unknown as { __sdSiteHydrated?: boolean };
    w.__sdSiteHydrated = true;
    document.dispatchEvent(new Event('sd:hydrated'));
  }, []);
  return null;
}

function SiteBlockRendererInner({ content, siteId, branding }: SiteBlockRendererProps) {
  const searchParams = useSearchParams();
  const isEditMode = searchParams.get('_edit') === 'true';

  if (isEditMode) {
    const rendered = (
      <EditorModeProvider>
        <EditableBlockRenderer content={content} />
      </EditorModeProvider>
    );
    return (
      <>
        {branding ? <BrandingProvider branding={branding}>{rendered}</BrandingProvider> : rendered}
        <HydrationSignal />
      </>
    );
  }

  return (
    <>
      <BlockRenderer content={content} siteId={siteId} branding={branding} />
      <HydrationSignal />
    </>
  );
}

export function SiteBlockRenderer(props: SiteBlockRendererProps) {
  return (
    <>
      {/* SSR-rendered, outside Suspense → in the initial HTML, applied before paint. */}
      <SiteCodeAndFonts {...props} />
      <Suspense fallback={<BlockRenderer content={props.content} siteId={props.siteId} branding={props.branding} />}>
        <SiteBlockRendererInner {...props} />
      </Suspense>
    </>
  );
}
