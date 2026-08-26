'use client';

import { TestimonialBlock } from '@/types/blocks';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { getElementCSS } from '@/lib/utils/elementStyles';
import { ancestorStyle, useResolvedTypography } from './typography-cascade';

interface TestimonialBlockRenderProps {
  block: TestimonialBlock;
}

export function TestimonialBlockRender({ block }: TestimonialBlockRenderProps) {
  // VEQA-032 step 3a — this leaf has two named content elements (quote,
  // author), each already applying its own elementStyles slot via
  // getElementCSS at the same call site as its fallback-class guard, so
  // resolve per elementKey and let a section/column ancestor also suppress
  // that element's fallback. No own/ancestor value → resolved.*.value is
  // undefined and behavior is unchanged.
  const resolvedQuote = useResolvedTypography(block, 'quote');
  const resolvedAuthor = useResolvedTypography(block, 'author');

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
    <div className={responsiveClasses}>
      <div className="max-w-4xl mx-auto text-center">
        <div className="relative">
          <svg
            className="absolute top-0 left-0 transform -translate-x-6 -translate-y-8"
            fill="currentColor"
            viewBox="0 0 32 32"
            style={{
              color: 'var(--brand-primary, currentColor)',
              opacity: 0.2,
              width: '64px',
              height: '64px',
              ...getElementCSS(block.elementStyles, 'quoteIcon'),
            }}
          >
            <path d="M9.352 4C4.456 7.456 1 13.12 1 19.36c0 5.088 3.072 8.064 6.624 8.064 3.36 0 5.856-2.688 5.856-5.856 0-3.168-2.208-5.472-5.088-5.472-.576 0-1.344.096-1.536.192.48-3.264 3.552-7.104 6.624-9.024L9.352 4zm16.512 0c-4.8 3.456-8.256 9.12-8.256 15.36 0 5.088 3.072 8.064 6.624 8.064 3.264 0 5.856-2.688 5.856-5.856 0-3.168-2.304-5.472-5.184-5.472-.576 0-1.248.096-1.44.192.48-3.264 3.456-7.104 6.528-9.024L25.864 4z" />
          </svg>

          <blockquote data-editable-field="quote" className={`${resolvedQuote.fontSize.value ? '' : 'text-xl md:text-2xl'} ${resolvedQuote.fontWeight.value ? '' : 'font-medium'} ${resolvedQuote.color.value ? '' : 'text-foreground'} mb-8`} style={{ ...ancestorStyle(resolvedQuote), ...getElementCSS(block.elementStyles, 'quote') }}>
            {block.quote}
          </blockquote>

          <div className="flex flex-col items-center">
            {block.avatar && (
              <img decoding="async" loading="lazy"
                src={block.avatar}
                alt={block.author}
                className="w-16 h-16 rounded-full mb-4 object-cover"
              />
            )}
            <cite className="not-italic">
              <div data-editable-field="author" className={`${resolvedAuthor.fontWeight.value ? '' : 'font-semibold'} ${resolvedAuthor.color.value ? '' : 'text-foreground'}`} style={{ ...ancestorStyle(resolvedAuthor), ...getElementCSS(block.elementStyles, 'author') }}>{block.author}</div>
              {(block.role || block.company) && (
                <div className="text-sm text-muted-foreground mt-1">
                  {block.role}
                  {block.role && block.company && ' at '}
                  {block.company}
                </div>
              )}
            </cite>
          </div>
        </div>
      </div>
    </div>
  );
}
