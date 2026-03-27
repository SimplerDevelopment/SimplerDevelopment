'use client';

import { PalizziWelcomeBlock } from '@/types/blocks';
import Image from 'next/image';

interface PalizziWelcomeBlockRenderProps {
  block: PalizziWelcomeBlock;
}

export function PalizziWelcomeBlockRender({ block }: PalizziWelcomeBlockRenderProps) {
  return (
    <section
      id="welcome"
      className="relative flex flex-col items-center text-center"
      style={{
        padding: 'clamp(4rem, 8vw, 8rem) 1.5rem',
        backgroundColor: '#0d0d0d',
      }}
    >
      <div className="max-w-2xl mx-auto flex flex-col items-center gap-8">
        {/* Ornamental divider with overline */}
        <div
          className="w-full flex items-center gap-4"
        >
          <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, transparent, #c9a96e, transparent)' }} />
          <span
            style={{
              color: '#c9a96e',
              fontSize: '0.75rem',
              letterSpacing: '0.4em',
              textTransform: 'uppercase',
            }}
          >
            {block.overline}
          </span>
          <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, transparent, #c9a96e, transparent)' }} />
        </div>

        {/* Title */}
        <h2
          style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 'clamp(1.875rem, 5vw, 3rem)',
            color: '#f5e6d3',
            lineHeight: 1.2,
          }}
        >
          {block.title}
          <br />
          <span style={{ color: '#c9a96e', fontStyle: 'italic' }}>{block.titleAccent}</span>
        </h2>

        {/* Paragraphs */}
        {block.paragraphs.map((p, i) => (
          <p
            key={i}
            style={{
              color: 'rgba(245,230,211,0.7)',
              lineHeight: 1.75,
              maxWidth: '36rem',
              fontSize: 'clamp(1rem, 2vw, 1.125rem)',
            }}
          >
            {p}
          </p>
        ))}

        {/* Book feature */}
        <div
          className="flex flex-col sm:flex-row items-center gap-8"
          style={{
            marginTop: '2rem',
            border: '1px solid rgba(201,169,110,0.3)',
            padding: 'clamp(1.5rem, 3vw, 2.5rem)',
            backgroundColor: 'rgba(26,26,26,0.3)',
          }}
        >
          <Image
            src={block.bookImage}
            alt={block.bookTitle}
            width={160}
            height={195}
            className="shrink-0"
            style={{ boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}
          />
          <div className="text-center sm:text-left">
            <p
              style={{
                fontSize: '0.75rem',
                letterSpacing: '0.3em',
                textTransform: 'uppercase',
                color: 'rgba(201,169,110,0.7)',
                marginBottom: '0.75rem',
              }}
            >
              {block.bookLabel}
            </p>
            <p
              style={{
                fontFamily: '"Playfair Display", Georgia, serif',
                fontSize: 'clamp(1.125rem, 2vw, 1.25rem)',
                color: '#f5e6d3',
                fontStyle: 'italic',
                lineHeight: 1.75,
              }}
            >
              {block.bookTitle}
            </p>
            <p
              style={{
                color: 'rgba(245,230,211,0.5)',
                fontSize: '0.875rem',
                marginTop: '0.5rem',
                maxWidth: '24rem',
              }}
            >
              {block.bookSubtitle}
            </p>
            <p style={{ color: 'rgba(245,230,211,0.4)', fontSize: '0.75rem', marginTop: '0.75rem' }}>
              {block.bookAuthors}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
