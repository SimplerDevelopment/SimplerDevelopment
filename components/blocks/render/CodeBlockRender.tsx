'use client';

import { CodeBlock } from '@/types/blocks';
import { combineResponsiveClasses } from '@/lib/utils/responsive';

interface CodeBlockRenderProps {
  block: CodeBlock;
}

export function CodeBlockRender({ block }: CodeBlockRenderProps) {
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
    <div className={`py-4 my-6 ${responsiveClasses}`}>
      <div className="rounded-lg bg-slate-900 dark:bg-slate-950 overflow-hidden">
        {block.language && (
          <div className="px-4 py-2 text-xs text-slate-400 border-b border-slate-700 bg-slate-800">
            {block.language}
          </div>
        )}
        <pre className="p-4 overflow-x-auto">
          <code className="text-sm text-slate-100 font-mono">{block.code}</code>
        </pre>
      </div>
    </div>
  );
}
