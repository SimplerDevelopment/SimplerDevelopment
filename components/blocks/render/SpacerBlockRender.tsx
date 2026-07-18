'use client';

import { SpacerBlock } from '@/types/blocks';
import { combineResponsiveClasses } from '@/lib/utils/responsive';

interface SpacerBlockRenderProps {
  block: SpacerBlock;
}

const HEIGHT_CLASSES: Record<string, string> = { sm: 'h-4', md: 'h-8', lg: 'h-16', xl: 'h-32' };

export function SpacerBlockRender({ block }: SpacerBlockRenderProps) {
  // Precedence mirrors BlockStyleWrapper: responsiveStyle desktop height (Style
  // tab) → flat style.height (resize drag) → a non-enum block.height ('40px'
  // from external drop) → enum class (VEQA-058). Per-breakpoint tablet/mobile
  // height stays owned by BlockStyleWrapper's CSS on the wrapper.
  const style = typeof block.style === 'object' ? block.style : undefined;
  const inlineHeight =
    block.responsiveStyle?.desktop?.height ||
    style?.height ||
    (HEIGHT_CLASSES[block.height] ? undefined : block.height) ||
    undefined;
  const heightClass = inlineHeight ? '' : (HEIGHT_CLASSES[block.height] ?? 'h-8');

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
    <div
      className={`${heightClass} ${responsiveClasses}`.trim()}
      style={inlineHeight ? { height: inlineHeight } : undefined}
    />
  );
}
