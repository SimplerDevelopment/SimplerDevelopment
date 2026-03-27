'use client';

import { PalizziMembershipBlock } from '@/types/blocks';

interface PalizziMembershipBlockRenderProps {
  block: PalizziMembershipBlock;
}

export function PalizziMembershipBlockRender({ block }: PalizziMembershipBlockRenderProps) {
  return (
    <section
      id="membership"
      className="relative"
      style={{
        padding: 'clamp(4rem, 8vw, 8rem) 1.5rem',
        backgroundColor: '#0d0d0d',
      }}
    >
      <div className="max-w-2xl mx-auto text-center">
        <p
          style={{
            fontSize: '0.75rem',
            letterSpacing: '0.4em',
            textTransform: 'uppercase',
            color: 'rgba(201,169,110,0.6)',
            marginBottom: '1rem',
          }}
        >
          {block.overline}
        </p>
        <h2
          style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 'clamp(1.875rem, 5vw, 3rem)',
            color: '#f5e6d3',
            marginBottom: '2rem',
          }}
        >
          {block.title} <span style={{ color: '#c9a96e', fontStyle: 'italic' }}>{block.titleAccent}</span>
        </h2>

        <div
          style={{
            border: '1px solid rgba(201,169,110,0.2)',
            padding: 'clamp(2rem, 4vw, 3rem)',
            backgroundColor: 'rgba(26,26,26,0.2)',
          }}
        >
          {block.paragraphs.map((p, i) => (
            <p
              key={i}
              style={{
                color: 'rgba(245,230,211,0.7)',
                lineHeight: 1.75,
                marginBottom: '1.5rem',
              }}
            >
              {p}
            </p>
          ))}

          <div
            className="mx-auto"
            style={{
              width: '4rem',
              height: '1px',
              backgroundColor: 'rgba(201,169,110,0.3)',
              margin: '2rem auto',
            }}
          />

          <p
            style={{
              fontFamily: '"Playfair Display", Georgia, serif',
              fontSize: '1.25rem',
              color: '#c9a96e',
              fontStyle: 'italic',
              marginBottom: '1.5rem',
            }}
          >
            {block.highlight}
          </p>

          <p
            style={{
              color: 'rgba(245,230,211,0.5)',
              fontSize: '0.875rem',
              lineHeight: 1.75,
            }}
          >
            {block.closingNote}
          </p>

          <p
            style={{
              marginTop: '2rem',
              fontSize: '0.75rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'rgba(245,230,211,0.3)',
            }}
          >
            {block.signature}
          </p>
        </div>

        <p
          style={{
            marginTop: '2rem',
            fontSize: '0.75rem',
            color: 'rgba(245,230,211,0.3)',
            lineHeight: 1.75,
            maxWidth: '28rem',
            margin: '2rem auto 0',
          }}
        >
          {block.footnote}
        </p>
      </div>
    </section>
  );
}
