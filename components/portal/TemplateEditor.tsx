'use client';

import { useEffect, useMemo, useState } from 'react';
import { Block, BlockType } from '@/types/blocks';
import { VisualEditorShell } from '@/components/portal/VisualEditorShell';
import { POST_CONTENT_PICKER_ENTRY } from '@/lib/blocks/registry';
import { createDefaultBlock } from '@/lib/blocks/defaults';
import { findBlockById, removeBlockById, updateBlockById } from '@/lib/utils/blockHelpers';

interface TemplateEditorProps {
  siteId: string;
  typeId: string;
  typeName: string;
  typeSlug: string;
  siteUrl: string | null;
  previewToken: string;
}

// Mounts the same iframe-based VisualEditorShell the post editor uses.
// The iframe loads /sites/<domain>/_template-preview/<typeId>?_edit=true so
// the shell can postMessage block edits to it like any other editable page.
export function TemplateEditor({ siteId, typeId, typeName, typeSlug, siteUrl, previewToken }: TemplateEditorProps) {
  const endpoint = `/api/portal/cms/websites/${siteId}/content-types/${typeId}/template`;
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [savedBlocks, setSavedBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [iframeBust, setIframeBust] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(endpoint).then(r => r.json());
        if (cancelled) return;
        if (res.success) {
          const initial = (res.data?.template?.blocks ?? []) as Block[];
          setBlocks(initial);
          setSavedBlocks(initial);
        } else {
          setError(res.message || 'Failed to load template.');
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [endpoint]);

  const dirty = useMemo(() => JSON.stringify(blocks) !== JSON.stringify(savedBlocks), [blocks, savedBlocks]);
  const placeholderCount = useMemo(() => countPostContent(blocks), [blocks]);

  // Templates require exactly one post-content placeholder. Hide it from the
  // picker once a placeholder is already in the tree so the user can't add a
  // second; the server-side PUT also dedupes as a safety net.
  const extraBlockTypes = useMemo(
    () => (placeholderCount === 0 ? [POST_CONTENT_PICKER_ENTRY] : []),
    [placeholderCount]
  );

  const iframeSrc = useMemo(() => {
    if (!siteUrl) return null;
    const sep = siteUrl.includes('?') ? '&' : '?';
    const cacheBust = iframeBust > 0 ? `&_v=${iframeBust}` : '';
    return `${siteUrl}/template-preview/${typeId}${sep}_edit=true&_token=${previewToken}${cacheBust}`;
  }, [siteUrl, typeId, previewToken, iframeBust]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const template = blocks.length === 0 ? null : { blocks, version: '1.0' };
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template }),
      }).then(r => r.json());
      if (res.success) {
        const next = (res.data?.template?.blocks ?? []) as Block[];
        setBlocks(next);
        setSavedBlocks(next);
        setSavedAt(new Date());
        setIframeBust(v => v + 1); // force iframe reload so cached preview picks up
      } else {
        setError(res.message || 'Save failed.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  if (!siteUrl) {
    return (
      <div className="max-w-3xl mx-auto p-6 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg">
        This site doesn’t have a domain or subdomain configured yet. Set one in the website settings before editing
        templates so the preview iframe has somewhere to load.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border bg-background shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="material-icons text-sm">view_quilt</span>
            <span>Content type template</span>
            <span>·</span>
            <code className="font-mono">{typeSlug}</code>
          </div>
          <h1 className="text-lg font-semibold text-foreground truncate">{typeName}</h1>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-muted-foreground">
            {dirty ? 'Unsaved changes' : savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : !blocks.length ? 'No template — post renders raw' : 'Saved'}
          </span>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving || loading}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving && <span className="material-icons text-base animate-spin">refresh</span>}
            <span className="material-icons text-base">save</span>
            Save
          </button>
        </div>
      </div>

      {placeholderCount === 0 && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-900 text-xs flex items-center gap-2 shrink-0">
          <span className="material-icons text-sm">warning</span>
          <span>
            Templates require a <strong>Post Content</strong> block — drag one in from the Layout category, or save now to have one auto-added at the top.
          </span>
        </div>
      )}

      {error && (
        <div className="px-4 py-2 bg-destructive/10 border-b border-destructive/20 text-destructive text-xs shrink-0">
          {error}
        </div>
      )}

      <div className="relative flex-1 min-h-0">
        {loading || !iframeSrc ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <span className="material-icons animate-spin">refresh</span>
          </div>
        ) : (
          <VisualEditorShell
            blocks={blocks}
            selectedBlockId={null}
            initialZoom={55}
            iframeSrc={iframeSrc}
            onBlocksChange={setBlocks}
            onSelectBlock={() => {}}
            onAddBlock={(type) => {
              const newBlock = createDefaultBlock(type as BlockType, { order: blocks.length });
              setBlocks([...blocks, newBlock]);
            }}
            onDeleteBlock={(blockId) => setBlocks(removeBlockById(blocks, blockId))}
            onUpdateBlock={(blockId, updates) => {
              const existing = findBlockById(blocks, blockId);
              if (!existing) return;
              setBlocks(updateBlockById(blocks, blockId, { ...existing, ...updates } as Block));
            }}
            extraBlockTypes={extraBlockTypes}
            siteId={parseInt(siteId, 10) || undefined}
          />
        )}
      </div>
    </div>
  );
}

function countPostContent(blocks: Block[]): number {
  let n = 0;
  for (const b of blocks) {
    if (b.type === 'post-content') n++;
    const inner = (b as { blocks?: Block[] }).blocks;
    if (Array.isArray(inner)) n += countPostContent(inner);
    const cols = (b as { columns?: Array<{ blocks?: Block[] }> }).columns;
    if (Array.isArray(cols)) for (const c of cols) if (Array.isArray(c.blocks)) n += countPostContent(c.blocks);
  }
  return n;
}
