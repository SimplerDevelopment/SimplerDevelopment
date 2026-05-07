/** Right-hand drawer for deck SEO metadata. Mirrors the webpages CMS SettingsSlideOver/SeoSection. */
'use client';

import { useState } from 'react';
import MediaPicker from '@/components/admin/MediaPicker';
import { patchDeck, type DeckPayload } from '../_lib/api';

export interface SeoPanelProps {
  deck: DeckPayload;
  onUpdateDeck: (updates: Partial<DeckPayload>) => void;
  onClose: () => void;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function SeoPanel({ deck, onUpdateDeck, onClose }: SeoPanelProps) {
  const [seoTitle, setSeoTitle] = useState(deck.seoTitle ?? '');
  const [seoDescription, setSeoDescription] = useState(deck.seoDescription ?? '');
  const [canonicalUrl, setCanonicalUrl] = useState(deck.canonicalUrl ?? '');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  // patchField writes a single SEO field to the server, optimistically
  // updates parent deck state, and surfaces a save indicator. Same shape
  // the webpages CMS SettingsSlideOver uses for its custom-field saves.
  const patchField = async (patch: Partial<Pick<DeckPayload,
    'seoTitle' | 'seoDescription' | 'ogImage' | 'canonicalUrl' | 'noIndex'
  >>) => {
    setSaveStatus('saving');
    onUpdateDeck(patch);
    const res = await patchDeck(String(deck.id), patch);
    if (res.success) {
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } else {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const commitIfChanged = <K extends 'seoTitle' | 'seoDescription' | 'canonicalUrl'>(
    field: K,
    nextValue: string,
  ) => {
    const current = (deck[field] ?? '') as string;
    const trimmed = nextValue.trim();
    if (trimmed === current) return;
    void patchField({ [field]: trimmed || null } as Partial<DeckPayload>);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 z-50 h-full w-96 bg-card border-l border-border shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">SEO</h3>
            {saveStatus === 'saving' && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground animate-pulse">
                <span className="material-icons text-sm animate-spin">progress_activity</span>
                Saving
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <span className="material-icons text-sm">check_circle</span>
                Saved
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="flex items-center gap-1 text-xs text-destructive">
                <span className="material-icons text-sm">error</span>
                Save failed
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <span className="material-icons text-xl">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">SEO Title</label>
            <input
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
              onBlur={() => commitIfChanged('seoTitle', seoTitle)}
              placeholder={deck.title || 'Defaults to deck title'}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary"
            />
            <p className="text-xs text-muted-foreground mt-1">{(seoTitle || deck.title || '').length}/60 characters</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Meta Description</label>
            <textarea
              value={seoDescription}
              onChange={(e) => setSeoDescription(e.target.value)}
              onBlur={() => commitIfChanged('seoDescription', seoDescription)}
              rows={3}
              placeholder={deck.description || 'Description for search engines...'}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary resize-none"
            />
            <p className="text-xs text-muted-foreground mt-1">{seoDescription.length}/160 characters</p>
          </div>

          <MediaPicker
            value={deck.ogImage ?? undefined}
            onChange={(url) => void patchField({ ogImage: url || null })}
            label="Social Share Image (OG Image)"
          />

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Canonical URL</label>
            <input
              value={canonicalUrl}
              onChange={(e) => setCanonicalUrl(e.target.value)}
              onBlur={() => commitIfChanged('canonicalUrl', canonicalUrl)}
              placeholder="https://..."
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary"
            />
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={deck.noIndex || false}
              onChange={(e) => void patchField({ noIndex: e.target.checked })}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-sm text-foreground">Hide from search engines (noindex)</span>
          </label>
        </div>
      </div>
    </>
  );
}
