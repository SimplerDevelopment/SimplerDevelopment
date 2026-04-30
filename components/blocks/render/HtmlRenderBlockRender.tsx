'use client';

import { useEffect, useRef } from 'react';
import { HtmlRenderBlock } from '@/types/blocks';
import { combineResponsiveClasses } from '@/lib/utils/responsive';

interface HtmlRenderBlockRenderProps {
  block: HtmlRenderBlock;
}

export function HtmlRenderBlockRender({ block }: HtmlRenderBlockRenderProps) {
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

  if (!block.html) {
    return (
      <div className={responsiveClasses}>
        <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
          <span className="material-icons text-7xl text-muted-foreground/20 mb-4">code</span>
          <p className="text-muted-foreground">No HTML yet — paste markup in the block settings panel.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={responsiveClasses}>
      <div className={containerClass}>
        <InlineHtml html={block.html} />
      </div>
    </div>
  );
}

// Inlines arbitrary HTML into the parent DOM and re-creates each <script>
// element so the browser actually executes it (scripts that come in via
// dangerouslySetInnerHTML are inert by spec). Mirrors the inline branch of
// HtmlEmbedBlockRender so behavior is identical.
function InlineHtml({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
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
