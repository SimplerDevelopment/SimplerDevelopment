'use client';

import { useState, useEffect, useRef } from 'react';
import type { Block } from '@/types/blocks';

interface EmailPreviewPaneProps {
  blocks: Block[];
}

export function EmailPreviewPane({ blocks }: EmailPreviewPaneProps) {
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewWidth, setPreviewWidth] = useState<'desktop' | 'mobile'>('desktop');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      if (blocks.length === 0) {
        setHtml('');
        return;
      }

      setLoading(true);
      try {
        const res = await fetch('/api/portal/email/render-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blockContent: { blocks, version: '1' } }),
        });
        const data = await res.json();
        if (data.success) {
          setHtml(data.data.html);
        }
      } catch {
        // Silently ignore preview errors
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [blocks]);

  const widthPx = previewWidth === 'desktop' ? 600 : 320;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <span className="text-xs font-medium text-muted-foreground">Email Preview</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPreviewWidth('desktop')}
            className={`p-1 rounded text-xs ${previewWidth === 'desktop' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}
          >
            <span className="material-icons text-sm">monitor</span>
          </button>
          <button
            onClick={() => setPreviewWidth('mobile')}
            className={`p-1 rounded text-xs ${previewWidth === 'mobile' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}
          >
            <span className="material-icons text-sm">smartphone</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-gray-100 p-4">
        {loading && (
          <div className="text-center text-xs text-muted-foreground py-8">Rendering preview...</div>
        )}
        {!loading && !html && blocks.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-8">Add blocks to see preview</div>
        )}
        {html && (
          <div className="mx-auto transition-all duration-200" style={{ width: widthPx, maxWidth: '100%' }}>
            <iframe
              srcDoc={html}
              sandbox="allow-same-origin"
              className="w-full bg-white rounded shadow-sm border border-border"
              style={{ minHeight: 400, height: '100%' }}
              title="Email preview"
            />
          </div>
        )}
      </div>
    </div>
  );
}
