// PortalPostForm orchestrator — composes the post form sections + visual editor shell.
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PostEditorLayout } from '@/components/admin/PostEditorLayout';
import { PostFormInnerControls } from '@/components/admin/PostFormInner';
import { CustomCodeModal } from '@/components/portal/CustomCodeModal';
import { VisualEditorShell } from '@/components/portal/VisualEditorShell';
import { BlockEditorProvider } from '@/contexts/BlockEditorContext';
import { DesignTokensProvider } from '@/contexts/DesignTokensContext';
import { applyBrandDefaults, type BrandDefaultsContext } from '@/lib/branding/block-defaults';
import { createDefaultBlock } from '@/lib/blocks/defaults';
import { useContentTypes } from '@/lib/hooks/useContentTypes';
import { removeBlockById } from '@/lib/utils/blockHelpers';
import { Block, BlockType } from '@/types/blocks';
import { Breakpoint } from '@/types/responsive';
import { BodySection } from './post-form/sections/BodySection';
import { CreatePageIntroCard } from './post-form/sections/CreatePageIntroCard';
import {
  IframeViewportControls,
  UndoRedoControls,
} from './post-form/sections/IframeChromeControls';
import { InlineSettingsPanel } from './post-form/sections/InlineSettingsPanel';
import { RevisionsPanel } from './post-form/sections/RevisionsPanel';
import { SettingsSlideOver } from './post-form/sections/SettingsSlideOver';
import { usePostForm } from './post-form/_hooks/usePostForm';
import { blockTypes } from './post-form/_lib/blockTypes';
import type { Post } from './post-form/_lib/types';

interface PortalPostFormProps {
  siteId: number;
  post?: Post;
  mode: 'create' | 'edit';
  siteUrl?: string | null;
  publicUrl?: string | null;
  previewToken?: string;
  siteDomain?: string;
  /**
   * Optional brand context — pre-fills newly-created blocks with the client's
   * messaging (tagline, value prop, etc.) and tags them with brand sentinels.
   * Loaded server-side via getBrandDefaults().
   */
  brandDefaults?: BrandDefaultsContext;
  /**
   * Post-type template JSON for the post's content type (resolved server-side
   * via getPostTypeForPost). When present, the visual editor iframe renders
   * the type's wrapper chrome around the editable post-blocks slot — matching
   * production layout. Null when the type has no template.
   */
  typeTemplate?: string | null;
}

