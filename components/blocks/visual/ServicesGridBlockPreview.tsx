'use client';

import { ServicesGridBlock } from '@/types/blocks';
import { useState } from 'react';
import MediaPicker from '@/components/admin/MediaPicker';
import { getElementCSS } from '@/lib/utils/elementStyles';
import { RichTextEditable } from './RichTextEditable';

interface ServicesGridBlockPreviewProps {
  block: ServicesGridBlock;
  isSelected: boolean;
  onChange: (updates: Partial<ServicesGridBlock>) => void;
}

export function ServicesGridBlockPreview({ block, isSelected, onChange }: ServicesGridBlockPreviewProps) {
  const [mediaPickerServiceId, setMediaPickerServiceId] = useState<string | null>(null);
  const addService = () => {
    onChange({
      services: [
        ...block.services,
        {
          id: `service-${Date.now()}`,
          title: 'New Service',
          description: 'Service description',
          icon: '⭐',
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

  const columnClasses = {
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
  };

  return (
    <div className="p-6">
      <div className="text-center mb-8">
        {(block.title || isSelected) && (
          <RichTextEditable
            html={block.title || ''}
            onChange={(html) => onChange({ title: html })}
            className="text-3xl font-bold mb-2 w-full bg-transparent border-none focus:outline-none focus:border-b-2 border-primary text-center text-foreground"
            placeholder="Services Grid Title"
            singleLine={true}
            toolbar={true}
            style={getElementCSS(block.elementStyles, 'title')}
          />
        )}
        {(block.description || isSelected) && (
          <RichTextEditable
            html={block.description || ''}
            onChange={(html) => onChange({ description: html })}
            className="text-lg mb-4 w-full bg-transparent border-none focus:outline-none focus:border-b border-primary/50 text-center text-muted-foreground"
            placeholder="Description (optional)"
            singleLine={true}
            toolbar={true}
            style={getElementCSS(block.elementStyles, 'description')}
          />
        )}
      </div>

      <div className={`grid ${columnClasses[block.columns || 3]} gap-6`}>
        {block.services.map((service) => (
          <div
            key={service.id}
            className="p-6 border border-border rounded-lg bg-card hover:border-primary transition-colors relative group"
          >
            {isSelected && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeService(service.id);
                }}
                className="absolute top-2 right-2 p-1 text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove service"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}

            {(service.image || isSelected) && (
              <div className="aspect-video bg-muted/30 flex items-center justify-center relative mb-4 rounded-lg overflow-hidden">
                {service.image ? (
                  <>
                    <img src={service.image} alt={service.title} className="w-full h-full object-cover" />
                    {isSelected && (
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMediaPickerServiceId(service.id);
                          }}
                          className="px-3 py-1 bg-white text-black rounded hover:bg-gray-200 text-sm"
                        >
                          Change
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateService(service.id, { image: undefined });
                          }}
                          className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMediaPickerServiceId(service.id);
                    }}
                    className="w-full h-full flex flex-col items-center justify-center hover:bg-muted/50 transition-colors"
                  >
                    <div className="text-5xl mb-2">🖼️</div>
                    <span className="text-sm text-muted-foreground">Click to select image</span>
                  </button>
                )}
              </div>
            )}

            {!service.image && (
              <div className="text-4xl mb-4 text-center">
                <input
                  type="text"
                  value={service.icon || ''}
                  onChange={(e) => updateService(service.id, { icon: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  className="w-16 bg-transparent border-none focus:outline-none text-center"
                  placeholder="🎯"
                  maxLength={2}
                />
              </div>
            )}

            <RichTextEditable
              html={service.title}
              onChange={(html) => updateService(service.id, { title: html })}
              className="text-xl font-semibold mb-2 w-full bg-transparent border-none focus:outline-none focus:border-b border-primary text-foreground"
              placeholder="Service Title"
              singleLine={true}
              toolbar={true}
              style={getElementCSS(block.elementStyles, 'serviceTitle')}
            />

            <RichTextEditable
              html={service.description}
              onChange={(html) => updateService(service.id, { description: html })}
              className="text-muted-foreground w-full bg-transparent border-none focus:outline-none focus:border border-border rounded resize-none"
              placeholder="Service description..."
              singleLine={false}
              toolbar={true}
              style={getElementCSS(block.elementStyles, 'serviceDescription')}
            />

            {(service.link || isSelected) && (
              <input
                type="text"
                value={service.link || ''}
                onChange={(e) => updateService(service.id, { link: e.target.value })}
                onClick={(e) => e.stopPropagation()}
                className="text-sm text-primary w-full bg-transparent border-none focus:outline-none focus:border-b border-primary/50 mt-2"
                placeholder="Link URL (optional)"
              />
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
            className="p-6 border-2 border-dashed border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors flex flex-col items-center justify-center min-h-[200px]"
          >
            <svg className="w-12 h-12 text-muted-foreground mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
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
    </div>
  );
}
