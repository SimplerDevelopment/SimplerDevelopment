'use client';

import { AccordionBlock } from '@/types/blocks';
import { useState } from 'react';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { getElementCSS } from '@/lib/utils/elementStyles';

interface AccordionBlockRenderProps {
  block: AccordionBlock;
}

export function AccordionBlockRender({ block }: AccordionBlockRenderProps) {
  const style = typeof block.style === 'object' ? block.style : {};
  const hasCustomFontSize = !!style.fontSize;
  const hasCustomFontWeight = !!style.fontWeight;
  const hasCustomColor = !!style.color;

  const [openItems, setOpenItems] = useState<string[]>([]);

  const toggleItem = (id: string) => {
    setOpenItems(prev =>
      prev.includes(id)
        ? prev.filter(itemId => itemId !== id)
        : [...prev, id]
    );
  };

  // Generate responsive classes from block settings
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

  return (
    <div className={`py-8 my-8 ${responsiveClasses}`}>
      {block.title && (
        <h3 className={`${hasCustomFontSize ? '' : 'text-2xl'} ${hasCustomFontWeight ? '' : 'font-bold'} mb-6`} style={getElementCSS(block.elementStyles, 'title')} dangerouslySetInnerHTML={{ __html: block.title }} />
      )}
      <div className="space-y-3">
        {(block.items || []).map((item) => {
          const isOpen = openItems.includes(item.id);

          return (
            <div key={item.id} className="border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => toggleItem(item.id)}
                className="w-full flex items-center justify-between p-4 text-left font-medium hover:bg-muted/50 transition-colors"
              >
                <span style={getElementCSS(block.elementStyles, 'itemTitle')} dangerouslySetInnerHTML={{ __html: item.title }} />
                <svg
                  className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isOpen && (
                <div className={`p-4 pt-0 ${hasCustomColor ? '' : 'text-muted-foreground'}`} style={getElementCSS(block.elementStyles, 'itemContent')} dangerouslySetInnerHTML={{ __html: item.content }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
