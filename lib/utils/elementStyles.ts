import type { BlockStyle } from '@/types/blocks';

/**
 * Convert a Partial<BlockStyle> to a React CSSProperties object.
 * Only includes properties that are set.
 */
export function elementStyleToCSS(style?: Partial<BlockStyle>): React.CSSProperties {
  if (!style) return {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const css: Record<string, any> = {};

  if (style.color) css.color = style.color;
  if (style.backgroundColor) css.backgroundColor = style.backgroundColor;
  if (style.fontSize) css.fontSize = style.fontSize;
  if (style.fontFamily) css.fontFamily = style.fontFamily;
  if (style.fontWeight) css.fontWeight = style.fontWeight;
  if (style.lineHeight) css.lineHeight = style.lineHeight;
  if (style.letterSpacing) css.letterSpacing = style.letterSpacing;
  if (style.textAlign) css.textAlign = style.textAlign as React.CSSProperties['textAlign'];
  if (style.textTransform) css.textTransform = style.textTransform as React.CSSProperties['textTransform'];
  if (style.padding) css.padding = style.padding;
  if (style.margin) css.margin = style.margin;
  if (style.borderRadius) css.borderRadius = style.borderRadius;
  if (style.borderWidth) css.borderWidth = style.borderWidth;
  if (style.borderColor) css.borderColor = style.borderColor;
  if (style.borderStyle) css.borderStyle = style.borderStyle;
  if (style.boxShadow) css.boxShadow = style.boxShadow;
  if (style.opacity !== undefined) css.opacity = style.opacity;
  if (style.width) css.width = style.width;
  if (style.height) css.height = style.height;
  if (style.maxWidth) css.maxWidth = style.maxWidth;
  if (style.minHeight) css.minHeight = style.minHeight;
  if (style.backgroundImage) css.backgroundImage = style.backgroundImage;
  if (style.backgroundSize) css.backgroundSize = style.backgroundSize;
  if (style.backgroundPosition) css.backgroundPosition = style.backgroundPosition;
  if (style.gap) css.gap = style.gap;

  return css;
}

/**
 * Get the CSS for a specific element from a block's elementStyles.
 */
export function getElementCSS(
  elementStyles: Record<string, Partial<BlockStyle>> | undefined,
  elementKey: string,
): React.CSSProperties {
  if (!elementStyles) return {};
  return elementStyleToCSS(elementStyles[elementKey]);
}
