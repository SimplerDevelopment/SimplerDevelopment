import type { BaseBlock } from './base';

export interface ImageBlock extends BaseBlock {
  type: 'image';
  url: string;
  alt: string;
  caption?: string;
  width?: 'full' | 'large' | 'medium' | 'small';
  alignment?: 'left' | 'center' | 'right';
}

export interface VideoBlock extends BaseBlock {
  type: 'video';
  url: string;
  caption?: string;
  autoplay?: boolean;
  controls?: boolean;
}

export interface YoutubeBlock extends BaseBlock {
  type: 'youtube';
  url: string;
  caption?: string;
}

export interface GalleryBlock extends BaseBlock {
  type: 'gallery';
  images: Array<{
    id: string;
    url: string;
    alt: string;
    caption?: string;
  }>;
  layout?: 'grid' | 'masonry';
  columns?: 2 | 3 | 4;
  lightbox?: boolean;
  gap?: 'sm' | 'md' | 'lg';
}

export interface MarqueeItem {
  id: string;
  type: 'text' | 'image' | 'icon';
  content?: string; // text content or icon name
  imageUrl?: string;
  imageAlt?: string;
  link?: string;
}

export interface MarqueeBlock extends BaseBlock {
  type: 'marquee';
  items: MarqueeItem[];
  direction?: 'left' | 'right' | 'up' | 'down';
  speed?: number; // pixels per second, default 50
  pauseOnHover?: boolean;
  pauseOnClick?: boolean;
  gradient?: boolean;
  gradientColor?: string;
  gradientWidth?: number;
  autoFill?: boolean;
  gap?: string; // space between items, e.g. '40px'
  height?: string; // for vertical mode, e.g. '300px'
  loop?: number; // 0 = infinite
}

/**
 * Iframe sandbox preset. Maps to the actual `sandbox` attribute string in the
 * renderer. Free-form sandbox flags are intentionally not exposed — adding
 * `allow-same-origin` together with `allow-scripts` while serving from our
 * own origin would let the embedded HTML escape the sandbox.
 */
export type HtmlEmbedSandbox = 'strict' | 'scripts' | 'scripts-forms';

export interface HtmlEmbedBlock extends BaseBlock {
  type: 'html-embed';
  /** URL to the uploaded .html file (served from S3 via /api/media/proxy/...) */
  url: string;
  /** Original filename (display only) */
  filename?: string;
  /** ID of the backing media row — when present, re-uploads version the same row instead of creating a new one. */
  mediaId?: number;
  /** Server-resolved HTML body, injected at render time by lib/blocks/prefetch-embeds. Never persisted. */
  inlineHtml?: string;
  /** Iframe height — any CSS unit (e.g. "600px", "100vh"). Default "600px". */
  height?: string;
  /** 'full' = span container width, 'contained' = max-width 1024px centered */
  width?: 'full' | 'contained';
  /** Sandbox preset. Default 'scripts' (allow-scripts, no allow-same-origin) */
  sandbox?: HtmlEmbedSandbox;
  /** Accessibility label for the iframe */
  iframeTitle?: string;
  /** Optional caption rendered below the iframe */
  caption?: string;
}
