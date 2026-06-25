'use client';

// ─── HtmlRenderSchemaActions — copy / paste / export / import schema ───────
// Lives at the top of the Field-schema section. Authors can:
//   - Copy the current block's schema (HTML + fields + loop) to a localStorage
//     clipboard. Cross-tab: copy in one editor, paste in another.
//   - Paste — overwrites the current block's schema with the clipboard, BLANKS
//     values (recipient fills in their own content). Confirms first.
//   - Export — downloads the schema as a JSON file (cross-browser sharing,
//     git-trackable, version-controlled).
//   - Import — file picker that accepts the JSON exports above.

import React, { useState, useEffect, useRef } from 'react';
import {
  buildSchemaSnapshot,
  applySchemaSnapshot,
  writeSchemaClipboard,
  readSchemaClipboard,
  downloadSchemaJson,
  parseImportedSchema,
  type HtmlRenderSchema,
} from '@/lib/blocks/html-render-schema';
import type { HtmlRenderBlock, HtmlRenderField } from '@/types/blocks';

export function HtmlRenderSchemaActions({
  block,
  fields,
  onApply,
}: {
  block: HtmlRenderBlock;
  fields: HtmlRenderField[];
  onApply: (updates: Partial<HtmlRenderBlock>) => void;
}) {
  const [clipboard, setClipboard] = useState<HtmlRenderSchema | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Read clipboard once on mount + listen for storage events so a copy in
  // another tab/window updates this UI's "paste" enabled state.
  useEffect(() => {
    setClipboard(readSchemaClipboard());
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'sd-html-render-schema-clipboard') setClipboard(readSchemaClipboard());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const sourceLabel = block.label || (fields.length > 0 ? fields[0].name : 'html-render');

  const handleCopy = () => {
    const snapshot = buildSchemaSnapshot(block, sourceLabel);
    if (writeSchemaClipboard(snapshot)) {
      setClipboard(snapshot);
    }
  };

  const handlePaste = () => {
    if (!clipboard) return;
    const ok = window.confirm(
      `Replace this block's schema with the copied one?\n\n` +
      `Copied schema: ${clipboard.fields.length} fields from "${clipboard.sourceLabel || 'unknown'}"\n` +
      `Current block has ${fields.length} fields.\n\n` +
      `The current block's HTML, fields, and values will be overwritten.`,
    );
    if (!ok) return;
    onApply(applySchemaSnapshot(clipboard));
  };

  const handleExport = () => {
    downloadSchemaJson(buildSchemaSnapshot(block, sourceLabel));
  };

  const handleImport = (file: File) => {
    setImportError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const result = parseImportedSchema(text);
      if ('error' in result) {
        setImportError(result.error);
        return;
      }
      const ok = window.confirm(
        `Import schema?\n\n` +
        `Source: ${result.sourceLabel || 'unknown'}\n` +
        `Fields: ${result.fields.length}\n\n` +
        `The current block's HTML, fields, and values will be overwritten.`,
      );
      if (!ok) return;
      onApply(applySchemaSnapshot(result));
    };
    reader.onerror = () => setImportError('Failed to read file');
    reader.readAsText(file);
  };

  const formatRelative = (ts: number): string => {
    const diff = Date.now() - ts;
    const m = Math.round(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    return new Date(ts).toLocaleDateString();
  };

  return (
    <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border bg-muted/20 text-[11px]">
      <button
        type="button"
        onClick={handleCopy}
        className="flex items-center gap-1 px-2 py-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
        title="Copy this block's schema (fields + template + loop) to a shared clipboard"
      >
        <span className="material-icons text-sm">content_copy</span>
        Copy
      </button>
      <button
        type="button"
        onClick={handlePaste}
        disabled={!clipboard}
        className="flex items-center gap-1 px-2 py-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
        title={clipboard ? `Paste ${clipboard.fields.length}-field schema from "${clipboard.sourceLabel || 'unknown'}" (${formatRelative(clipboard.copiedAt)})` : 'No schema in clipboard yet — Copy from another block first'}
      >
        <span className="material-icons text-sm">content_paste</span>
        Paste{clipboard ? ` (${formatRelative(clipboard.copiedAt)})` : ''}
      </button>
      <span className="flex-1" />
      <button
        type="button"
        onClick={handleExport}
        className="flex items-center gap-1 px-2 py-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
        title="Download schema as JSON"
      >
        <span className="material-icons text-sm">file_download</span>
        Export
      </button>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-1 px-2 py-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
        title="Import schema from JSON file"
      >
        <span className="material-icons text-sm">file_upload</span>
        Import
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleImport(f);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }}
      />
      {importError && (
        <div className="absolute right-3 top-12 z-30 max-w-sm rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive shadow-lg">
          {importError}
          <button type="button" onClick={() => setImportError(null)} className="ml-2 text-destructive/60 hover:text-destructive">×</button>
        </div>
      )}
    </div>
  );
}
