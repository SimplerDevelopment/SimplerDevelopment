'use client';

import { ServicesGridBlock } from '@/types/blocks';
import { useState } from 'react';
import MediaPicker from '@/components/admin/MediaPicker';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { getElementCSS } from '@/lib/utils/elementStyles';
import { RichTextEditable } from './RichTextEditable';

interface ServicesGridBlockPreviewProps {
  block: ServicesGridBlock;
  isSelected: boolean;
  onChange: (updates: Partial<ServicesGridBlock>) => void;
}

export function ServicesGridBlockPreview({ block, isSelected, onChange }: ServicesGridBlockPreviewProps) {
  const [mediaPickerServiceId, setMediaPickerServiceId] = useState<string | null>(null);

  // Mirror renderer's style guards so canvas reflects user-set typography overrides.
  const style = typeof block.style === 'object' ? block.style : {};
  const hasCustomFontSize = !!style.fontSize;
  const hasCustomFontWeight = !!style.fontWeight;
  const accentColor = block.accentColor ?? '#004D80';

  const responsiveClasses = block.responsive
    ? combineResponsiveClasses(
        block.responsive.paddingTop,
        block.responsive.paddingBottom,
        block.responsive.paddingLeft,
        block.responsive.paddingRight,
        block.responsive.marginTop,
        block.responsive.marginBottom,
        block.responsive.marginLeft,
        block.responsive.marginRight,
        block.responsive.visibility,
        block.responsive.fontSize,
      )
    : '';

  const addService = () => {
    onChange({
      services: [
        ...block.services,
        {
          id: `service-${Date.now()}`,
          title: 'New Service',
          description: 'Service description',
          icon: 'star',
        },
      ],
    });
  };

  const updateService = (id: string, updates: Partial<typeof block.services[0]>) => {
    onChange({
      services: block.services.map(s => (s.id === id ? { ...s, ...updates } : s)),
    });
  };

  const removeService = (id: string) => {
    onChange({
      services: block.services.filter(s => s.id !== id),
    });
  };

  const columnsClass = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-2 lg:grid-cols-3',
    4: 'md:grid-cols-2 lg:grid-cols-4',
  }[block.columns || 3];

  const cardStyle = getElementCSS(block.elementStyles, 'card');
  const titleStyle = getElementCSS(block.elementStyles, 'serviceTitle');
  const descStyle = getElementCSS(block.elementStyles, 'serviceDescription');
  const iconStyle = getElementCSS(block.elementStyles, 'serviceIcon');
  const linkStyle = getElementCSS(block.elementStyles, 'serviceLink');
  const bulletStyle = getElementCSS(block.elementStyles, 'bullet');

  return (
    <section className={`py-16 px-6 ${responsiveClasses}`}>
      {(block.overline || block.title || block.description || isSelected) && (
        <div className="text-center mb-12 max-w-3xl mx-auto">
          {(block.overline || isSelected) && (
            <RichTextEditable
              html={block.overline || ''}
              onChange={(html) => onChange({ overline: html })}
              className="text-xs font-semibold tracking-[0.2em] uppercase mb-3 w-full bg-transparent border-none focus:outline-none text-center"
              placeholder="OVERLINE (optional)"
              singleLine={true}
              toolbar={true}
              style={{ color: accentColor, ...getElementCSS(block.elementStyles, 'overline') }}
            />
          )}
          {(block.title || isSelected) && (
            <RichTextEditable
              html={block.title || ''}
              onChange={(html) => onChange({ title: html })}
              className={`font-heading ${hasCustomFontSize ? '' : 'text-4xl md:text-5xl'} ${hasCustomFontWeight ? '' : 'font-bold'} mb-4 w-full bg-transparent border-none focus:outline-none focus:border-b-2 border-primary text-center text-foreground`}
              placeholder="Services Grid Title"
              singleLine={true}
              toolbar={true}
              style={titleStyle ?? undefined}
            />
          )}
          {(block.description || isSelected) && (
            <RichTextEditable
              html={block.description || ''}
              onChange={(html) => onChange({ description: html })}
              className={`${hasCustomFontSize ? '' : 'text-xl'} text-muted-foreground w-full bg-transparent border-none focus:outline-none text-center`}
              placeholder="Description (optional)"
              singleLine={true}
              toolbar={true}
              style={descStyle ?? undefined}
            />
          )}
        </div>
      )}

      <div className={`grid grid-cols-1 ${columnsClass} gap-6`}>
        {block.services.map((service) => (
          <div
            key={service.id}
            className="flex flex-col h-full rounded-xl border bg-white p-7 transition-all hover:shadow-md hover:-translate-y-0.5 relative group"
            style={{ borderColor: '#E5E7EB', ...cardStyle }}
          >
            {isSelected && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeService(service.id);
                }}
                className="absolute top-2 right-2 p-1 text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                title="Remove service"
              >
                <span className="material-icons text-base">close</span>
              </button>
            )}

            {/* Image (if set) takes precedence over icon — matches renderer */}
            {service.image ? (
              <div className="relative mb-4">
                <img src={service.image} alt="" className="w-14 h-14 object-contain" />
                {isSelected && (
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 rounded">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMediaPickerServiceId(service.id);
                      }}
                      className="px-2 py-1 bg-white text-black rounded hover:bg-gray-200 text-xs"
                    >
                      Change
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateService(service.id, { image: undefined });
                      }}
                      className="px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-xs"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ) : service.icon ? (
              <span
                className="material-icons mb-4"
                style={{ fontSize: '44px', color: accentColor, ...iconStyle }}
                aria-hidden
              >
                {service.icon}
              </span>
            ) : (
              isSelected && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMediaPickerServiceId(service.id);
                  }}
                  className="w-14 h-14 mb-4 flex items-center justify-center bg-muted/30 rounded hover:bg-muted/50 transition-colors"
                >
                  <span className="material-icons text-2xl text-muted-foreground/40">image</span>
                </button>
              )
            )}

            {isSelected && !service.image && (
              <input
                type="text"
                value={service.icon || ''}
                onChange={(e) => updateService(service.id, { icon: e.target.value })}
                onClick={(e) => e.stopPropagation()}
                className="block w-full mb-3 text-xs bg-transparent border-b border-border focus:outline-none text-muted-foreground"
                placeholder="Material Icon name (e.g. star)"
              />
            )}

            <RichTextEditable
              html={service.title}
              onChange={(html) => updateService(service.id, { title: html })}
              className="font-heading text-2xl font-bold mb-2 w-full bg-transparent border-none focus:outline-none focus:border-b border-primary text-foreground"
              placeholder="Service Title"
              singleLine={true}
              toolbar={true}
              style={titleStyle ?? undefined}
            />

            <RichTextEditable
              html={service.description}
              onChange={(html) => updateService(service.id, { description: html })}
              className="text-base text-gray-600 mb-4 w-full bg-transparent border-none focus:outline-none focus:border border-border rounded resize-none"
              placeholder="Service description..."
              singleLine={false}
              toolbar={true}
              style={descStyle ?? undefined}
            />

            {service.bullets && service.bullets.length > 0 && (
              <ul className="space-y-2 mb-5 mt-auto" style={bulletStyle ?? undefined}>
                {service.bullets.map((bullet) => (
                  <li key={bullet.id} className="flex items-start gap-2 text-sm text-gray-700">
                    <span
                      className="material-icons shrink-0"
                      style={{ fontSize: '18px', color: accentColor, marginTop: '1px' }}
                      aria-hidden
                    >
                      {bullet.icon || 'check_circle'}
                    </span>
                    <span dangerouslySetInnerHTML={{ __html: bullet.text }} />
                  </li>
                ))}
              </ul>
            )}

            {(service.link || isSelected) && (
              <div className={`${service.bullets?.length ? '' : 'mt-auto'}`}>
                {service.link ? (
                  <span
                    className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase"
                    style={{ color: accentColor, ...linkStyle }}
                  >
                    {service.linkText || 'Learn More'}
                    <span className="material-icons" style={{ fontSize: '14px' }} aria-hidden>
                      arrow_forward
                    </span>
                  </span>
                ) : null}
                {isSelected && (
                  <input
                    type="text"
                    value={service.link || ''}
                    onChange={(e) => updateService(service.id, { link: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-primary w-full bg-transparent border-none focus:outline-none focus:border-b border-primary/50 mt-2"
                    placeholder="Link URL (optional)"
                  />
                )}
              </div>
            )}
          </div>
        ))}

        {isSelected && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              addService();
            }}
            className="p-7 border-2 border-dashed border-border rounded-xl hover:border-primary hover:bg-primary/5 transition-colors flex flex-col items-center justify-center min-h-[200px]"
          >
            <span className="material-icons text-4xl text-muted-foreground mb-2">add</span>
            <span className="text-sm text-muted-foreground">Add Service</span>
          </button>
        )}
      </div>

      {mediaPickerServiceId && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]"
          onClick={() => setMediaPickerServiceId(null)}
        >
          <div
            className="bg-white dark:bg-gray-900 border border-border rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <MediaPicker
              value={block.services.find(s => s.id === mediaPickerServiceId)?.image || ''}
              onChange={(url) => {
                updateService(mediaPickerServiceId, { image: url });
                setMediaPickerServiceId(null);
              }}
              label="Select Service Image"
            />
          </div>
        </div>
      )}
    </section>
  );
}
