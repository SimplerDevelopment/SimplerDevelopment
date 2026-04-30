'use client';

import { HtmlEmbedBlock, HtmlEmbedSandbox } from '@/types/blocks';
import { combineResponsiveClasses } from '@/lib/utils/responsive';

interface HtmlEmbedBlockRenderProps {
  block: HtmlEmbedBlock;
}

const SANDBOX_PRESETS: Record<HtmlEmbedSandbox, string> = {
  strict: '',
  scripts: 'allow-scripts',
  'scripts-forms': 'allow-scripts allow-forms allow-popups',
};

export function HtmlEmbedBlockRender({ block }: HtmlEmbedBlockRenderProps) {
  const sandbox = SANDBOX_PRESETS[block.sandbox || 'scripts'];
  const height = block.height || '600px';
  const isContained = block.width === 'contained';

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

  return (
    <div className={responsiveClasses}>
      <div className={isContained ? 'max-w-5xl mx-auto' : 'w-full'}>
        <iframe
          src={block.url}
          title={block.iframeTitle || 'Embedded HTML content'}
          // Sandbox without `allow-same-origin` gives the iframe an opaque
          // origin, so the embedded HTML can't read cookies/storage on the
          // parent origin even though the asset is served from /api/media.
          sandbox={sandbox}
          referrerPolicy="no-referrer"
          loading="lazy"
          className="w-full block border-0"
          style={{ height }}
        />
        {block.caption && (
          <p className="text-sm text-muted-foreground mt-2 text-center italic">
            {block.caption}
          </p>
        )}
      </div>
    </div>
  );
}
