'use client';

import { SpacerBlock } from '@/types/blocks';
import { combineResponsiveClasses } from '@/lib/utils/responsive';

interface SpacerBlockPreviewProps {
  block: SpacerBlock;
  isSelected: boolean;
  onChange: (updates: Partial<SpacerBlock>) => void;
}

const HEIGHT_CLASSES: Record<string, string> = { sm: 'h-4', md: 'h-8', lg: 'h-16', xl: 'h-32' };

export function SpacerBlockPreview({ block, isSelected, onChange }: SpacerBlockPreviewProps) {
  // Mirror SpacerBlockRender's effective-height precedence (VEQA-058): Style-tab
  // desktop height → flat style.height → non-enum block.height → enum class.
  const style = typeof block.style === 'object' ? block.style : undefined;
  const inlineHeight =
    block.responsiveStyle?.desktop?.height ||
    style?.height ||
    (HEIGHT_CLASSES[block.height] ? undefined : block.height) ||
    undefined;
  const heightClass = inlineHeight ? '' : (HEIGHT_CLASSES[block.height] ?? 'h-8');
  const heightLabel = inlineHeight ?? String(block.height).toUpperCase();

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
    <div className={`p-6 ${responsiveClasses}`}>
      <div
        className={`${heightClass} bg-muted/20 border-2 border-dashed border-border rounded flex items-center justify-center`}
        style={inlineHeight ? { height: inlineHeight } : undefined}
      >
        <span className="text-xs text-muted-foreground">
          Spacer ({heightLabel})
        </span>
      </div>
    </div>
  );
}
