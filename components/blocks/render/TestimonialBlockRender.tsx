'use client';

import { TestimonialBlock } from '@/types/blocks';
import { combineResponsiveClasses } from '@/lib/utils/responsive';

interface TestimonialBlockRenderProps {
  block: TestimonialBlock;
}

export function TestimonialBlockRender({ block }: TestimonialBlockRenderProps) {
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
        block.responsive.visibility
      )
    : '';

  return (
    <div className={`py-16 my-8 ${responsiveClasses}`}>
      <div className="max-w-4xl mx-auto text-center">
        <div className="relative">
          <svg
            className="absolute top-0 left-0 transform -translate-x-6 -translate-y-8 h-16 w-16 text-primary/20"
            fill="currentColor"
            viewBox="0 0 32 32"
          >
            <path d="M9.352 4C4.456 7.456 1 13.12 1 19.36c0 5.088 3.072 8.064 6.624 8.064 3.36 0 5.856-2.688 5.856-5.856 0-3.168-2.208-5.472-5.088-5.472-.576 0-1.344.096-1.536.192.48-3.264 3.552-7.104 6.624-9.024L9.352 4zm16.512 0c-4.8 3.456-8.256 9.12-8.256 15.36 0 5.088 3.072 8.064 6.624 8.064 3.264 0 5.856-2.688 5.856-5.856 0-3.168-2.304-5.472-5.184-5.472-.576 0-1.248.096-1.44.192.48-3.264 3.456-7.104 6.528-9.024L25.864 4z" />
          </svg>

          <blockquote className="text-xl md:text-2xl font-medium text-foreground mb-8">
            {block.quote}
          </blockquote>

          <div className="flex flex-col items-center">
            {block.avatar && (
              <img
                src={block.avatar}
                alt={block.author}
                className="w-16 h-16 rounded-full mb-4 object-cover"
              />
            )}
            <cite className="not-italic">
              <div className="font-semibold text-foreground">{block.author}</div>
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
