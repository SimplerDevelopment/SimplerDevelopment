'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { EditorModeProvider, useEditorModeContext } from '@/components/visual-editor/EditorModeProvider';
import { EditableBlockRenderer } from '@/components/blocks/render/EditableBlockRenderer';
import { SlideBlockWrapper } from '@/components/pitch-deck/SlideBlockWrapper';
import { BrandingProvider } from '@/contexts/BrandingContext';
import { isVisualEditorMessage, sendToParent } from '@/lib/visual-editor/protocol';
import { PARENT_MESSAGES } from '@/types/visual-editor';
import type { Block } from '@/types/blocks';
import type { PitchDeckSlideV2, PitchDeckTheme } from '@/lib/db/schema';
import type { ResolvedBranding } from '@/lib/branding-types';

/**
 * Coerce a raw `branding_profiles` DB row (as returned by
 * /api/portal/branding/profiles/:id) into the ResolvedBranding shape expected
 * by BrandingProvider. DB nullables are filled with sensible fallbacks so
 * brand-aware blocks never reach a var(--brand-*) with no value.
 */
function profileRowToResolvedBranding(raw: Record<string, unknown>): ResolvedBranding {
  const s = (v: unknown, fallback = '') => (typeof v === 'string' && v ? v : fallback);
  return {
    primaryColor: s(raw.primaryColor, '#2563eb'),
    secondaryColor: s(raw.secondaryColor, '#1e40af'),
    accentColor: s(raw.accentColor, '#f59e0b'),
    backgroundColor: s(raw.backgroundColor, '#ffffff'),
    textColor: s(raw.textColor, '#111827'),
    headingFont: s(raw.headingFont, 'Inter'),
    bodyFont: s(raw.bodyFont, 'Inter'),
    logoUrl: s(raw.logoUrl),
    logoSquareUrl: s(raw.logoSquareUrl),
    logoRectUrl: s(raw.logoRectUrl),
    logoIconUrl: s(raw.logoIconUrl),
    logoText: s(raw.logoText),
    logoAlt: s(raw.logoAlt),
    navTemplate: s(raw.navTemplate, 'classic'),
    navPosition: s(raw.navPosition, 'top'),
    navBackground: s(raw.navBackground, '#ffffff'),
    navTextColor: s(raw.navTextColor, '#111827'),
    typography: (raw.typography as ResolvedBranding['typography']) ?? undefined,
    darkMode: (raw.darkMode as ResolvedBranding['darkMode']) ?? undefined,
    borderRadius: s(raw.borderRadius) || undefined,
    linkColor: s(raw.linkColor) || undefined,
    linkHoverColor: s(raw.linkHoverColor) || undefined,
    buttonStyle: (raw.buttonStyle as ResolvedBranding['buttonStyle']) ?? undefined,
    buttonPresets: (raw.buttonPresets as ResolvedBranding['buttonPresets']) ?? undefined,
    faviconUrl: s(raw.faviconUrl) || undefined,
    ogImageUrl: s(raw.ogImageUrl) || undefined,
  };
}

export default function SlidePreviewPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh' }} />}>
      <EditorModeProvider>
        <SlidePreviewInner />
      </EditorModeProvider>
    </Suspense>
  );
}

