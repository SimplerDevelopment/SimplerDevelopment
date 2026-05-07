'use client';

import { TeamShowcaseBlock } from '@/types/blocks';
import { getElementCSS } from '@/lib/utils/elementStyles';
import { sanitizeRichHtml } from '@/lib/security/sanitize-html';

interface TeamShowcaseBlockRenderProps {
  block: TeamShowcaseBlock;
}

export function TeamShowcaseBlockRender({ block }: TeamShowcaseBlockRenderProps) {
  const bioPanelColor = block.bioPanelColor || '#faf8f5';
  const accentColor = block.accentColor || '#cfa122';
  const photoFilter = block.photoFilter || 'none';

  return (
    <div>
      {/* Header */}
      {(block.overline || block.title || block.subtitle) && (
        <div className="text-center mb-16">
          {block.overline && (
            <p
              className="text-sm tracking-[0.3em] uppercase mb-4"
              style={getElementCSS(block.elementStyles, 'overline')}
              dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(block.overline) }}
            />
          )}
          {block.title && (
            <h2
              data-editable-field="title"
              className="text-4xl md:text-5xl font-light mb-4"
              style={getElementCSS(block.elementStyles, 'title')}
              dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(block.title) }}
            />
          )}
          {block.subtitle && (
            <p
              className="max-w-2xl mx-auto"
              style={getElementCSS(block.elementStyles, 'subtitle')}
              dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(block.subtitle) }}
            />
          )}
        </div>
      )}

      {/* Members */}
      <div className="space-y-0">
        {(block.members || []).map((member, i) => {
          const photoLeft = i % 2 === 0;

          return (
            <div key={member.id}>
              {/* Decorative divider between members */}
              {i > 0 && (
                <div className="flex items-center gap-6 my-0 py-0">
                  <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, transparent, ${accentColor}30, transparent)` }} />
                  <span style={{ color: `${accentColor}60`, fontSize: '0.75rem', letterSpacing: '0.3em' }}>&bull;</span>
                  <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, transparent, ${accentColor}30, transparent)` }} />
                </div>
              )}

              <div
                className={`flex flex-col ${photoLeft ? 'lg:flex-row' : 'lg:flex-row-reverse'} min-h-[500px] lg:min-h-[600px]`}
              >
                {/* Photo */}
                <div className="relative lg:w-1/2 min-h-[400px] lg:min-h-0 overflow-hidden">
                  <img
                    src={member.photo}
                    alt={member.name}
                    className="w-full h-full object-cover object-top"
                    style={{ filter: photoFilter, minHeight: '100%' }}
                  />
                </div>

                {/* Bio panel */}
                <div
                  className="lg:w-1/2 flex items-center"
                  style={{ backgroundColor: bioPanelColor }}
                >
                  <div className="p-10 lg:p-16 xl:p-20 w-full">
                    {/* Gold accent line */}
                    <div
                      className="w-10 h-[2px] mb-8"
                      style={{ background: `linear-gradient(to right, ${accentColor}, ${accentColor}cc)` }}
                    />

                    <h3
                      className="text-3xl mb-2"
                      style={getElementCSS(block.elementStyles, 'memberName')}
                    >
                      {member.name}
                    </h3>

                    <p
                      className="text-sm font-medium mb-1"
                      style={{ color: accentColor, ...getElementCSS(block.elementStyles, 'memberTitle') }}
                    >
                      {member.title}
                    </p>

                    {member.credentials && (
                      <p
                        className="text-xs tracking-[0.15em] uppercase mb-6"
                        style={getElementCSS(block.elementStyles, 'memberCredentials')}
                      >
                        {member.credentials}
                      </p>
                    )}

                    <p
                      className="text-sm leading-relaxed mb-8"
                      style={getElementCSS(block.elementStyles, 'memberBio')}
                    >
                      {member.bio}
                    </p>

                    {/* Specialties as tags */}
                    {member.specialties && member.specialties.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {member.specialties.map((s) => (
                          <span
                            key={s}
                            className="px-3 py-1.5 text-xs rounded-sm"
                            style={getElementCSS(block.elementStyles, 'specialtyTag')}
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
