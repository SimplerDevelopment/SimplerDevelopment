'use client';

import { CardGridBlock } from '@/types/blocks';
import { useState } from 'react';
import MediaPicker from '@/components/admin/MediaPicker';

interface CardGridBlockPreviewProps {
  block: CardGridBlock;
  isSelected: boolean;
  onChange: (updates: Partial<CardGridBlock>) => void;
}

export function CardGridBlockPreview({ block, isSelected, onChange }: CardGridBlockPreviewProps) {
  const [mediaPickerCardId, setMediaPickerCardId] = useState<string | null>(null);
  const addCard = () => {
    onChange({
      cards: [
        ...block.cards,
        {
          id: `card-${Date.now()}`,
          title: 'New Card',
          description: 'Card description',
          icon: '✨',
        },
      ],
    });
  };

  const updateCard = (id: string, updates: Partial<typeof block.cards[0]>) => {
    onChange({
      cards: block.cards.map(c => (c.id === id ? { ...c, ...updates } : c)),
    });
  };

  const removeCard = (id: string) => {
    onChange({
      cards: block.cards.filter(c => c.id !== id),
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
          <input
            type="text"
            value={block.title || ''}
            onChange={(e) => onChange({ title: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            className="text-3xl font-bold mb-2 w-full bg-transparent border-none focus:outline-none focus:border-b-2 border-primary text-center text-foreground"
            placeholder="Card Grid Title"
          />
        )}
        {(block.description || isSelected) && (
          <input
            type="text"
            value={block.description || ''}
            onChange={(e) => onChange({ description: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            className="text-lg w-full bg-transparent border-none focus:outline-none focus:border-b border-primary/50 text-center text-muted-foreground"
            placeholder="Description (optional)"
          />
        )}
      </div>

      <div className={`grid ${columnClasses[block.columns || 3]} gap-6`}>
        {block.cards.map((card) => (
          <div
            key={card.id}
            className="border border-border rounded-lg overflow-hidden bg-card hover:border-primary transition-colors relative group"
          >
            {isSelected && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeCard(card.id);
                }}
                className="absolute top-2 right-2 p-1 text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                title="Remove card"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}

            {(card.image || isSelected) && (
              <div className="aspect-video bg-muted/30 flex items-center justify-center relative">
                {card.image ? (
                  <>
                    <img src={card.image} alt={card.title} className="w-full h-full object-cover" />
                    {isSelected && (
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMediaPickerCardId(card.id);
                          }}
                          className="px-3 py-1 bg-white text-black rounded hover:bg-gray-200 text-sm"
                        >
                          Change
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateCard(card.id, { image: undefined });
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
                      setMediaPickerCardId(card.id);
                    }}
                    className="w-full h-full flex flex-col items-center justify-center hover:bg-muted/50 transition-colors"
                  >
                    <div className="text-5xl mb-2">🖼️</div>
                    <span className="text-sm text-muted-foreground">Click to select image</span>
                  </button>
                )}
              </div>
            )}

            <div className="p-4">
              <input
                type="text"
                value={card.title}
                onChange={(e) => updateCard(card.id, { title: e.target.value })}
                onClick={(e) => e.stopPropagation()}
                className="text-xl font-semibold mb-2 w-full bg-transparent border-none focus:outline-none focus:border-b border-primary text-foreground"
                placeholder="Card Title"
              />

              <textarea
                value={card.description}
                onChange={(e) => updateCard(card.id, { description: e.target.value })}
                onClick={(e) => e.stopPropagation()}
                className="text-muted-foreground w-full bg-transparent border-none focus:outline-none focus:border border-border rounded resize-none"
                placeholder="Card description..."
                rows={3}
              />

              {(card.link || isSelected) && (
                <input
                  type="text"
                  value={card.link || ''}
                  onChange={(e) => updateCard(card.id, { link: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  className="text-sm text-primary w-full bg-transparent border-none focus:outline-none focus:border-b border-primary/50 mt-2"
                  placeholder="Link URL (optional)"
                />
              )}
            </div>
          </div>
        ))}

        {isSelected && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              addCard();
            }}
            className="border-2 border-dashed border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors flex flex-col items-center justify-center min-h-[250px]"
          >
            <svg className="w-12 h-12 text-muted-foreground mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-sm text-muted-foreground">Add Card</span>
          </button>
        )}
      </div>

      {mediaPickerCardId && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]"
          onClick={() => setMediaPickerCardId(null)}
        >
          <div
            className="bg-white dark:bg-gray-900 border border-border rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <MediaPicker
              value={block.cards.find(c => c.id === mediaPickerCardId)?.image || ''}
              onChange={(url) => {
                updateCard(mediaPickerCardId, { image: url });
                setMediaPickerCardId(null);
              }}
              label="Select Card Image"
            />
          </div>
        </div>
      )}
    </div>
  );
}
