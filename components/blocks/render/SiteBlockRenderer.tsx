'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { BlockRenderer } from './BlockRenderer';
import { EditableBlockRenderer } from './EditableBlockRenderer';
import { EditorModeProvider } from '@/components/visual-editor/EditorModeProvider';
import type { ResolvedBranding } from '@/lib/branding';
import { BrandingProvider } from '@/contexts/BrandingContext';

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
function jsWrapper(label: string, body: string): string {
  return `(function(){function run(){try{${body}\n}catch(e){console.error('[${label}]',e);}}function ready(){if(document.readyState==='complete'){setTimeout(run,200);}else{window.addEventListener('load',function(){setTimeout(run,200);},{once:true});}}ready();})();`;
}

function SiteBlockRendererInner({ content, siteId, branding, site, type, customCss, customJs }: SiteBlockRendererProps) {
  const searchParams = useSearchParams();
  const isEditMode = searchParams.get('_edit') === 'true';

  // Cascade order: site → type → post. Earliest in the document wins least.
  const cssLayers: Array<[string, string]> = [];
  if (site?.customCss) cssLayers.push(['site-custom-css', site.customCss]);
  if (type?.customCss) cssLayers.push(['type-custom-css', type.customCss]);
  if (customCss) cssLayers.push(['post-custom-css', customCss]);

  const jsLayers: Array<[string, string]> = [];
  if (site?.customJs) jsLayers.push(['site-custom-js', site.customJs]);
  if (type?.customJs) jsLayers.push(['type-custom-js', type.customJs]);
  if (customJs) jsLayers.push(['post-custom-js', customJs]);

  const codeInjection = (
    <>
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

  if (isEditMode) {
    const rendered = (
      <>
        {codeInjection}
        <EditorModeProvider>
          <EditableBlockRenderer content={content} />
        </EditorModeProvider>
      </>
    );
    return branding ? <BrandingProvider branding={branding}>{rendered}</BrandingProvider> : rendered;
  }

  return (
    <>
      {codeInjection}
      <BlockRenderer content={content} siteId={siteId} branding={branding} />
    </>
  );
}

export function SiteBlockRenderer(props: SiteBlockRendererProps) {
  return (
    <Suspense fallback={<BlockRenderer {...props} />}>
      <SiteBlockRendererInner {...props} />
    </Suspense>
  );
}