export default function PortalPostForm({
  siteId,
  post,
  mode,
  siteUrl,
  publicUrl,
  previewToken,
  brandDefaults,
  typeTemplate,
}: PortalPostFormProps) {
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contentMenuOpen, setContentMenuOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'visual' | 'classic' | 'iframe'>(
    siteUrl ? 'iframe' : 'visual',
  );
  const [iframeViewport, setIframeViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [currentViewport, setCurrentViewport] = useState<Breakpoint>('desktop');
  const [undoRedo, setUndoRedo] = useState<{ sendUndo: () => void; sendRedo: () => void; canUndo: boolean; canRedo: boolean } | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [useLocalhost, setUseLocalhost] = useState(false);
  const [localPort, setLocalPort] = useState('3003');
  const [hydrated, setHydrated] = useState(false);

  const contentTypes = useContentTypes(siteId);

  const {
    formData,
    setFormData,
    blocks,
    setBlocks,
    loading,
    postSaveStatus,
    iframeSaveVersion,
    availableCategories,
    setAvailableCategories,
    availableTags,
    setAvailableTags,
    handleTitleChange,
    handleSubmit,
    savePost,
    formDataRef,
    autosaveTimer,
  } = usePostForm({ siteId, post, mode, editorMode });

  // Hydrate localhost-toggle from localStorage after mount to avoid SSR mismatch
  useEffect(() => {
    setUseLocalhost(localStorage.getItem('editor-use-localhost') === 'true');
    setLocalPort(localStorage.getItem('editor-local-port') || '3003');
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem('editor-use-localhost', String(useLocalhost));
  }, [useLocalhost, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem('editor-local-port', localPort);
  }, [localPort, hydrated]);

  // Notify layout to hide/show sidebar when preview mode changes
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('portalPreviewMode', { detail: { active: previewMode } }));
    return () => {
      window.dispatchEvent(new CustomEvent('portalPreviewMode', { detail: { active: false } }));
    };
  }, [previewMode]);

  // On localhost, the starter site serves pages at the root (no /sites/[domain] prefix)
  const localhostBase = `http://localhost:${localPort}`;
  const effectiveSiteUrl = useLocalhost ? localhostBase : siteUrl;

  const liveUrl = (() => {
    if (!post?.slug) return null;
    const basePath = `${formData.postType === 'page' ? '' : '/blog'}/${post.slug}`;
    if (!formData.published && effectiveSiteUrl) {
      const tokenParam = previewToken ? `&_token=${previewToken}` : '';
      return `${effectiveSiteUrl}${basePath}?_preview=true${tokenParam}`;
    }
    if (publicUrl) return `${publicUrl}${basePath}`;
    return null;
  })();

  const layoutContent = (
    <form onSubmit={handleSubmit} className="container mx-auto px-4 py-6 space-y-6">
      {settingsOpen && (
        <InlineSettingsPanel
          formData={formData}
          setFormData={setFormData}
          handleTitleChange={handleTitleChange}
          contentTypes={contentTypes}
          availableCategories={availableCategories}
          availableTags={availableTags}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {editorMode !== 'iframe' && (
        <BodySection
          editorMode={editorMode}
          blocks={blocks}
          setBlocks={setBlocks}
          blockTypes={blockTypes}
          brandDefaults={brandDefaults}
        />
      )}

      <div className="flex gap-4">
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? 'Saving...' : mode === 'create' ? 'Create Page' : 'Save Changes'}
        </button>
        {mode === 'edit' && post?.id ? (
          <button
            type="button"
            onClick={async () => {
              try {
                const res = await fetch(`/api/portal/posts/${post.id}/experiments`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: `A/B test — ${formData.title || 'Untitled'}` }),
                });
                const json = await res.json();
                if (json.success && json.data?.id) {
                  router.push(`/portal/experiments/${json.data.id}`);
                } else {
                  alert(json.error || 'Failed to create experiment');
                }
              } catch (err) {
                alert(err instanceof Error ? err.message : 'Failed to create experiment');
              }
            }}
            className="px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-md hover:bg-accent inline-flex items-center gap-1"
          >
            <span className="material-icons text-base">science</span>
            Start A/B test
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => router.push(`/portal/websites/${siteId}`)}
          className="px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-md hover:bg-accent"
        >
          Cancel
        </button>
      </div>
    </form>
  );

  return (
    <DesignTokensProvider>
      <BlockEditorProvider
        initialBlocks={blocks}
        onBlocksChange={setBlocks}
        initialViewport={currentViewport}
        onViewportChange={setCurrentViewport}
      >
        <PostEditorLayout
          postTitle={formData.title || (mode === 'create' ? 'New Page' : 'Edit Page')}
          onOpenSettings={() => setSettingsOpen(prev => !prev)}
          backHref={`/portal/websites/${siteId}`}
          liveUrl={liveUrl}
          editorControls={
            editorMode === 'iframe' ? undefined : (
              <PostFormInnerControls
                contentMode="blocks"
                editorMode={editorMode}
                onEditorModeChange={(mode) => setEditorMode(mode)}
                contentMenuOpen={contentMenuOpen}
                onContentMenuToggle={() => setContentMenuOpen(prev => !prev)}
                onContentModeChange={() => {}}
              />
            )
          }
          centerControls={
            editorMode === 'iframe' ? (
              <IframeViewportControls
                iframeViewport={iframeViewport}
                setIframeViewport={setIframeViewport}
                useLocalhost={useLocalhost}
                setUseLocalhost={setUseLocalhost}
                localPort={localPort}
                setLocalPort={setLocalPort}
              />
            ) : undefined
          }
          published={formData.published}
          onPublish={handleSubmit}
          onStatusChange={(status) => setFormData(prev => ({ ...prev, published: status === 'published' }))}
          previewMode={previewMode}
          onPreviewToggle={editorMode === 'iframe' ? () => setPreviewMode(prev => !prev) : undefined}
          onHistoryToggle={editorMode === 'iframe' && mode === 'edit' ? () => setHistoryOpen(prev => !prev) : undefined}
          historyOpen={historyOpen}
          onCodeToggle={editorMode === 'iframe' && mode === 'edit' ? () => setCodeModalOpen(prev => !prev) : undefined}
          hasCustomCode={Boolean((formData.customCss && formData.customCss.trim()) || (formData.customJs && formData.customJs.trim()))}
          saveStatus={postSaveStatus}
          extraNavControls={editorMode === 'iframe' && undoRedo ? <UndoRedoControls undoRedo={undoRedo} /> : undefined}
        >
          {editorMode === 'iframe' && effectiveSiteUrl && !post?.slug ? (
            <CreatePageIntroCard
              formData={formData}
              setFormData={setFormData}
              handleTitleChange={handleTitleChange}
              contentTypes={contentTypes}
              loading={loading}
              onSubmit={() => handleSubmit()}
            />
          ) : editorMode === 'iframe' && effectiveSiteUrl && post?.slug ? (
            <div className="relative flex-1">
              <VisualEditorShell
                blocks={blocks}
                selectedBlockId={null}
                initialZoom={55}
                iframeSrc={(() => {
                  const basePath = formData.postType === 'page' ? `/${post.slug}` : `/blog/${post.slug}`;
                  const sep = previewMode ? '?' : '&';
                  const cacheBust = iframeSaveVersion > 0 ? `${sep}_v=${iframeSaveVersion}` : '';
                  const tokenParam = previewToken ? `&_token=${previewToken}` : '';
                  return previewMode ? `${effectiveSiteUrl}${basePath}?_preview=true${tokenParam}${cacheBust ? '&' + cacheBust.slice(1) : ''}` : `${effectiveSiteUrl}${basePath}?_edit=true${tokenParam}${cacheBust}`;
                })()}
                viewport={iframeViewport}
                previewMode={previewMode}
                onBlocksChange={setBlocks}
                onSelectBlock={() => {}}
                onAddBlock={(type) => {
                  let newBlock = createDefaultBlock(type as BlockType, { order: blocks.length });
                  if (brandDefaults) newBlock = applyBrandDefaults(newBlock, brandDefaults);
                  setBlocks([...blocks, newBlock]);
                }}
                onDeleteBlock={(blockId) => setBlocks(removeBlockById(blocks, blockId))}
                onUndoRedoChange={setUndoRedo}
                onUpdateBlock={(blockId, updates) => setBlocks(blocks.map(b => b.id === blockId ? ({ ...b, ...updates } as Block) : b))}
                siteId={siteId}
                customCss={formData.customCss || ''}
                customJs={formData.customJs || ''}
                typeTemplate={typeTemplate}
              />

              {settingsOpen && (
                <SettingsSlideOver
                  formData={formData}
                  setFormData={setFormData}
                  handleTitleChange={handleTitleChange}
                  siteId={siteId}
                  contentTypes={contentTypes}
                  availableCategories={availableCategories}
                  setAvailableCategories={setAvailableCategories}
                  availableTags={availableTags}
                  setAvailableTags={setAvailableTags}
                  onClose={() => setSettingsOpen(false)}
                />
              )}

              {post?.id && (
                <RevisionsPanel
                  siteId={siteId}
                  postId={post.id}
                  open={historyOpen}
                  onClose={() => setHistoryOpen(false)}
                />
              )}

              <CustomCodeModal
                open={codeModalOpen}
                initialCss={formData.customCss || ''}
                initialJs={formData.customJs || ''}
                onClose={() => setCodeModalOpen(false)}
                onApply={(css, js) => {
                  setFormData(prev => ({ ...prev, customCss: css, customJs: js }));
                  formDataRef.current = { ...formDataRef.current, customCss: css, customJs: js };
                  // CSS appears live in the iframe via VisualEditorShell's
                  // sendCustomCodeUpdate effect — no manual save needed.
                  // Autosave persists the change without reloading the iframe
                  // (which would reset scroll + selection).
                  if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
                  autosaveTimer.current = setTimeout(() => { savePost('autosave'); }, 100);
                }}
              />
            </div>
          ) : (
            layoutContent
          )}
        </PostEditorLayout>
      </BlockEditorProvider>
    </DesignTokensProvider>
  );
}
