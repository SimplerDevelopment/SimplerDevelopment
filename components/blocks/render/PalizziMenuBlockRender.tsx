'use client';

import { PalizziMenuBlock } from '@/types/blocks';
import { useState } from 'react';

type MenuCategory = 'food' | 'cocktails';

interface PalizziMenuBlockRenderProps {
  block: PalizziMenuBlock;
}

export function PalizziMenuBlockRender({ block }: PalizziMenuBlockRenderProps) {
  const [active, setActive] = useState<MenuCategory>('food');

  return (
    <section
      id="menu"
      className="relative"
      style={{
        padding: 'clamp(4rem, 8vw, 8rem) 1.5rem',
        backgroundColor: '#0d0d0d',
      }}
    >
      <div className="max-w-4xl mx-auto">
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
              marginBottom: '1rem',
            }}
            dangerouslySetInnerHTML={{ __html: block.title }}
          />
          <p
            style={{
              color: 'rgba(245,230,211,0.5)',
              maxWidth: '32rem',
              margin: '0 auto',
              fontSize: 'clamp(0.875rem, 2vw, 1rem)',
            }}
          >
            {block.subtitle}
          </p>
        </div>

        {/* Toggle */}
        <div className="flex justify-center gap-1 mb-16">
          {(['food', 'cocktails'] as MenuCategory[]).map((cat) => (
            <button
              key={cat}
              onClick={() => setActive(cat)}
              style={{
                padding: '0.75rem 2rem',
                fontSize: '0.875rem',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                transition: 'all 0.3s',
                border: active === cat ? '1px solid #722f37' : '1px solid rgba(201,169,110,0.3)',
                backgroundColor: active === cat ? '#722f37' : 'transparent',
                color: active === cat ? '#f5e6d3' : 'rgba(245,230,211,0.5)',
                cursor: 'pointer',
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Food Menu */}
        {active === 'food' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4rem' }}>
            {block.foodSections.map((section) => (
              <div key={section.title}>
                <h3
                  className="text-center"
                  style={{
                    fontFamily: '"Playfair Display", Georgia, serif',
                    fontSize: 'clamp(1.25rem, 3vw, 1.5rem)',
                    color: '#c9a96e',
                    marginBottom: '2rem',
                  }}
                >
                  {section.title}
                </h3>
                <div
                  className="grid gap-6"
                  style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))' }}
                >
                  {section.items.map((item) => (
                    <div
                      key={item.name}
                      className="group"
                      style={{ borderBottom: '1px solid rgba(201,169,110,0.1)', paddingBottom: '1rem' }}
                    >
                      <h4
                        style={{
                          fontFamily: '"Playfair Display", Georgia, serif',
                          fontSize: '1.125rem',
                          color: '#f5e6d3',
                          transition: 'color 0.3s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#c9a96e')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = '#f5e6d3')}
                      >
                        {item.name}
                      </h4>
                      <p style={{ color: 'rgba(245,230,211,0.4)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                        {item.desc}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Cocktails */}
        {active === 'cocktails' && (
          <div
            className="grid gap-8"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))' }}
          >
            {block.cocktails.map((item) => (
              <div
                key={item.name}
                style={{ borderBottom: '1px solid rgba(201,169,110,0.1)', paddingBottom: '1.5rem' }}
              >
                <h4
                  style={{
                    fontFamily: '"Playfair Display", Georgia, serif',
                    fontSize: '1.125rem',
                    color: '#f5e6d3',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    transition: 'color 0.3s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#c9a96e')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#f5e6d3')}
                >
                  {item.name}
                </h4>
                <p style={{ color: 'rgba(245,230,211,0.4)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
