'use client';

import { AccordionBlock } from '@/types/blocks';
import { useState } from 'react';
import { getElementCSS } from '@/lib/utils/elementStyles';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { RichTextEditable } from './RichTextEditable';

interface AccordionBlockPreviewProps {
  block: AccordionBlock;
  isSelected: boolean;
  onChange: (updates: Partial<AccordionBlock>) => void;
}

export function AccordionBlockPreview({ block, isSelected, onChange }: AccordionBlockPreviewProps) {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());

  const style = typeof block.style === 'object' ? block.style : {};
  const hasCustomFontSize = !!style.fontSize;
  const hasCustomFontWeight = !!style.fontWeight;
  const hasCustomColor = !!style.color;

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
        block.responsive.fontSize
      )
    : '';

  const toggleItem = (id: string) => {
    const newOpenItems = new Set(openItems);
    if (newOpenItems.has(id)) {
      newOpenItems.delete(id);
    } else {
      newOpenItems.add(id);
    }
    setOpenItems(newOpenItems);
  };

  const addItem = () => {
    onChange({
      items: [
        ...block.items,
        {
          id: `accordion-${Date.now()}`,
          title: 'New Item',
          content: 'Item content goes here...',
        },
      ],
    });
  };

  const updateItem = (id: string, updates: Partial<typeof block.items[0]>) => {
    onChange({
      items: block.items.map(item => (item.id === id ? { ...item, ...updates } : item)),
    });
  };

  const removeItem = (id: string) => {
    onChange({
      items: block.items.filter(item => item.id !== id),
    });
  };

  return (
    <div className={`py-8 my-8 px-6 ${responsiveClasses}`}>
      {block.title && (
        <h3
          className={`${hasCustomFontSize ? '' : 'text-2xl'} ${hasCustomFontWeight ? '' : 'font-bold'} mb-6`}
          style={getElementCSS(block.elementStyles, 'title')}
        >
          {block.title}
        </h3>
      )}
      <div className="space-y-3">
        {block.items.map((item) => (
          <div
            key={item.id}
            className="border border-border rounded-lg overflow-hidden bg-card relative group"
          >
            {isSelected && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeItem(item.id);
                }}
                className="absolute top-2 right-2 p-1 text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                title="Remove item"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleItem(item.id);
              }}
              className="w-full p-4 flex items-center justify-between text-left font-medium hover:bg-muted/50 transition-colors"
            >
              <RichTextEditable
                html={item.title}
                onChange={(html) => updateItem(item.id, { title: html })}
                className="flex-1 text-left bg-transparent border-none focus:outline-none focus:border-b border-primary text-foreground"
                placeholder="Item title"
                singleLine={true}
                toolbar={true}
                style={getElementCSS(block.elementStyles, 'itemTitle')}
              />
              <svg
                className={`w-5 h-5 transition-transform ${
                  openItems.has(item.id) ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {openItems.has(item.id) && (
              <div className={`p-4 pt-0 ${hasCustomColor ? '' : 'text-muted-foreground'}`}>
                <RichTextEditable
                  html={item.content}
                  onChange={(html) => updateItem(item.id, { content: html })}
                  className="w-full bg-transparent border-none focus:outline-none focus:border border-border rounded resize-none"
                  placeholder="Item content..."
                  singleLine={false}
                  toolbar={true}
                  style={getElementCSS(block.elementStyles, 'itemContent')}
                />
              </div>
            )}
          </div>
        ))}

        {isSelected && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              addItem();
            }}
            className="w-full p-4 border-2 border-dashed border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-sm text-muted-foreground">Add Item</span>
          </button>
        )}
      </div>
    </div>
  );
}