function SlidePreviewInner() {
  const searchParams = useSearchParams();
  const isEditMode = searchParams.get('_edit') === 'true';
  const editor = useEditorModeContext();
  const [previewBlocks, setPreviewBlocks] = useState<Block[]>([]);
  const [branding, setBranding] = useState<ResolvedBranding | null>(null);

  const slideCustomCss = searchParams.get('scss') || undefined;
  const theme: PitchDeckTheme = {
    primaryColor: searchParams.get('pc') || '#2563eb',
    accentColor: searchParams.get('ac') || '#60a5fa',
    backgroundColor: searchParams.get('bg') || '#0f172a',
    textColor: searchParams.get('text') || '#f8fafc',
    headingFont: searchParams.get('hf') || 'Inter',
    bodyFont: searchParams.get('bf') || 'Inter',
    customCss: searchParams.get('tcss') || undefined,
  };

  // Fetch the deck's branding profile so BrandingProvider can expose
  // --brand-primary / --brand-accent / button presets / etc. to blocks that
  // use useBranding() (ButtonBlock, CtaBlock, etc.). Without this wrapper,
  // those blocks fall back to Tailwind defaults and look "under styled".
  const profileId = searchParams.get('profileId');
  useEffect(() => {
    if (!profileId) { setBranding(null); return; }
    let cancelled = false;
    fetch(`/api/portal/branding/profiles/${profileId}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        if (d?.success && d.data) setBranding(profileRowToResolvedBranding(d.data));
      })
      .catch(() => { if (!cancelled) setBranding(null); });
    return () => { cancelled = true; };
  }, [profileId]);

  // In preview mode, listen for blocks from parent since useEditorMode is inactive
  useEffect(() => {
    if (isEditMode) return;

    function handleMessage(event: MessageEvent) {
      if (!isVisualEditorMessage(event.data)) return;
      if (event.data.source !== 'sd-editor-parent') return;

      if (event.data.type === PARENT_MESSAGES.EDITOR_INIT || event.data.type === PARENT_MESSAGES.BLOCKS_UPDATE) {
        const { blocks } = event.data.payload as { blocks: Block[] };
        setPreviewBlocks(blocks || []);
      }
    }

    window.addEventListener('message', handleMessage);
    sendToParent('IFRAME_READY', { registeredComponents: [] });

    return () => window.removeEventListener('message', handleMessage);
  }, [isEditMode]);

  const content = JSON.stringify({ blocks: isEditMode ? [] : previewBlocks, version: '1.0' });

  // Parse full pageSettings from URL param (includes bg image, video, etc.)
  const parsedPageSettings = (() => {
    try {
      const ps = searchParams.get('ps');
      return ps ? JSON.parse(ps) : {};
    } catch { return {}; }
  })();

  // Build a virtual slide from the current blocks for SlideBlockWrapper
  const virtualSlide: PitchDeckSlideV2 = {
    id: 'preview',
    label: 'Preview',
    blocks: isEditMode ? [] : previewBlocks,
    customCss: slideCustomCss,
    pageSettings: {
      backgroundColor: theme.backgroundColor,
      ...parsedPageSettings,
    },
  };

  // The live presentation injects deck-global (theme.customCss) and per-slide
  // (slide.customCss) custom CSS. Mirror that here so the editor preview — in
  // BOTH edit and preview modes — matches the published deck exactly.
  const customCssTags = (
    <>
      {theme.customCss && <style dangerouslySetInnerHTML={{ __html: theme.customCss }} />}
      {slideCustomCss && <style dangerouslySetInnerHTML={{ __html: slideCustomCss }} />}
    </>
  );

  // Force body to match theme so no portal background bleeds through
  useEffect(() => {
    document.documentElement.style.backgroundColor = theme.backgroundColor;
    document.documentElement.style.margin = '0';
    document.body.style.backgroundColor = theme.backgroundColor;
    document.body.style.margin = '0';
  }, [theme.backgroundColor]);

  if (isEditMode) {
    // Edit mode: render through the SAME SlideBlockWrapper the live presentation
    // uses, passing EditableBlockRenderer as its content. This guarantees the
    // edit-mode preview shares identical theme chrome (CSS vars, font scoping,
    // accent-colored links, un-forced heading colors, background image/video)
    // with the published deck — the two pipelines can no longer drift. The only
    // difference from live is the editing affordances inside EditableBlockRenderer.
    const editBody = (
      <SlideBlockWrapper
        slide={virtualSlide}
        theme={theme}
        className="min-h-screen w-full flex items-center justify-center"
        onContentBackgroundClick={(e) => {
          if (e.target === e.currentTarget || !(e.target as HTMLElement).closest('[data-block-id]')) {
            editor.onBlockClicked('');
          }
        }}
      >
        <EditableBlockRenderer content={content} />
      </SlideBlockWrapper>
    );
    return (
      <>
        <link href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(theme.headingFont)}:wght@400;500;600;700;800;900&family=${encodeURIComponent(theme.bodyFont)}:wght@300;400;500;600;700&display=swap`} rel="stylesheet" />
        {customCssTags}
        {branding ? <BrandingProvider branding={branding}>{editBody}</BrandingProvider> : editBody}
      </>
    );
  }

  // Preview mode: use the actual SlideBlockWrapper for pixel-perfect match with live view.
  // Mirror the live presentation's auto-full-bleed for single full-width html-embed slides.
  const blockOnly = previewBlocks.length === 1 ? previewBlocks[0] : null;
  const isFullBleedHtml = blockOnly?.type === 'html-embed' && (blockOnly.width ?? 'full') === 'full';
  const previewBody = (
    <SlideBlockWrapper
      slide={virtualSlide}
      theme={theme}
      className="min-h-screen w-full flex items-center justify-center"
      fullBleed={isFullBleedHtml}
    />
  );
  return (
    <>
      {customCssTags}
      {branding ? <BrandingProvider branding={branding}>{previewBody}</BrandingProvider> : previewBody}
    </>
  );
}
