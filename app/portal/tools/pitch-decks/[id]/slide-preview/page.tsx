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

  const theme: PitchDeckTheme = {
    primaryColor: searchParams.get('pc') || '#2563eb',
    accentColor: searchParams.get('ac') || '#60a5fa',
    backgroundColor: searchParams.get('bg') || '#0f172a',
    textColor: searchParams.get('text') || '#f8fafc',
    headingFont: searchParams.get('hf') || 'Inter',
    bodyFont: searchParams.get('bf') || 'Inter',
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
    pageSettings: {
      backgroundColor: theme.backgroundColor,
      ...parsedPageSettings,
    },
  };

  // Force body to match theme so no portal background bleeds through
  useEffect(() => {
    document.documentElement.style.backgroundColor = theme.backgroundColor;
    document.documentElement.style.margin = '0';
    document.body.style.backgroundColor = theme.backgroundColor;
    document.body.style.margin = '0';
  }, [theme.backgroundColor]);

  if (isEditMode) {
    // Edit mode: keep the existing editable structure with theme styling
    return (
      <>
        <link href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(theme.headingFont)}:wght@400;500;600;700;800;900&family=${encodeURIComponent(theme.bodyFont)}:wght@300;400;500;600;700&display=swap`} rel="stylesheet" />
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
        <style dangerouslySetInnerHTML={{ __html: `
          :root {
            --foreground: ${theme.textColor};
            --card-foreground: ${theme.textColor};
            --background: ${theme.backgroundColor};
            --card: ${theme.backgroundColor};
            --primary: ${theme.primaryColor};
            --primary-foreground: ${theme.backgroundColor};
            --muted: color-mix(in srgb, ${theme.textColor} 10%, ${theme.backgroundColor});
            --muted-foreground: color-mix(in srgb, ${theme.textColor} 70%, transparent);
            --accent: color-mix(in srgb, ${theme.textColor} 10%, ${theme.backgroundColor});
            --accent-foreground: ${theme.textColor};
            --border: color-mix(in srgb, ${theme.textColor} 20%, transparent);
          }
          h1, h2, h3, h4, h5, h6 {
            font-family: "${theme.headingFont}", sans-serif !important;
            color: ${theme.textColor} !important;
          }
          body, p, li, span, div { color: ${theme.textColor}; }
          a, .text-primary { color: ${theme.primaryColor}; }
        `}} />
        <div
          className="relative"
          style={{
            backgroundColor: theme.backgroundColor,
            color: theme.textColor,
            fontFamily: `"${theme.bodyFont}", sans-serif`,
            width: '100%',
            minHeight: '100vh',
          }}
        >
          {parsedPageSettings.backgroundImage && (
            <div
              className="absolute inset-0 z-0"
              style={{
                backgroundImage: `url(${parsedPageSettings.backgroundImage})`,
                backgroundSize: parsedPageSettings.backgroundSize || 'cover',
                backgroundPosition: parsedPageSettings.backgroundPosition || 'center',
                backgroundRepeat: parsedPageSettings.backgroundRepeat || 'no-repeat',
                opacity: parsedPageSettings.backgroundOpacity ?? 1,
              }}
            />
          )}
          {parsedPageSettings.backgroundVideo && (
            <video
              autoPlay muted loop playsInline
              className="absolute inset-0 w-full h-full object-cover z-0"
              style={{ opacity: parsedPageSettings.backgroundOpacity ?? 1 }}
              src={parsedPageSettings.backgroundVideo}
            />
          )}
          <div
            className="w-full min-h-screen flex flex-col relative z-10"
            onClick={(e) => {
              if (e.target === e.currentTarget || !(e.target as HTMLElement).closest('[data-block-id]')) {
                editor.onBlockClicked('');
              }
            }}
            style={{
              ['--slide-primary' as string]: theme.primaryColor,
              ['--slide-accent' as string]: theme.accentColor,
              ['--slide-bg' as string]: theme.backgroundColor,
              ['--slide-text' as string]: theme.textColor,
              ['--slide-heading-font' as string]: theme.headingFont,
              ['--slide-body-font' as string]: theme.bodyFont,
            }}
          >
            <div className="w-full max-w-6xl mx-auto px-12 md:px-20 py-12" style={{ marginTop: 'auto', marginBottom: 'auto' }}>
              {branding ? (
                <BrandingProvider branding={branding}>
                  <EditableBlockRenderer content={content} />
                </BrandingProvider>
              ) : (
                <EditableBlockRenderer content={content} />
              )}
            </div>
          </div>
        </div>
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
      <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
      {branding ? <BrandingProvider branding={branding}>{previewBody}</BrandingProvider> : previewBody}
    </>
  );
}
