'use client';

import { useRef, useState } from 'react';
import { HtmlEmbedBlock } from '@/types/blocks';
import { HtmlEmbedBlockRender } from '@/components/blocks/render/HtmlEmbedBlockRender';

interface HtmlEmbedBlockPreviewProps {
  block: HtmlEmbedBlock;
  isSelected: boolean;
  onChange: (updates: Partial<HtmlEmbedBlock>) => void;
}

export function HtmlEmbedBlockPreview({ block, onChange }: HtmlEmbedBlockPreviewProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/portal/html-uploads', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Upload failed');
      onChange({ url: json.data.url, filename: json.data.filename });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  // Once a URL is set, render via the runtime renderer with a click-shield
  // overlay so iframe interactions don't swallow editor selection events.
  if (block.url) {
    return (
      <div className="relative">
        <HtmlEmbedBlockRender block={block} />
        <div className="absolute inset-0 pointer-events-auto" aria-hidden="true" />
      </div>
    );
  }

  // No URL yet — interactive drop zone is the primary entry point on the canvas.
  return (
    <div className="p-6">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-12 text-center transition-colors ${
          dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-accent/30'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".html,.htm,.xhtml,text/html"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <span className="material-icons text-7xl text-muted-foreground/30 mb-3">upload_file</span>
        <p className="text-base font-medium text-foreground">
          {uploading ? 'Uploading…' : 'Drop an HTML file here or click to browse'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">.html · .htm · .xhtml · max 1 MB</p>
        {error && <p className="text-xs text-destructive mt-3">{error}</p>}
      </div>
    </div>
  );
}
