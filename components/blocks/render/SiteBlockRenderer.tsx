'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { BlockRenderer } from './BlockRenderer';
import { EditableBlockRenderer } from './EditableBlockRenderer';
import { EditorModeProvider } from '@/components/visual-editor/EditorModeProvider';
import type { ResolvedBranding } from '@/lib/branding';
import { BrandingProvider } from '@/contexts/BrandingContext';

interface SiteBlockRendererProps {
  content: string;
  siteId?: number;
  branding?: ResolvedBranding;
  customCss?: string | null;
  customJs?: string | null;
}

function SiteBlockRendererInner({ content, siteId, branding, customCss, customJs }: SiteBlockRendererProps) {
  const searchParams = useSearchParams();
  const isEditMode = searchParams.get('_edit') === 'true';

  const codeInjection = (
    <>
      {customCss ? <style dangerouslySetInnerHTML={{ __html: customCss }} /> : null}
      {customJs ? (
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){function run(){try{${customJs}\n}catch(e){console.error('[custom-js]',e);}}function ready(){if(document.readyState==='complete'){setTimeout(run,200);}else{window.addEventListener('load',function(){setTimeout(run,200);},{once:true});}}ready();})();`,
          }}
        />
      ) : null}
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
