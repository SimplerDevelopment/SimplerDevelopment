'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { EditorModeProvider } from '@/components/visual-editor/EditorModeProvider';
import { EditableBlockRenderer } from '@/components/blocks/render/EditableBlockRenderer';
import { SlideBlockWrapper } from '@/components/pitch-deck/SlideBlockWrapper';
import { isVisualEditorMessage, sendToParent } from '@/lib/visual-editor/protocol';
import { PARENT_MESSAGES } from '@/types/visual-editor';
import type { Block } from '@/types/blocks';
import type { PitchDeckSlideV2, PitchDeckTheme } from '@/lib/db/schema';

export default function SlidePreviewPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh' }} />}>
      <EditorModeProvider>
        <SlidePreviewInner />
      </EditorModeProvider>
    </Suspense>
  );
}

function SlidePreviewInner() {
  const searchParams = useSearchParams();
  const isEditMode = searchParams.get('_edit') === 'true';
  const [previewBlocks, setPreviewBlocks] = useState<Block[]>([]);

  const theme: PitchDeckTheme = {
    primaryColor: searchParams.get('pc') || '#2563eb',
    accentColor: searchParams.get('ac') || '#60a5fa',
    backgroundColor: searchParams.get('bg') || '#0f172a',
    textColor: searchParams.get('text') || '#f8fafc',
    headingFont: searchParams.get('hf') || 'Inter',
    bodyFont: searchParams.get('bf') || 'Inter',
  };

  // In preview mode, listen for blocks from parent since useEditorMode is inactive
  useEffect(() => {
    if (isEditMode) return;

    function handleMessage(event: MessageEvent) {
      if (!isVisualEditorMessage(event.data)) return;
      if (event.data.source !== 'sd-editor-parent') return;

      if (event.data.type === PARENT_MESSAGES.EDITOR_INIT || event.data.type === PARENT_MESSAGES.BLOCKS_UPDATE) {
        const { blocks } = event.data.payload as { blocks: Block[] };
        setPreviewBlocks(blocks || []);
      }
    }

    window.addEventListener('message', handleMessage);
    sendToParent('IFRAME_READY', { registeredComponents: [] });

    return () => window.removeEventListener('message', handleMessage);
  }, [isEditMode]);

  const content = JSON.stringify({ blocks: isEditMode ? [] : previewBlocks, version: '1.0' });

  // Build a virtual slide from the current blocks for SlideBlockWrapper
  const virtualSlide: PitchDeckSlideV2 = {
    id: 'preview',
    label: 'Preview',
    blocks: isEditMode ? [] : previewBlocks,
    pageSettings: {
      backgroundColor: theme.backgroundColor,
    },
  };

  // Force body to match theme so no portal background bleeds through
  useEffect(() => {
    document.documentElement.style.backgroundColor = theme.backgroundColor;
    document.documentElement.style.margin = '0';
    document.body.style.backgroundColor = theme.backgroundColor;
    document.body.style.margin = '0';
  }, [theme.backgroundColor]);

  if (isEditMode) {
    // Edit mode: keep the existing editable structure with theme styling
    return (
      <>
        <link href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(theme.headingFont)}:wght@400;500;600;700;800;900&family=${encodeURIComponent(theme.bodyFont)}:wght@300;400;500;600;700&display=swap`} rel="stylesheet" />
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
        <style dangerouslySetInnerHTML={{ __html: `
          :root {
            --foreground: ${theme.textColor};
            --card-foreground: ${theme.textColor};
            --background: ${theme.backgroundColor};
            --card: ${theme.backgroundColor};
            --primary: ${theme.primaryColor};
            --primary-foreground: ${theme.backgroundColor};
            --muted: color-mix(in srgb, ${theme.textColor} 10%, ${theme.backgroundColor});
            --muted-foreground: color-mix(in srgb, ${theme.textColor} 70%, transparent);
            --accent: color-mix(in srgb, ${theme.textColor} 10%, ${theme.backgroundColor});
            --accent-foreground: ${theme.textColor};
            --border: color-mix(in srgb, ${theme.textColor} 20%, transparent);
          }
          h1, h2, h3, h4, h5, h6 {
            font-family: "${theme.headingFont}", sans-serif !important;
            color: ${theme.textColor} !important;
          }
          body, p, li, span, div { color: ${theme.textColor}; }
          a, .text-primary { color: ${theme.primaryColor}; }
        `}} />
        <div
          style={{
            backgroundColor: theme.backgroundColor,
            color: theme.textColor,
            fontFamily: `"${theme.bodyFont}", sans-serif`,
            width: '100%',
            minHeight: '100vh',
          }}
        >
          <div
            className="w-full min-h-screen flex flex-col"
            style={{
              ['--slide-primary' as string]: theme.primaryColor,
              ['--slide-accent' as string]: theme.accentColor,
              ['--slide-bg' as string]: theme.backgroundColor,
              ['--slide-text' as string]: theme.textColor,
              ['--slide-heading-font' as string]: theme.headingFont,
              ['--slide-body-font' as string]: theme.bodyFont,
            }}
          >
            <div className="w-full max-w-6xl mx-auto px-12 md:px-20 py-12" style={{ marginTop: 'auto', marginBottom: 'auto' }}>
              <EditableBlockRenderer content={content} />
            </div>
          </div>
        </div>
      </>
    );
  }

  // Preview mode: use the actual SlideBlockWrapper for pixel-perfect match with live view
  return (
    <>
      <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
      <SlideBlockWrapper
        slide={virtualSlide}
        theme={theme}
        className="min-h-screen w-full flex items-center justify-center"
      />
    </>
  );
}
