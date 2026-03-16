'use client';

import { CodeBlock } from '@/types/blocks';

interface CodeBlockPreviewProps {
  block: CodeBlock;
  isSelected: boolean;
  onChange: (updates: Partial<CodeBlock>) => void;
}

export function CodeBlockPreview({ block, isSelected, onChange }: CodeBlockPreviewProps) {
  return (
    <div className="py-4 my-6 px-6">
      <div className="rounded-lg bg-slate-900 dark:bg-slate-950 overflow-hidden">
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
            className="w-full bg-transparent text-sm text-slate-100 font-mono resize-none focus:outline-none min-h-[200px] overflow-x-auto"
            placeholder="// Enter your code here..."
          />
        </div>
      </div>
    </div>
  );
}
