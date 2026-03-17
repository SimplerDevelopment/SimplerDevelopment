'use client';

import { useEffect, useState } from 'react';
import { Block } from '@/types/blocks';
import { PreviewRenderer } from '../[id]/PreviewRenderer';

export default function LivePreviewPage() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [title, setTitle] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Load blocks from sessionStorage (set by the editor before opening this page)
    try {
      const data = sessionStorage.getItem('previewBlocks');
      const titleData = sessionStorage.getItem('previewTitle');

      if (data) {
        setBlocks(JSON.parse(data));
      }
      if (titleData) {
        setTitle(titleData);
      }
    } catch {
      // Silent fail
    }
    setLoaded(true);

    // Listen for live updates from the editor via BroadcastChannel
    const channel = new BroadcastChannel('block-editor-preview');

    channel.onmessage = (event) => {
      if (event.data.type === 'BLOCKS_UPDATE') {
        setBlocks(event.data.blocks);
      }
      if (event.data.type === 'TITLE_UPDATE') {
        setTitle(event.data.title);
      }
    };

    return () => channel.close();
  }, []);

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading preview...</p>
      </div>
    );
  }

  return (
    <PreviewRenderer
      title={title || 'Untitled'}
      blocks={blocks}
      isDraft={true}
    />
  );
}
