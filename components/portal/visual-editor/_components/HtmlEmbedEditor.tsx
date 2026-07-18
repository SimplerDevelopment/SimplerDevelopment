'use client';

import { useRef, useState } from 'react';
import type { Block } from '@/types/blocks';
import { Field, SelectField } from '../panel-fields';

// ─── HTML Embed Editor — file upload, replace-versioned, plus iframe knobs ──

// Some failure modes (Railway timeouts, proxy errors) return an HTML error
// page. Calling res.json() on that throws "Unexpected token '<'..." which
// looks like a frontend bug instead of a server failure — fall back to text.
interface UploadEnvelope {
  success?: boolean;
  message?: string;
  error?: string;
  data?: { id?: number; url?: string; filename?: string };
}
async function safeJson(res: Response): Promise<UploadEnvelope | null> {
  const text = await res.text();
  try {
    return JSON.parse(text) as UploadEnvelope;
  } catch {
    return null;
  }
}

export function HtmlEmbedEditor({ block, onUpdate, siteId }: { block: Block; onUpdate: (updates: Partial<Block>) => void; siteId?: number }) {
  const b = block as unknown as Record<string, unknown>;
  const url = (b.url as string) || '';
  const filename = (b.filename as string) || '';
  const mediaId = b.mediaId as number | undefined;

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      // Existing media: version it via /replace so history is preserved.
      if (mediaId) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch(`/api/portal/media/${mediaId}/replace`, { method: 'POST', body: fd });
        const parsed = await safeJson(res);
        if (res.ok && parsed?.success && parsed.data) {
          onUpdate({ url: parsed.data.url, filename: parsed.data.filename } as Partial<Block>);
          return;
        }
        // Replace failed (timeout, server error, etc.) — surface why and stop.
        // Falling through to a fresh upload would create a duplicate media row
        // and orphan the existing version history, which is worse than failing.
        throw new Error(parsed?.message || parsed?.error || `Replace failed (status ${res.status})`);
      }
      const fd = new FormData();
      fd.append('file', file);
      if (siteId) fd.append('websiteId', String(siteId));
      const res = await fetch('/api/portal/html-uploads', { method: 'POST', body: fd });
      const parsed = await safeJson(res);
      if (!res.ok || !parsed?.success || !parsed.data) {
        throw new Error(parsed?.error || parsed?.message || `Upload failed (status ${res.status})`);
      }
      onUpdate({ url: parsed.data.url, filename: parsed.data.filename, mediaId: parsed.data.id } as Partial<Block>);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <div>
        <span className="text-xs font-medium text-muted-foreground">HTML File</span>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`mt-1 cursor-pointer rounded border-2 border-dashed p-4 text-center text-xs transition-colors ${
            dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".html,.htm,.xhtml,text/html"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          />
          {uploading ? (
            <span className="text-muted-foreground">Uploading…</span>
          ) : url ? (
            <div>
              <div className="font-medium text-foreground truncate">{filename || 'uploaded.html'}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {mediaId ? 'Click or drop to upload a new version' : 'Click or drop a new file to replace'}
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground">
              <span className="material-icons text-2xl block mb-1">upload_file</span>
              Drop an .html file or click to browse
            </div>
          )}
        </div>
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      </div>

      <Field label="URL" value={url} onChange={(v) => onUpdate({ url: v } as Partial<Block>)} />
      <Field label="Height" value={(b.height as string) || '600px'} onChange={(v) => onUpdate({ height: v } as Partial<Block>)} />
      <SelectField
        label="Width"
        value={(b.width as string) || 'full'}
        options={['full', 'contained']}
        onChange={(v) => onUpdate({ width: v } as Partial<Block>)}
      />
      <SelectField
        label="Sandbox"
        value={(b.sandbox as string) || 'scripts'}
        options={['strict', 'scripts', 'scripts-forms']}
        onChange={(v) => onUpdate({ sandbox: v } as Partial<Block>)}
      />
      <Field label="Iframe Title" value={(b.iframeTitle as string) || ''} onChange={(v) => onUpdate({ iframeTitle: v || undefined } as Partial<Block>)} />
      <Field label="Caption" value={(b.caption as string) || ''} onChange={(v) => onUpdate({ caption: v || undefined } as Partial<Block>)} />
    </>
  );
}
