'use client';

import { QuoteBlock } from '@/types/blocks';
import { ContentEditable } from './ContentEditable';

interface QuoteBlockPreviewProps {
  block: QuoteBlock;
  isSelected: boolean;
  onChange: (updates: Partial<QuoteBlock>) => void;
}

export function QuoteBlockPreview({ block, isSelected, onChange }: QuoteBlockPreviewProps) {
  return (
    <div className="py-8 my-8 px-6">
      <blockquote className={`border-l-4 border-primary pl-6 italic text-lg md:text-xl ${block.style?.color ? '' : 'text-muted-foreground'}`}>
        <ContentEditable
          html={block.content}
          onChange={(content) => onChange({ content })}
          className="focus:outline-none mb-4"
          placeholder="Enter your quote..."
        />
        {(block.author || block.citation) && (
          <footer className={`text-base not-italic font-medium ${block.style?.color ? '' : 'text-foreground'}`}>
            {block.author && <cite className="not-italic">— {block.author}</cite>}
            {block.citation && <span className="text-muted-foreground">, {block.citation}</span>}
          </footer>
        )}
      </blockquote>
    </div>
  );
}
