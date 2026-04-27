'use client';

import { useState } from 'react';
import type { TeamFlipGridBlock } from '@/types/blocks';
import { Icon } from '@/components/ui/Icon';
import { getElementCSS } from '@/lib/utils/elementStyles';

interface Props {
  block: TeamFlipGridBlock;
}

export function TeamFlipGridBlockRender({ block }: Props) {
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const columns = block.columns ?? 4;
  const backBg = block.backBgColor || '#0A3A5C';
  const backColor = block.backTextColor || '#FFFFFF';
  const nameColor = block.nameColor || '#0A3A5C';
  const titleColor = block.titleColor || '#1B6FA8';

  const gridColsClass = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-2 lg:grid-cols-3',
    4: 'md:grid-cols-2 lg:grid-cols-4',
  }[columns];

  return (
    <section>
      {(block.overline || block.title || block.subtitle) && (
        <div className="text-center mb-12 max-w-3xl mx-auto px-4">
          {block.overline && (
            <p className="text-xs tracking-[0.3em] uppercase font-semibold mb-3" style={{ color: titleColor }}>
              {block.overline}
            </p>
          )}
          {block.title && (
            <h2
              className="font-heading mb-4"
              style={{
                color: nameColor,
                fontFamily: 'Poppins, system-ui, sans-serif',
                fontSize: '2.75rem',
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: '-0.01em',
              }}
            >
              {block.title}
            </h2>
          )}
          {block.subtitle && (
            <p
              className="text-base md:text-lg"
              style={{
                color: '#4B5563',
                fontFamily: 'DM Sans, system-ui, sans-serif',
                lineHeight: 1.7,
              }}
            >
              {block.subtitle}
            </p>
          )}
        </div>
      )}

      <div className={`grid grid-cols-1 ${gridColsClass} gap-6 max-w-7xl mx-auto px-4`}>
        {block.members.map((m) => {
          const isFlipped = !!flipped[m.id];
          return (
            <div
              key={m.id}
              className="pc-flip-card"
              data-flipped={isFlipped}
              style={{ perspective: '1200px' }}
            >
              <div className="pc-flip-card__inner">
                {/* Front */}
                <div
                  className="pc-flip-card__face pc-flip-card__front"
                  style={getElementCSS(block.elementStyles, 'frontCard')}
                >
                  <div className="pc-flip-card__photo">
                    {m.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.photo} alt={m.name} />
                    ) : (
                      <div className="pc-flip-card__photo-placeholder">
                        <Icon name="person" size={56} />
                      </div>
                    )}
                  </div>
                  <div className="pc-flip-card__info">
                    <div className="pc-flip-card__name-row">
                      <h3
                        className="pc-flip-card__name"
                        style={{ color: nameColor, ...getElementCSS(block.elementStyles, 'memberName') }}
                      >
                        {m.name}
                      </h3>
                      <button
                        type="button"
                        aria-label="Read more"
                        className="pc-flip-card__toggle"
                        onClick={() => setFlipped((prev) => ({ ...prev, [m.id]: true }))}
                        style={{ color: nameColor, borderColor: nameColor }}
                      >
                        <Icon name="add" size={18} />
                      </button>
                    </div>
                    <p
                      className="pc-flip-card__title"
                      style={{ color: titleColor, ...getElementCSS(block.elementStyles, 'memberTitle') }}
                    >
                      {m.title}
                    </p>
                    {m.bio && (
                      <p
                        className="pc-flip-card__bio"
                        style={getElementCSS(block.elementStyles, 'memberBio')}
                      >
                        {m.bio}
                      </p>
                    )}
                  </div>
                </div>

                {/* Back */}
                <div
                  className="pc-flip-card__face pc-flip-card__back"
                  style={{ backgroundColor: backBg, color: backColor, ...getElementCSS(block.elementStyles, 'backCard') }}
                >
                  <button
                    type="button"
                    aria-label="Close"
                    className="pc-flip-card__toggle pc-flip-card__toggle--back"
                    onClick={() => setFlipped((prev) => ({ ...prev, [m.id]: false }))}
                    style={{ color: backColor, borderColor: backColor }}
                  >
                    <Icon name="close" size={18} />
                  </button>
                  <div className="pc-flip-card__back-content">
                    {m.question && (
                      <p
                        className="pc-flip-card__question"
                        style={getElementCSS(block.elementStyles, 'question')}
                      >
                        {m.question}
                      </p>
                    )}
                    {m.answer && (
                      <p
                        className="pc-flip-card__answer"
                        style={getElementCSS(block.elementStyles, 'answer')}
                      >
                        {m.answer}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <style jsx>{`
        .pc-flip-card {
          position: relative;
          width: 100%;
          aspect-ratio: 3 / 4.3;
        }
        .pc-flip-card__inner {
          position: relative;
          width: 100%;
          height: 100%;
          transition: transform 0.7s cubic-bezier(0.4, 0, 0.2, 1);
          transform-style: preserve-3d;
        }
        .pc-flip-card[data-flipped='true'] .pc-flip-card__inner {
          transform: rotateY(180deg);
        }
        .pc-flip-card__face {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          border-radius: 12px;
          overflow: hidden;
        }
        .pc-flip-card__front {
          display: flex;
          flex-direction: column;
          background: #ffffff;
          box-shadow: 0 6px 20px rgba(10, 58, 92, 0.08);
          border: 1px solid #e5e7eb;
        }
        .pc-flip-card__photo {
          width: 100%;
          aspect-ratio: 4 / 5;
          background: linear-gradient(180deg, #f1f5f9 0%, #e2e8f0 100%);
          overflow: hidden;
        }
        .pc-flip-card__photo img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center top;
          display: block;
        }
        .pc-flip-card__photo-placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #94a3b8;
        }
        .pc-flip-card__info {
          padding: 16px 18px 18px;
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .pc-flip-card__name-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 4px;
        }
        .pc-flip-card__name {
          font-family: 'Poppins', system-ui, sans-serif;
          font-size: 17px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          margin: 0;
          line-height: 1.2;
        }
        .pc-flip-card__toggle {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 1.5px solid currentColor;
          background: transparent;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
          transition: transform 0.2s, background 0.2s;
          padding: 0;
        }
        .pc-flip-card__toggle:hover {
          transform: scale(1.1);
          background: rgba(10, 58, 92, 0.08);
        }
        .pc-flip-card__toggle--back:hover {
          background: rgba(255, 255, 255, 0.15);
        }
        .pc-flip-card__title {
          font-family: 'DM Sans', system-ui, sans-serif;
          font-size: 13px;
          font-weight: 600;
          line-height: 1.4;
          margin: 0 0 8px;
        }
        .pc-flip-card__bio {
          font-family: 'DM Sans', system-ui, sans-serif;
          font-size: 12.5px;
          color: #64748b;
          line-height: 1.5;
          margin: 0;
          white-space: pre-line;
        }
        .pc-flip-card__back {
          transform: rotateY(180deg);
          padding: 28px 22px 22px;
          display: flex;
          align-items: center;
          box-shadow: 0 6px 20px rgba(10, 58, 92, 0.18);
        }
        .pc-flip-card__toggle--back {
          position: absolute;
          top: 12px;
          right: 12px;
          color: inherit;
        }
        .pc-flip-card__back-content {
          font-family: 'DM Sans', system-ui, sans-serif;
          width: 100%;
        }
        .pc-flip-card__question {
          font-family: 'Poppins', system-ui, sans-serif;
          font-size: 14px;
          font-weight: 600;
          line-height: 1.3;
          margin: 0 0 14px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          opacity: 0.9;
        }
        .pc-flip-card__answer {
          font-size: 12.5px;
          line-height: 1.5;
          margin: 0;
          opacity: 0.95;
        }
      `}</style>
    </section>
  );
}
