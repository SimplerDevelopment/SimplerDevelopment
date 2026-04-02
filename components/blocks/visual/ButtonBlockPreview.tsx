'use client';

import { ButtonBlock } from '@/types/blocks';
import { ContentEditable } from './ContentEditable';

interface ButtonBlockPreviewProps {
  block: ButtonBlock;
  isSelected: boolean;
  onChange: (updates: Partial<ButtonBlock>) => void;
}

export function ButtonBlockPreview({ block, isSelected, onChange }: ButtonBlockPreviewProps) {
  const variantClasses = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/90',
    outline: 'border border-primary text-primary hover:bg-primary/10',
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  const alignmentClasses = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end',
  };

  return (
    <div className="p-6">
      <div className={`flex ${alignmentClasses[block.alignment || 'left']} my-4`}>
        <div
          className={`rounded-md font-medium inline-flex items-center transition-colors ${
            variantClasses[block.variant || 'primary']
          } ${sizeClasses[block.size || 'md']}`}
        >
          <ContentEditable
            html={block.text}
            onChange={(text) => onChange({ text })}
            className="focus:outline-none"
            placeholder="Button text..."
            tagName="span"
          />
        </div>
      </div>
    </div>
  );
}
