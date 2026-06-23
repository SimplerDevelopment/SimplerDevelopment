'use client';

import { CodeBlock } from '@/types/blocks';
import { combineResponsiveClasses } from '@/lib/utils/responsive';

interface CodeBlockPreviewProps {
  block: CodeBlock;
  isSelected: boolean;
  onChange: (updates: Partial<CodeBlock>) => void;
}

export function CodeBlockPreview({ block, isSelected, onChange }: CodeBlockPreviewProps) {
  const style = typeof block.style === 'object' ? block.style : {};

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
    <div className={`py-4 my-6 px-6 ${responsiveClasses}`}>
      <div className={`rounded-lg ${style.backgroundColor ? '' : 'bg-slate-900 dark:bg-slate-950'} overflow-hidden`}>
        {block.language && (
          <div className="px-4 py-2 text-xs text-slate-400 border-b border-slate-700 bg-slate-800">
            {block.language}
          </div>
        )}
        <div className="p-4">
          <textarea
            value={block.code}
            onChange={(e) => onChange({ code: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            className={`w-full bg-transparent text-sm ${style.color ? '' : 'text-slate-100'} font-mono resize-none focus:outline-none min-h-[200px] overflow-x-auto`}
            placeholder="// Enter your code here..."
          />
        </div>
      </div>
    </div>
  );
}
