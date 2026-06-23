'use client';

import { CardGridBlock } from '@/types/blocks';
import { useState } from 'react';
import MediaPicker from '@/components/admin/MediaPicker';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { getElementCSS } from '@/lib/utils/elementStyles';
import { RichTextEditable } from './RichTextEditable';

interface CardGridBlockPreviewProps {
  block: CardGridBlock;
  isSelected: boolean;
  onChange: (updates: Partial<CardGridBlock>) => void;
}

// CardGridBlock.cards has canonical fields `title`, `description`, `image`, `link`, `icon`.
// The production renderer also reads aliased `body` (→ description) and `subtitle` from
// LLM-authored decks via a runtime cast. Surface `subtitle` as an editable field so users
// can take advantage of the renderer's title/subtitle/description three-line layout.
type EditableCard = CardGridBlock['cards'][number] & { subtitle?: string };

export function CardGridBlockPreview({ block, isSelected, onChange }: CardGridBlockPreviewProps) {
  const [mediaPickerCardId, setMediaPickerCardId] = useState<string | null>(null);

  // Mirror renderer's style guards.
  const style = typeof block.style === 'object' ? block.style : {};
  const hasCustomFontSize = !!style.fontSize;
  const hasCustomFontWeight = !!style.fontWeight;

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

  const addCard = () => {
    onChange({
      cards: [
        ...block.cards,
        {
          id: `card-${Date.now()}`,
          title: 'New Card',
          description: 'Card description',
          icon: 'auto_awesome',
        },
      ],
    });
  };

  const updateCard = (id: string, updates: Partial<EditableCard>) => {
    onChange({
      cards: block.cards.map(c => (c.id === id ? { ...c, ...updates } : c)) as CardGridBlock['cards'],
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

  const titleStyle = getElementCSS(block.elementStyles, 'title');
  const descriptionStyle = getElementCSS(block.elementStyles, 'description');

  return (
    <section className={`py-16 px-6 ${responsiveClasses}`}>
      {(block.title || block.description || isSelected) && (
        <div className="text-center mb-12">
          {(block.title || isSelected) && (
            <RichTextEditable
              html={block.title || ''}
              onChange={(html) => onChange({ title: html })}
              className={`font-heading ${hasCustomFontSize ? '' : 'text-4xl md:text-5xl'} ${hasCustomFontWeight ? '' : 'font-bold'} mb-4 w-full bg-transparent border-none focus:outline-none focus:border-b-2 border-primary text-center text-foreground`}
              placeholder="Card Grid Title"
              singleLine={true}
              toolbar={true}
              style={titleStyle}
            />
          )}
          {(block.description || isSelected) && (
            <RichTextEditable
              html={block.description || ''}
              onChange={(html) => onChange({ description: html })}
              className={`${hasCustomFontSize ? '' : 'text-xl'} text-muted-foreground max-w-2xl mx-auto w-full bg-transparent border-none focus:outline-none text-center`}
              placeholder="Description (optional)"
              singleLine={true}
              toolbar={true}
              style={descriptionStyle}
            />
          )}
        </div>
      )}

      <div className={`grid ${columnClasses[block.columns || 3]} gap-8`}>
        {(block.cards as EditableCard[]).map((card) => (
          <div
            key={card.id}
            className="relative h-full border border-border rounded-xl bg-background/80 backdrop-blur-sm p-6 shadow-sm transition-all hover:shadow-md hover:border-primary/40 group"
            style={getElementCSS(block.elementStyles, 'card')}
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
                <span className="material-icons text-base">close</span>
              </button>
            )}

            {(card.image || isSelected) && (
              <div className="mb-4 overflow-hidden rounded-lg aspect-video bg-muted/30 relative">
                {card.image ? (
                  <>
                    <img
                      src={card.image}
                      alt={card.title}
                      className="w-full h-full object-cover"
                      style={getElementCSS(block.elementStyles, 'cardImage')}
                    />
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
                    <span className="material-icons text-5xl text-muted-foreground/20 mb-2">image</span>
                    <span className="text-sm text-muted-foreground">Click to select image</span>
                  </button>
                )}
              </div>
            )}

            {/* Icon — renderer applies it via the shared <Card> component when present */}
            {card.icon && (
              <span
                className="material-icons text-primary mb-4 block"
                style={{
                  fontSize: block.iconSize ? `${parseInt(block.iconSize, 10)}px` : '48px',
                  ...getElementCSS(block.elementStyles, 'cardIcon'),
                }}
              >
                {card.icon}
              </span>
            )}

            {/* When selected, expose the icon name field so the user can pick or clear it */}
            {isSelected && (
              <input
                type="text"
                value={card.icon || ''}
                onChange={(e) => updateCard(card.id, { icon: e.target.value || undefined })}
                onClick={(e) => e.stopPropagation()}
                className="block w-full mb-3 text-xs bg-transparent border-b border-border focus:outline-none text-muted-foreground"
                placeholder="Material Icon name (e.g. star) — leave blank for none"
              />
            )}

            <RichTextEditable
              html={card.title}
              onChange={(html) => updateCard(card.id, { title: html })}
              className="font-heading text-xl font-bold mb-2 w-full bg-transparent border-none focus:outline-none focus:border-b border-primary text-foreground"
              placeholder="Card Title"
              singleLine={true}
              toolbar={true}
              style={getElementCSS(block.elementStyles, 'cardTitle')}
            />

            {/* Subtitle — renderer reads card.subtitle (alias-supported) and renders between title and description */}
            {(card.subtitle || isSelected) && (
              <RichTextEditable
                html={card.subtitle || ''}
                onChange={(html) => updateCard(card.id, { subtitle: html || undefined })}
                className="text-sm font-medium text-primary/80 mb-2 tracking-wide w-full bg-transparent border-none focus:outline-none"
                placeholder="Subtitle (optional)"
                singleLine={true}
                toolbar={true}
                style={getElementCSS(block.elementStyles, 'cardSubtitle')}
              />
            )}

            <RichTextEditable
              html={card.description}
              onChange={(html) => updateCard(card.id, { description: html })}
              className="text-muted-foreground mb-4 w-full bg-transparent border-none focus:outline-none focus:border border-border rounded resize-none"
              placeholder="Card description..."
              singleLine={false}
              toolbar={true}
              style={getElementCSS(block.elementStyles, 'cardDescription')}
            />

            {(card.link || isSelected) && (
              <>
                {card.link && (
                  <div
                    className="flex items-center text-primary font-medium"
                    style={getElementCSS(block.elementStyles, 'cardLink')}
                  >
                    Learn more
                    <span className="material-icons text-base ml-1">arrow_forward</span>
                  </div>
                )}
                {isSelected && (
                  <input
                    type="text"
                    value={card.link || ''}
                    onChange={(e) => updateCard(card.id, { link: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    className="text-sm text-primary w-full bg-transparent border-none focus:outline-none focus:border-b border-primary/50 mt-2"
                    placeholder="Link URL (optional)"
                  />
                )}
              </>
            )}
          </div>
        ))}

        {isSelected && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              addCard();
            }}
            className="border-2 border-dashed border-border rounded-xl hover:border-primary hover:bg-primary/5 transition-colors flex flex-col items-center justify-center min-h-[250px]"
          >
            <span className="material-icons text-4xl text-muted-foreground mb-2">add</span>
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
    </section>
  );
}
