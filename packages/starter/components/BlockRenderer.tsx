interface Block {
  id: string;
  type: string;
  order: number;
  [key: string]: unknown;
}

interface BlockRendererProps {
  content: string;
}

export default function BlockRenderer({ content }: BlockRendererProps) {
  let blocks: Block[] = [];

  try {
    const parsed = JSON.parse(content);
    blocks = Array.isArray(parsed) ? parsed : parsed.blocks || [];
  } catch {
    // If not JSON, render as raw HTML
    return <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: content }} />;
  }

  if (blocks.length === 0) return null;

  return (
    <div className="space-y-6">
      {blocks.sort((a, b) => a.order - b.order).map(block => (
        <RenderBlock key={block.id} block={block} />
      ))}
    </div>
  );
}

function RenderBlock({ block }: { block: Block }) {
  switch (block.type) {
    case 'text':
      return (
        <div
          className="max-w-4xl mx-auto px-4 prose"
          style={{ textAlign: (block.alignment as string) || 'left' }}
          dangerouslySetInnerHTML={{ __html: block.content as string }}
        />
      );

    case 'heading': {
      const Tag = `h${block.level || 2}` as keyof JSX.IntrinsicElements;
      return (
        <div className="max-w-4xl mx-auto px-4" style={{ textAlign: (block.alignment as string) || 'left' }}>
          <Tag className="font-bold">{block.content as string}</Tag>
        </div>
      );
    }

    case 'image':
      return (
        <figure className="max-w-4xl mx-auto px-4">
          <img src={block.src as string} alt={(block.alt as string) || ''} className="rounded-lg w-full" />
          {block.caption && <figcaption className="text-sm text-gray-500 mt-2 text-center">{block.caption as string}</figcaption>}
        </figure>
      );

    case 'button':
      return (
        <div className="max-w-4xl mx-auto px-4">
          <a
            href={block.url as string}
            className="inline-block px-6 py-3 bg-[var(--brand-primary)] text-white rounded-lg font-medium hover:opacity-90"
          >
            {block.label as string}
          </a>
        </div>
      );

    case 'spacer':
      return <div style={{ height: `${block.height || 40}px` }} />;

    case 'divider':
      return <hr className="max-w-4xl mx-auto border-gray-200" />;

    case 'quote':
      return (
        <blockquote className="max-w-4xl mx-auto px-4 border-l-4 border-[var(--brand-primary)] pl-6 italic">
          <p>{block.content as string}</p>
          {block.author && (
            <footer className="mt-2 text-sm text-gray-500 not-italic">
              &mdash; {block.author as string}{block.role ? `, ${block.role}` : ''}
            </footer>
          )}
        </blockquote>
      );

    case 'hero':
      return (
        <section
          className="relative py-24 px-4 text-center"
          style={{
            backgroundImage: block.backgroundImage ? `url(${block.backgroundImage})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {block.backgroundImage && <div className="absolute inset-0 bg-black/40" />}
          <div className="relative max-w-4xl mx-auto text-white">
            <h1 className="text-5xl font-bold mb-4">{block.title as string}</h1>
            {block.subtitle && <p className="text-xl mb-8 opacity-90">{block.subtitle as string}</p>}
            {block.ctaLabel && (
              <a
                href={block.ctaUrl as string}
                className="inline-block px-8 py-3 bg-[var(--brand-primary)] text-white rounded-lg font-semibold hover:opacity-90"
              >
                {block.ctaLabel as string}
              </a>
            )}
          </div>
        </section>
      );

    case 'cta':
      return (
        <section className="py-16 px-4 bg-[var(--brand-primary)] text-white text-center">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold mb-4">{block.title as string}</h2>
            {block.description && <p className="mb-8 opacity-90">{block.description as string}</p>}
            {block.buttonLabel && (
              <a href={block.buttonUrl as string} className="inline-block px-8 py-3 bg-white text-[var(--brand-primary)] rounded-lg font-semibold">
                {block.buttonLabel as string}
              </a>
            )}
          </div>
        </section>
      );

    case 'services-grid': {
      const services = (block.services || []) as { title: string; description: string; icon?: string }[];
      return (
        <section className="max-w-6xl mx-auto px-4 py-12">
          <div className="grid md:grid-cols-3 gap-8">
            {services.map((svc, i) => (
              <div key={i} className="text-center p-6 rounded-xl border">
                {svc.icon && <span className="text-4xl mb-4 block">{svc.icon}</span>}
                <h3 className="text-lg font-semibold mb-2">{svc.title}</h3>
                <p className="text-gray-600 text-sm">{svc.description}</p>
              </div>
            ))}
          </div>
        </section>
      );
    }

    case 'card-grid': {
      const cards = (block.cards || []) as { title: string; description: string; image?: string; url?: string }[];
      const cols = (block.columns || 3) as number;
      return (
        <section className="max-w-6xl mx-auto px-4 py-12">
          <div className={`grid md:grid-cols-${cols} gap-6`}>
            {cards.map((card, i) => (
              <div key={i} className="rounded-xl border overflow-hidden">
                {card.image && <img src={card.image} alt={card.title} className="w-full h-48 object-cover" />}
                <div className="p-5">
                  <h3 className="font-semibold mb-2">{card.title}</h3>
                  <p className="text-sm text-gray-600">{card.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      );
    }

    case 'stats': {
      const stats = (block.stats || []) as { value: string; label: string }[];
      return (
        <section className="max-w-6xl mx-auto px-4 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {stats.map((stat, i) => (
              <div key={i}>
                <p className="text-4xl font-bold text-[var(--brand-primary)]">{stat.value}</p>
                <p className="text-sm text-gray-600 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </section>
      );
    }

    case 'testimonial': {
      const testimonials = (block.testimonials || []) as { quote: string; name: string; role?: string; avatar?: string }[];
      return (
        <section className="max-w-6xl mx-auto px-4 py-12">
          <div className="grid md:grid-cols-2 gap-8">
            {testimonials.map((t, i) => (
              <blockquote key={i} className="p-6 rounded-xl border">
                <p className="italic text-gray-700 mb-4">&ldquo;{t.quote}&rdquo;</p>
                <div className="flex items-center gap-3">
                  {t.avatar && <img src={t.avatar} alt={t.name} className="w-10 h-10 rounded-full" />}
                  <div>
                    <p className="font-semibold text-sm">{t.name}</p>
                    {t.role && <p className="text-xs text-gray-500">{t.role}</p>}
                  </div>
                </div>
              </blockquote>
            ))}
          </div>
        </section>
      );
    }

    case 'section': {
      const children = (block.children || []) as Block[];
      return (
        <section
          className="py-12 px-4"
          style={{ backgroundColor: (block.background as string) || 'transparent' }}
        >
          <div className="max-w-6xl mx-auto space-y-6">
            {children.map(child => (
              <RenderBlock key={child.id} block={child} />
            ))}
          </div>
        </section>
      );
    }

    case 'columns': {
      const columns = (block.columns || []) as { blocks: Block[] }[];
      return (
        <div className="max-w-6xl mx-auto px-4">
          <div className={`grid md:grid-cols-${columns.length} gap-${block.gap || 6}`}>
            {columns.map((col, i) => (
              <div key={i} className="space-y-4">
                {col.blocks?.map(child => (
                  <RenderBlock key={child.id} block={child} />
                ))}
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'video':
      return (
        <div className="max-w-4xl mx-auto px-4">
          <video
            src={block.src as string}
            poster={block.poster as string}
            controls
            className="w-full rounded-lg"
          />
        </div>
      );

    case 'youtube':
      return (
        <div className="max-w-4xl mx-auto px-4">
          <div className="relative pb-[56.25%]">
            <iframe
              src={`https://www.youtube.com/embed/${block.videoId}`}
              className="absolute inset-0 w-full h-full rounded-lg"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      );

    default:
      if (process.env.NODE_ENV === 'development') {
        console.warn(`Unknown block type: ${block.type}`);
      }
      return (
        <div className="max-w-4xl mx-auto px-4 p-4 bg-gray-50 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500">
          Unsupported block: <code>{block.type}</code>
        </div>
      );
  }
}
