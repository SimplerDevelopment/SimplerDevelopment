'use client';

import { useEffect, useState } from 'react';
import { Block, PageSettings } from '@/types/blocks';
import { PreviewRenderer } from '../[id]/PreviewRenderer';

export default function LivePreviewPage() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [title, setTitle] = useState('');
  const [pageSettings, setPageSettings] = useState<PageSettings>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const data = sessionStorage.getItem('previewBlocks');
      const titleData = sessionStorage.getItem('previewTitle');
      const settingsData = sessionStorage.getItem('previewPageSettings');

      if (data) setBlocks(JSON.parse(data));
      if (titleData) setTitle(titleData);
      if (settingsData) setPageSettings(JSON.parse(settingsData));
    } catch {
      // Silent fail
    }
    setLoaded(true);

    const channel = new BroadcastChannel('block-editor-preview');

    channel.onmessage = (event) => {
      if (event.data.type === 'BLOCKS_UPDATE') setBlocks(event.data.blocks);
      if (event.data.type === 'TITLE_UPDATE') setTitle(event.data.title);
      if (event.data.type === 'PAGE_SETTINGS_UPDATE') setPageSettings(event.data.pageSettings);
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
      pageSettings={pageSettings}
    />
  );
}
