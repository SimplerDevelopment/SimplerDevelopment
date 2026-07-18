'use client';

// Settings panel for the `HtmlEmbedBlockSettings` block type, extracted from the BlockSettings monolith.
import type { HtmlEmbedBlock } from '@/types/blocks';
import { useState, useRef } from 'react';

export function HtmlEmbedBlockSettings({ block, onChange }: { block: HtmlEmbedBlock; onChange: (updates: Partial<HtmlEmbedBlock>) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pull siteId out of /portal/websites/<id>/posts/... so newly uploaded HTML
  // can have its assets imported into the site's media library. Settings panel
  // is also rendered inside an editor popup that lives on the same path.
  function detectSiteId(): string | null {
    if (typeof window === 'undefined') return null;
    const m = window.location.pathname.match(/\/portal\/websites\/(\d+)/);
    if (m) return m[1];
    // Settings popup: try the parent window if same-origin
    try {
      const opener = window.opener as Window | null;
      const parentPath = opener?.location?.pathname;
      const m2 = parentPath?.match(/\/portal\/websites\/(\d+)/);
      if (m2) return m2[1];
    } catch {
      // cross-origin opener — ignore
    }
    return null;
  }

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const siteId = detectSiteId();
      // If we already have a backing media row, version it instead of creating
      // a new one. Falls back to fresh upload if /replace fails.
      if (block.mediaId) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch(`/api/portal/media/${block.mediaId}/replace`, { method: 'POST', body: fd });
        const json = await res.json();
        if (res.ok && json.success) {
          onChange({ url: json.data.url, filename: json.data.filename });
          return;
        }
        // fall through to fresh upload on failure
      }

      const fd = new FormData();
      fd.append('file', file);
      if (siteId) fd.append('websiteId', siteId);
      const res = await fetch('/api/portal/html-uploads', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Upload failed');
      }
      onChange({ url: json.data.url, filename: json.data.filename, mediaId: json.data.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">HTML File</label>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer rounded border-2 border-dashed p-4 text-center text-sm transition-colors ${
            dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
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
          {uploading ? (
            <span className="text-muted-foreground">Uploading…</span>
          ) : block.url ? (
            <div>
              <div className="font-medium text-foreground truncate">{block.filename || 'uploaded.html'}</div>
              <div className="text-xs text-muted-foreground mt-1">Click or drop a new file to replace</div>
            </div>
          ) : (
            <div className="text-muted-foreground">
              <span className="material-icons text-3xl block mb-1">upload_file</span>
              Drop an .html file or click to browse
            </div>
          )}
        </div>
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">URL</label>
        <input
          type="text"
          value={block.url}
          onChange={(e) => onChange({ url: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground font-mono"
          placeholder="/api/media/proxy/media/..."
        />
        <p className="text-xs text-muted-foreground mt-1">Auto-populated by upload. You can also paste an existing URL.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Height</label>
        <input
          type="text"
          value={block.height || '600px'}
          onChange={(e) => onChange({ height: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="600px, 100vh, 80rem…"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Width</label>
        <select
          value={block.width || 'full'}
          onChange={(e) => onChange({ width: e.target.value as HtmlEmbedBlock['width'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="full">Full width</option>
          <option value="contained">Contained (max-width)</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Sandbox</label>
        <select
          value={block.sandbox || 'scripts'}
          onChange={(e) => onChange({ sandbox: e.target.value as HtmlEmbedBlock['sandbox'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="strict">Strict — no scripts</option>
          <option value="scripts">Allow scripts (recommended)</option>
          <option value="scripts-forms">Allow scripts + forms + popups</option>
        </select>
        <p className="text-xs text-muted-foreground mt-1">
          The iframe always runs in an opaque origin. allow-same-origin is never granted.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Iframe Title (a11y)</label>
        <input
          type="text"
          value={block.iframeTitle || ''}
          onChange={(e) => onChange({ iframeTitle: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Embedded HTML content"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Caption (optional)</label>
        <input
          type="text"
          value={block.caption || ''}
          onChange={(e) => onChange({ caption: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Caption shown below the iframe…"
        />
      </div>
    </div>
  );
}
