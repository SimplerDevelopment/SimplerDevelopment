'use client';

import React from 'react';
import { Block, BlockStyle } from '@/types/blocks';

interface BlockStyleWrapperProps {
  block: Block;
  children: React.ReactNode;
}

/**
 * Wraps rendered blocks with their block.style inline styles and fontFamily class.
 * Used in preview and production renders to apply user-configured styling
 * (background, text color, font, border, shadow, opacity, static padding/margin).
 */
export function BlockStyleWrapper({ block, children }: BlockStyleWrapperProps) {
  const style = block.style;
  if (!style || typeof style !== 'object') {
    return <>{children}</>;
  }

  const hasAnyStyle = style.backgroundColor || style.color || style.fontSize ||
    style.fontWeight || style.lineHeight || style.letterSpacing || style.borderWidth ||
    style.borderColor || style.borderStyle || style.borderRadius || style.padding ||
    style.margin || style.boxShadow || style.opacity || style.fontFamily ||
    style.display || style.flexDirection || style.justifyContent || style.alignItems ||
    style.flexWrap || style.gap || style.alignSelf;

  if (!hasAnyStyle) {
    return <>{children}</>;
  }

  const customStyles: React.CSSProperties = {};

  if (style.backgroundColor) customStyles.backgroundColor = style.backgroundColor;
  if (style.color) customStyles.color = style.color;
  if (style.fontSize) customStyles.fontSize = style.fontSize;
  if (style.fontWeight) customStyles.fontWeight = style.fontWeight;
  if (style.lineHeight) customStyles.lineHeight = style.lineHeight;
  if (style.letterSpacing) customStyles.letterSpacing = style.letterSpacing;
  if (style.borderWidth) customStyles.borderWidth = style.borderWidth;
  if (style.borderColor) customStyles.borderColor = style.borderColor;
  if (style.borderStyle) customStyles.borderStyle = style.borderStyle;
  if (style.borderRadius) customStyles.borderRadius = style.borderRadius;
  if (style.boxShadow) customStyles.boxShadow = style.boxShadow;
  if (style.opacity) customStyles.opacity = style.opacity;

  // Only apply static padding/margin if no responsive equivalents are set.
  // Responsive spacing uses Tailwind classes in render components; inline styles
  // would override those classes and break per-breakpoint behavior.
  const r = block.responsive;
  const hasResponsivePadding = r?.paddingTop || r?.paddingBottom || r?.paddingLeft || r?.paddingRight;
  const hasResponsiveMargin = r?.marginTop || r?.marginBottom || r?.marginLeft || r?.marginRight;

  if (style.padding && !hasResponsivePadding) customStyles.padding = style.padding;
  if (style.margin && !hasResponsiveMargin) customStyles.margin = style.margin;

  // Flex layout
  if (style.display) customStyles.display = style.display;
  if (style.flexDirection) customStyles.flexDirection = style.flexDirection;
  if (style.justifyContent) customStyles.justifyContent = style.justifyContent;
  if (style.alignItems) customStyles.alignItems = style.alignItems;
  if (style.flexWrap) customStyles.flexWrap = style.flexWrap;
  if (style.gap) customStyles.gap = style.gap;
  if (style.alignSelf) customStyles.alignSelf = style.alignSelf;

  // fontFamily stores Tailwind class names (e.g., "font-sans"), apply as className
  const fontFamilyClass = style.fontFamily || '';

  return (
    <div className={fontFamilyClass} style={customStyles}>
      {children}
    </div>
  );
}
