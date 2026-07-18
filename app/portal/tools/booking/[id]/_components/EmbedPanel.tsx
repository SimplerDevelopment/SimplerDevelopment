/**
 * Embed tab — direct link + iframe-embed snippet, each with a copy button
 * that flashes a confirmation. Stateless: the parent owns the URL.
 */
'use client';

import { useState } from 'react';

interface EmbedPanelProps {
  publicUrl: string;
  iframeCode: string;
}

export function EmbedPanel({ publicUrl, iframeCode }: EmbedPanelProps) {
  const [copied, setCopied] = useState<string | null>(null);

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="material-icons text-primary">link</span>
          <h2 className="text-sm font-medium text-foreground">Direct Link</h2>
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 bg-muted rounded-lg text-sm text-foreground font-mono overflow-x-auto">
            {publicUrl}
          </code>
          <button
            onClick={() => copyText(publicUrl, 'link')}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex-shrink-0"
          >
            <span className="material-icons text-lg">
              {copied === 'link' ? 'check' : 'content_copy'}
            </span>
            {copied === 'link' ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="material-icons text-primary">code</span>
          <h2 className="text-sm font-medium text-foreground">Iframe Embed Code</h2>
        </div>
        <div className="relative">
          <pre className="px-3 py-3 bg-muted rounded-lg text-sm text-foreground font-mono overflow-x-auto whitespace-pre-wrap break-all">
            {iframeCode}
          </pre>
          <button
            onClick={() => copyText(iframeCode, 'iframe')}
            className="absolute top-2 right-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <span className="material-icons text-sm">
              {copied === 'iframe' ? 'check' : 'content_copy'}
            </span>
            {copied === 'iframe' ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}
