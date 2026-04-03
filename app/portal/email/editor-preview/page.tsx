'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { EditorModeProvider } from '@/components/visual-editor/EditorModeProvider';
import { EditableBlockRenderer } from '@/components/blocks/render/EditableBlockRenderer';
import { BlockRenderer } from '@/components/blocks/render/BlockRenderer';
import { isVisualEditorMessage, sendToParent } from '@/lib/visual-editor/protocol';
import { PARENT_MESSAGES } from '@/types/visual-editor';
import type { Block } from '@/types/blocks';

export default function EmailEditorPreviewPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', backgroundColor: '#ffffff' }} />}>
      <EditorModeProvider>
        <EmailPreviewInner />
      </EditorModeProvider>
    </Suspense>
  );
}

function EmailPreviewInner() {
  const searchParams = useSearchParams();
  const isEditMode = searchParams.get('_edit') === 'true';
  const [previewBlocks, setPreviewBlocks] = useState<Block[]>([]);

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

  return (
    <>
      <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
      <div
        style={{
          backgroundColor: '#ffffff',
          color: '#333333',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          minHeight: '100vh',
          width: '100%',
        }}
      >
        <div className="w-full min-h-screen">
          <div className="w-full max-w-[600px] mx-auto px-10 py-8">
            {isEditMode ? (
              <EditableBlockRenderer content={content} />
            ) : (
              <BlockRenderer content={content} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
