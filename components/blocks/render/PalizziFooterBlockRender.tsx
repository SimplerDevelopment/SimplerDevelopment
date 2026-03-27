'use client';

import { PalizziFooterBlock } from '@/types/blocks';
import Image from 'next/image';

interface PalizziFooterBlockRenderProps {
  block: PalizziFooterBlock;
}

export function PalizziFooterBlockRender({ block }: PalizziFooterBlockRenderProps) {
  return (
    <footer
      style={{
        borderTop: '1px solid rgba(201,169,110,0.1)',
        padding: '4rem 1.5rem',
        backgroundColor: '#0d0d0d',
      }}
    >
      <div className="max-w-4xl mx-auto">
        {/* Marquee */}
        <div className="flex justify-center mb-12">
          <Image
            src={block.marqueeImage}
            alt=""
            width={300}
            height={53}
            className="h-auto"
            style={{ opacity: 0.3, width: 'clamp(200px, 30vw, 300px)' }}
          />
        </div>

        <div
          className="grid gap-12 text-center"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }}
        >
          {block.columns.map((col, i) => (
            <div key={i}>
              <p
                style={{
                  fontSize: '0.75rem',
                  letterSpacing: '0.3em',
                  textTransform: 'uppercase',
                  color: 'rgba(201,169,110,0.6)',
                  marginBottom: '0.75rem',
                }}
              >
                {col.label}
              </p>
              {col.content && (
                <p
                  style={{ color: 'rgba(245,230,211,0.5)', fontSize: '0.875rem', lineHeight: 1.75 }}
                  dangerouslySetInnerHTML={{ __html: col.content }}
                />
              )}
              {col.links && (
                <div className="flex flex-col gap-1">
                  {col.links.map((link) => (
                    <a
                      key={link.label}
                      href={link.href}
                      style={{
                        color: 'rgba(245,230,211,0.5)',
                        fontSize: '0.875rem',
                        transition: 'color 0.3s',
                        textDecoration: 'none',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#c9a96e')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(245,230,211,0.5)')}
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div
          className="text-center"
          style={{
            marginTop: '4rem',
            paddingTop: '2rem',
            borderTop: '1px solid rgba(201,169,110,0.05)',
          }}
        >
          <p
            style={{
              fontFamily: '"Playfair Display", Georgia, serif',
              color: 'rgba(201,169,110,0.4)',
              fontSize: '0.875rem',
              letterSpacing: '0.1em',
            }}
          >
            {block.bottomText}
          </p>
        </div>
      </div>
    </footer>
  );
}
