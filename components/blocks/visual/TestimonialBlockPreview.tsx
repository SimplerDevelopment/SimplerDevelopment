'use client';

import { TestimonialBlock } from '@/types/blocks';
import { ContentEditable } from './ContentEditable';

interface TestimonialBlockPreviewProps {
  block: TestimonialBlock;
  isSelected: boolean;
  onChange: (updates: Partial<TestimonialBlock>) => void;
}

export function TestimonialBlockPreview({ block, isSelected, onChange }: TestimonialBlockPreviewProps) {
  return (
    <div className="py-16 my-8 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <div className="relative">
          {/* Decorative Quote Icon (SVG) */}
          <svg
            className="absolute top-0 left-0 transform -translate-x-6 -translate-y-8 h-16 w-16 text-primary/20"
            fill="currentColor"
            viewBox="0 0 32 32"
          >
            <path d="M9.352 4C4.456 7.456 1 13.12 1 19.36c0 5.088 3.072 8.064 6.624 8.064 3.36 0 5.856-2.688 5.856-5.856 0-3.168-2.208-5.472-5.088-5.472-.576 0-1.344.096-1.536.192.48-3.264 3.552-7.104 6.624-9.024L9.352 4zm16.512 0c-4.8 3.456-8.256 9.12-8.256 15.36 0 5.088 3.072 8.064 6.624 8.064 3.264 0 5.856-2.688 5.856-5.856 0-3.168-2.304-5.472-5.184-5.472-.576 0-1.248.096-1.44.192.48-3.264 3.456-7.104 6.528-9.024L25.864 4z" />
          </svg>

          {/* Quote */}
          <ContentEditable
            html={block.quote}
            onChange={(quote) => onChange({ quote })}
            className="text-xl md:text-2xl font-medium text-foreground mb-8 focus:outline-none"
            placeholder="Enter testimonial quote..."
            tagName="blockquote"
          />

          {/* Author Info */}
          <div className="flex flex-col items-center">
            {/* Avatar */}
            {block.avatar ? (
              <img
                src={block.avatar}
                alt={block.author}
                className="w-16 h-16 rounded-full mb-4 object-cover"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-2xl mb-4">
                {block.author.charAt(0).toUpperCase()}
              </div>
            )}

            <cite className="not-italic">
              <input
                type="text"
                value={block.author}
                onChange={(e) => onChange({ author: e.target.value })}
                onClick={(e) => e.stopPropagation()}
                className="font-semibold text-foreground w-full bg-transparent border-none focus:outline-none focus:border-b border-primary text-center"
                placeholder="Author Name"
              />
              {(block.role || block.company || isSelected) && (
                <div className="text-sm text-muted-foreground mt-1 text-center">
                  {(block.role || isSelected) && (
                    <input
                      type="text"
                      value={block.role || ''}
                      onChange={(e) => onChange({ role: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full bg-transparent border-none focus:outline-none focus:border-b border-border text-muted-foreground text-center"
                      placeholder="Role"
                    />
                  )}
                  {block.role && block.company && ' at '}
                  {(block.company || isSelected) && (
                    <input
                      type="text"
                      value={block.company || ''}
                      onChange={(e) => onChange({ company: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full bg-transparent border-none focus:outline-none focus:border-b border-border text-muted-foreground text-center"
                      placeholder="Company"
                    />
                  )}
                </div>
              )}
            </cite>
          </div>
        </div>
      </div>
    </div>
  );
}
