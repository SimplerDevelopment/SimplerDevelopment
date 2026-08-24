/**
 * Block components, and the map that binds them to CMS block types.
 *
 * TO ADD A BLOCK: write a component that takes `{ block }`, then add it to
 * BLOCK_COMPONENTS under the `type` string the CMS uses. That string is the
 * contract — `GET /api/v1/sites/:siteId/blocks` lists every type the platform
 * can emit, and is the authoritative catalog to check against.
 *
 * These implementations are deliberately plain. They are a working starting
 * point wired to the site's branding variables, not a design system — replace
 * them with your own markup rather than layering overrides on top.
 */
import type { CSSProperties } from 'react';
import type { StarterBlock } from '@/lib/content';

// ---- helpers: CMS values are `unknown` until proven otherwise ---------------

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const rec = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};

/** Blocks carry an optional inline `style` object; pass it through as-is. */
function blockStyle(block: StarterBlock): CSSProperties {
  return rec(block.style) as CSSProperties;
}

const align = (v: unknown): CSSProperties =>
  typeof v === 'string' && ['left', 'center', 'right'].includes(v)
    ? { textAlign: v as 'left' | 'center' | 'right' }
    : {};

export interface BlockProps {
  block: StarterBlock;
}

// ---- basic -----------------------------------------------------------------

export function TextBlock({ block }: BlockProps) {
  return <p style={{ ...align(block.alignment), ...blockStyle(block) }}>{str(block.content)}</p>;
}

export function HeadingBlock({ block }: BlockProps) {
  const level = Math.min(6, Math.max(1, num(block.level, 2)));
  // `as` lets an editor render an eyebrow/overline without breaking heading order.
  const Tag = (str(block.as) || `h${level}`) as 'h1';
  return <Tag style={{ ...align(block.alignment), ...blockStyle(block) }}>{str(block.content)}</Tag>;
}

export function ImageBlock({ block }: BlockProps) {
  const src = str(block.src);
  if (!src) return null;
  return (
    <figure style={blockStyle(block)}>
      {/* Plain <img> on purpose: next/image needs remotePatterns configured for
          whichever host serves your media. Swap it in once that is set. */}
      <img src={src} alt={str(block.alt)} style={{ maxWidth: '100%', height: 'auto' }} />
      {str(block.caption) && <figcaption>{str(block.caption)}</figcaption>}
    </figure>
  );
}

export function ButtonBlock({ block }: BlockProps) {
  const url = str(block.url) || '#';
  return (
    <a href={url} className="sd-button" style={blockStyle(block)}>
      {str(block.label, 'Learn more')}
    </a>
  );
}

export function SpacerBlock({ block }: BlockProps) {
  return <div aria-hidden style={{ height: str(block.height, '2rem') }} />;
}

export function DividerBlock({ block }: BlockProps) {
  return <hr style={{ borderStyle: str(block.style_, 'solid'), ...blockStyle(block) }} />;
}

export function QuoteBlock({ block }: BlockProps) {
  return (
    <blockquote style={blockStyle(block)}>
      <p>{str(block.content)}</p>
      {str(block.author) && (
        <footer>
          {str(block.author)}
          {str(block.role) && <span>, {str(block.role)}</span>}
        </footer>
      )}
    </blockquote>
  );
}

// ---- layout ----------------------------------------------------------------

export function SectionBlock({ block }: BlockProps) {
  return (
    <section style={{ padding: str(block.padding, '3rem 0'), ...blockStyle(block) }}>
      <BlockList blocks={arr(block.children) as StarterBlock[]} />
    </section>
  );
}

export function ColumnsBlock({ block }: BlockProps) {
  const columns = arr(block.columns);
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.max(1, columns.length)}, minmax(0, 1fr))`,
        gap: str(block.gap, '1.5rem'),
        ...blockStyle(block),
      }}
    >
      {columns.map((col, i) => (
        <div key={i}>
          <BlockList blocks={arr(rec(col).blocks ?? col) as StarterBlock[]} />
        </div>
      ))}
    </div>
  );
}

// ---- components ------------------------------------------------------------

export function HeroBlock({ block }: BlockProps) {
  const bg = str(block.backgroundImage);
  return (
    <section
      style={{
        padding: '5rem 1.5rem',
        backgroundImage: bg ? `url(${bg})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        ...blockStyle(block),
      }}
    >
      <h1>{str(block.title)}</h1>
      {str(block.subtitle) && <p>{str(block.subtitle)}</p>}
      {str(block.ctaLabel) && (
        <a className="sd-button" href={str(block.ctaUrl) || '#'}>
          {str(block.ctaLabel)}
        </a>
      )}
    </section>
  );
}

