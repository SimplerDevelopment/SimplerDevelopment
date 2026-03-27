'use client';

import { PalizziRulesBlock } from '@/types/blocks';

interface PalizziRulesBlockRenderProps {
  block: PalizziRulesBlock;
}

export function PalizziRulesBlockRender({ block }: PalizziRulesBlockRenderProps) {
  return (
    <section
      id="rules"
      className="relative"
      style={{
        padding: 'clamp(4rem, 8vw, 8rem) 1.5rem',
        background: 'linear-gradient(to bottom, #0d0d0d, rgba(74,30,36,0.2), #0d0d0d)',
      }}
    >
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
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
            }}
          >
            {block.title} <span style={{ color: '#c9a96e', fontStyle: 'italic' }}>{block.titleAccent}</span>
          </h2>
        </div>

        {/* Hours */}
        <div
          className="text-center mb-16"
          style={{
            border: '1px solid rgba(201,169,110,0.2)',
            padding: '2rem 1.5rem',
            backgroundColor: 'rgba(26,26,26,0.2)',
          }}
        >
          <p
            style={{
              fontFamily: '"Playfair Display", Georgia, serif',
              fontSize: 'clamp(1.25rem, 3vw, 1.5rem)',
              color: '#c9a96e',
            }}
          >
            {block.hoursTitle}
          </p>
          <p style={{ color: 'rgba(245,230,211,0.6)', marginTop: '0.5rem', letterSpacing: '0.05em' }}>
            {block.hoursSubtitle}
          </p>
          <div
            className="flex items-center justify-center gap-4"
            style={{ marginTop: '1rem' }}
          >
            {block.badges.map((badge, i) => (
              <span key={i} className="flex items-center gap-4">
                {i > 0 && (
                  <span
                    style={{
                      width: '4px',
                      height: '4px',
                      borderRadius: '50%',
                      backgroundColor: 'rgba(201,169,110,0.4)',
                    }}
                  />
                )}
                <span
                  style={{
                    fontSize: '0.75rem',
                    letterSpacing: '0.3em',
                    textTransform: 'uppercase',
                    color: 'rgba(245,230,211,0.4)',
                  }}
                >
                  {badge}
                </span>
              </span>
            ))}
          </div>
        </div>

        {/* Rules list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {block.rules.map((rule, i) => (
            <div key={i} className="flex gap-4 items-start">
              <span
                style={{
                  color: 'rgba(201,169,110,0.4)',
                  fontFamily: '"Playfair Display", Georgia, serif',
                  fontSize: '1.125rem',
                  marginTop: '0.125rem',
                  flexShrink: 0,
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <p
                style={{
                  color: 'rgba(245,230,211,0.7)',
                  lineHeight: 1.75,
                  borderBottom: i < block.rules.length - 1 ? '1px solid rgba(201,169,110,0.05)' : 'none',
                  paddingBottom: '1.5rem',
                }}
              >
                {rule}
              </p>
            </div>
          ))}
        </div>

        {/* Disclaimer */}
        <p
          className="text-center"
          style={{
            marginTop: '4rem',
            fontSize: '0.75rem',
            color: 'rgba(245,230,211,0.3)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            lineHeight: 1.75,
            maxWidth: '32rem',
            margin: '4rem auto 0',
          }}
        >
          {block.disclaimer}
        </p>
      </div>
    </section>
  );
}
