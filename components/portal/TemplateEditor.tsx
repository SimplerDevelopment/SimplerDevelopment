'use client';

import { useEffect, useMemo, useState } from 'react';
import { Block, BlockType } from '@/types/blocks';
import { VisualEditorShell } from '@/components/portal/VisualEditorShell';
import { CustomCodeModal } from '@/components/portal/CustomCodeModal';
import { POST_CONTENT_PICKER_ENTRY } from '@/lib/blocks/registry';
import { createDefaultBlock } from '@/lib/blocks/defaults';
import { findBlockById, removeBlockById, updateBlockById } from '@/lib/utils/blockHelpers';
// Both providers are required by the shell — TokenColorPicker (color picker
// inside the right-panel style settings) and ColumnsBlockPreview both throw if
// useDesignTokens / useBlockEditor are called outside their providers, which
// is what was breaking the template editor on first mount.
import { BlockEditorProvider } from '@/contexts/BlockEditorContext';
import { DesignTokensProvider } from '@/contexts/DesignTokensContext';

interface TemplateEditorProps {
  siteId: string;
  typeId: string;
  typeName: string;
  typeSlug: string;
  siteUrl: string | null;
  previewToken: string;
}

// Mounts the same iframe-based VisualEditorShell the post editor uses.
// Code (CSS/JS) and template blocks are edited together — a Code button in
// the toolbar opens the same CustomCodeModal the post editor uses, but
// scoped to the content type's customCss/customJs.
export function TemplateEditor({ siteId, typeId, typeName, typeSlug, siteUrl, previewToken }: TemplateEditorProps) {
  const templateEndpoint = `/api/portal/cms/websites/${siteId}/content-types/${typeId}/template`;
  const codeEndpoint = `/api/portal/cms/websites/${siteId}/content-types/${typeId}/code`;

  const [blocks, setBlocks] = useState<Block[]>([]);
  const [savedBlocks, setSavedBlocks] = useState<Block[]>([]);

  const [customCss, setCustomCss] = useState('');
  const [customJs, setCustomJs] = useState('');
  const [savedCss, setSavedCss] = useState('');
  const [savedJs, setSavedJs] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [iframeBust, setIframeBust] = useState(0);
  const [codeModalOpen, setCodeModalOpen] = useState(false);

  // Load template + custom code in parallel — both belong to this type.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [tplRes, codeRes] = await Promise.all([
          fetch(templateEndpoint).then(r => r.json()),
          fetch(codeEndpoint).then(r => r.json()),
        ]);
        if (cancelled) return;
        if (tplRes.success) {
          const initial = (tplRes.data?.template?.blocks ?? []) as Block[];
          setBlocks(initial);
          setSavedBlocks(initial);
        } else {
          setError(tplRes.message || 'Failed to load template.');
        }
        if (codeRes.success) {
          setCustomCss(codeRes.data?.customCss || '');
          setCustomJs(codeRes.data?.customJs || '');
          setSavedCss(codeRes.data?.customCss || '');
          setSavedJs(codeRes.data?.customJs || '');
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [templateEndpoint, codeEndpoint]);

  const blocksDirty = useMemo(() => JSON.stringify(blocks) !== JSON.stringify(savedBlocks), [blocks, savedBlocks]);
  const codeDirty = customCss !== savedCss || customJs !== savedJs;
  const dirty = blocksDirty || codeDirty;
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
      // Save in parallel — they target two different endpoints but belong to
      // the same Save action from the user's perspective.
      const tasks: Promise<unknown>[] = [];
      if (blocksDirty) {
        const template = blocks.length === 0 ? null : { blocks, version: '1.0' };
        tasks.push(
          fetch(templateEndpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ template }),
          }).then(r => r.json()).then((res: { success?: boolean; data?: { template?: { blocks?: Block[] } }; message?: string }) => {
            if (!res.success) throw new Error(res.message || 'Template save failed');
            const next = (res.data?.template?.blocks ?? []) as Block[];
            setBlocks(next);
            setSavedBlocks(next);
          })
        );
      }
      if (codeDirty) {
        tasks.push(
          fetch(codeEndpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customCss, customJs }),
          }).then(r => r.json()).then((res: { success?: boolean; data?: { customCss?: string; customJs?: string }; message?: string }) => {
            if (!res.success) throw new Error(res.message || 'Code save failed');
            setSavedCss(res.data?.customCss || '');
            setSavedJs(res.data?.customJs || '');
          })
        );
      }
      await Promise.all(tasks);
      setSavedAt(new Date());
      setIframeBust(v => v + 1); // force iframe reload to pick up persisted CSS/JS
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
    <DesignTokensProvider>
      <BlockEditorProvider initialBlocks={blocks} onBlocksChange={setBlocks}>
        <div className="flex flex-col h-[calc(100vh-4rem)]">
          <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border bg-background shrink-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="material-icons text-sm">view_quilt</span>
                <span>Content type</span>
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
                onClick={() => setCodeModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-border hover:bg-accent transition-colors"
                title="Edit custom CSS / JS for this content type"
              >
                <span className="material-icons text-base">code</span>
                Code
                {(customCss || customJs) && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[10px] font-semibold rounded-full bg-primary/10 text-primary">
                    {[customCss && 'CSS', customJs && 'JS'].filter(Boolean).join(' + ')}
                  </span>
                )}
              </button>
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
                customCss={customCss}
                customJs={customJs}
              />
            )}
          </div>

          {/* Code modal — same component the post editor uses, scoped here to
              the content type's customCss/customJs. The shell sees the new
              values immediately via the customCss/customJs props above; Save
              persists. */}
          <CustomCodeModal
            open={codeModalOpen}
            initialCss={customCss}
            initialJs={customJs}
            onClose={() => setCodeModalOpen(false)}
            onApply={(css, js) => {
              setCustomCss(css);
              setCustomJs(js);
            }}
          />
        </div>
      </BlockEditorProvider>
    </DesignTokensProvider>
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
