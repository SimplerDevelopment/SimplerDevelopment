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
    return branding ? <BrandingProvider branding={branding}>{rendered}</BrandingProvider> : rendered;
  }

  return <BlockRenderer content={content} siteId={siteId} branding={branding} />;
}

export function SiteBlockRenderer(props: SiteBlockRendererProps) {
  return (
    <Suspense fallback={<BlockRenderer {...props} />}>
      <SiteBlockRendererInner {...props} />
    </Suspense>
  );
}