export function CtaBlock({ block }: BlockProps) {
  return (
    <section style={{ padding: '3rem 1.5rem', ...blockStyle(block) }}>
      <h2>{str(block.title)}</h2>
      {str(block.description) && <p>{str(block.description)}</p>}
      {str(block.buttonLabel) && (
        <a className="sd-button" href={str(block.buttonUrl) || '#'}>
          {str(block.buttonLabel)}
        </a>
      )}
    </section>
  );
}

export function CardGridBlock({ block }: BlockProps) {
  const cards = arr(block.cards);
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(min(18rem, 100%), 1fr))`,
        gap: '1.5rem',
        ...blockStyle(block),
      }}
    >
      {cards.map((c, i) => {
        const card = rec(c);
        return (
          <article key={i} className="sd-card">
            {str(card.image) && <img src={str(card.image)} alt="" style={{ maxWidth: '100%' }} />}
            <h3>{str(card.title)}</h3>
            {str(card.description) && <p>{str(card.description)}</p>}
          </article>
        );
      })}
    </div>
  );
}

export function StatsBlock({ block }: BlockProps) {
  const stats = arr(block.stats);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', ...blockStyle(block) }}>
      {stats.map((s, i) => {
        const stat = rec(s);
        return (
          <div key={i}>
            <strong style={{ fontSize: '2rem', display: 'block' }}>{str(stat.value)}</strong>
            <span>{str(stat.label)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function GalleryBlock({ block }: BlockProps) {
  const images = arr(block.images);
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${num(block.columns, 3)}, minmax(0, 1fr))`,
        gap: '0.75rem',
        ...blockStyle(block),
      }}
    >
      {images.map((img, i) => {
        const image = typeof img === 'string' ? { src: img } : rec(img);
        return <img key={i} src={str(image.src)} alt={str(image.alt)} style={{ width: '100%' }} />;
      })}
    </div>
  );
}

// ---- media -----------------------------------------------------------------

export function VideoBlock({ block }: BlockProps) {
  const src = str(block.src);
  if (!src) return null;
  return <video controls poster={str(block.poster) || undefined} src={src} style={{ maxWidth: '100%', ...blockStyle(block) }} />;
}

export function YouTubeBlock({ block }: BlockProps) {
  const id = str(block.videoId);
  if (!id) return null;
  return (
    <div style={{ aspectRatio: '16 / 9', ...blockStyle(block) }}>
      <iframe
        src={`https://www.youtube.com/embed/${encodeURIComponent(id)}`}
        title="YouTube video"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        style={{ width: '100%', height: '100%', border: 0 }}
      />
    </div>
  );
}

// ---- registry --------------------------------------------------------------

export const BLOCK_COMPONENTS: Record<string, (props: BlockProps) => React.ReactNode> = {
  text: TextBlock,
  heading: HeadingBlock,
  image: ImageBlock,
  button: ButtonBlock,
  spacer: SpacerBlock,
  divider: DividerBlock,
  quote: QuoteBlock,
  section: SectionBlock,
  columns: ColumnsBlock,
  hero: HeroBlock,
  cta: CtaBlock,
  'card-grid': CardGridBlock,
  stats: StatsBlock,
  gallery: GalleryBlock,
  video: VideoBlock,
  youtube: YouTubeBlock,
};

/** Render an ordered list of blocks. Exported here so layout blocks can nest. */
export function BlockList({ blocks }: { blocks: StarterBlock[] }) {
  return (
    <>
      {blocks.map((block, i) => {
        const Component = BLOCK_COMPONENTS[block.type];
        if (!Component) {
          // Unknown type: never crash the page. In development say so loudly,
          // because a silently missing section is hard to notice and harder to
          // diagnose. In production render nothing at all.
          if (process.env.NODE_ENV !== 'production') {
            return (
              <div
                key={block.id ?? i}
                style={{ padding: '1rem', border: '1px dashed currentColor', opacity: 0.7 }}
              >
                No component registered for block type <code>{block.type}</code> — add one in
                components/blocks.tsx.
              </div>
            );
          }
          return null;
        }
        return (
          <div key={block.id ?? i} id={typeof block.anchor === 'string' ? block.anchor : undefined}>
            <Component block={block} />
          </div>
        );
      })}
    </>
  );
}
