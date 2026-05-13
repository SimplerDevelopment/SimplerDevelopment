'use client';

import { useEffect, useRef } from 'react';
import { HtmlEmbedBlock, HtmlEmbedSandbox } from '@/types/blocks';
import { combineResponsiveClasses } from '@/lib/utils/responsive';

interface HtmlEmbedBlockRenderProps {
  block: HtmlEmbedBlock;
}

// `allow-popups` lets the embed open `target="_blank"` links / `window.open`.
// `allow-popups-to-escape-sandbox` lets the spawned tab itself be un-sandboxed
// so third-party destinations (Calendly, Stripe Checkout, etc.) actually run.
// Neither flag exposes the parent page's storage or cookies — the load-bearing
// rule (don't combine `allow-same-origin` with `allow-scripts` on our own
// origin) still holds.
const SANDBOX_PRESETS: Record<HtmlEmbedSandbox, string> = {
  strict: '',
  scripts: 'allow-scripts allow-popups allow-popups-to-escape-sandbox',
  'scripts-forms': 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox',
};

export function HtmlEmbedBlockRender({ block }: HtmlEmbedBlockRenderProps) {
  const responsiveClasses = block.responsive
    ? combineResponsiveClasses(
        block.responsive.paddingTop,
        block.responsive.paddingBottom,
        block.responsive.paddingLeft,
        block.responsive.paddingRight,
        block.responsive.marginTop,
        block.responsive.marginBottom,
        block.responsive.marginLeft,
        block.responsive.marginRight,
        block.responsive.visibility
      )
    : '';

  const isContained = block.width === 'contained';
  const containerClass = isContained ? 'max-w-5xl mx-auto' : 'w-full';

  // Server-prefetched HTML inlines into the page DOM — this is the SEO path:
  // crawlers see the actual markup, not an opaque iframe. Scripts that came
  // through dangerouslySetInnerHTML are inert by spec, so we re-create them
  // after mount to get behavior parity with the iframe path.
  if (block.inlineHtml) {
    return (
      <div className={responsiveClasses}>
        <div className={containerClass}>
          <InlineHtml html={block.inlineHtml} />
          {block.caption && (
            <p className="text-sm text-muted-foreground mt-2 text-center italic">{block.caption}</p>
          )}
        </div>
      </div>
    );
  }

  // No URL — empty state.
  if (!block.url) {
    return (
      <div className={responsiveClasses}>
        <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
          <span className="material-icons text-7xl text-muted-foreground/20 mb-4">code</span>
          <p className="text-muted-foreground">No HTML file uploaded yet</p>
        </div>
      </div>
    );
  }

  // Fallback iframe path — editor preview, or production render where the
  // server-side prefetch failed. Iframe sandbox keeps the embedded HTML in
  // an opaque origin so it can't read parent cookies/storage.
  const sandbox = SANDBOX_PRESETS[block.sandbox || 'scripts'];
  const height = block.height || '600px';
  return (
    <div className={responsiveClasses}>
      <div className={containerClass}>
        <iframe
          src={block.url}
          title={block.iframeTitle || 'Embedded HTML content'}
          sandbox={sandbox}
          referrerPolicy="no-referrer"
          loading="lazy"
          className="w-full block border-0"
          style={{ height }}
        />
        {block.caption && (
          <p className="text-sm text-muted-foreground mt-2 text-center italic">{block.caption}</p>
        )}
      </div>
    </div>
  );
}

function InlineHtml({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Replace each inert <script> with a fresh element so the browser
    // executes it. Process in document order to preserve dependency chains.
    const scripts = Array.from(el.querySelectorAll('script'));
    for (const old of scripts) {
      const fresh = document.createElement('script');
      for (const { name, value } of Array.from(old.attributes)) {
        fresh.setAttribute(name, value);
      }
      if (old.textContent) fresh.textContent = old.textContent;
      old.replaceWith(fresh);
    }
  }, [html]);

  return <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />;
}
