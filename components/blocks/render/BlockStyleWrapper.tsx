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

  // Check if any style property is set
  const hasAnyStyle = Object.values(style).some((v) => v !== undefined && v !== '');

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

  // Dimensions
  if (style.width) customStyles.width = style.width;
  if (style.height) customStyles.height = style.height;
  if (style.minWidth) customStyles.minWidth = style.minWidth;
  if (style.minHeight) customStyles.minHeight = style.minHeight;
  if (style.maxWidth) customStyles.maxWidth = style.maxWidth;
  if (style.maxHeight) customStyles.maxHeight = style.maxHeight;

  // Overflow
  if (style.overflow) customStyles.overflow = style.overflow;

  // Position
  if (style.position) customStyles.position = style.position;
  if (style.top) customStyles.top = style.top;
  if (style.right) customStyles.right = style.right;
  if (style.bottom) customStyles.bottom = style.bottom;
  if (style.left) customStyles.left = style.left;
  if (style.zIndex) customStyles.zIndex = style.zIndex;

  // Text
  if (style.textAlign) customStyles.textAlign = style.textAlign;
  if (style.textDecoration) customStyles.textDecoration = style.textDecoration;
  if (style.textTransform) customStyles.textTransform = style.textTransform;

  // Background image
  if (style.backgroundImage) customStyles.backgroundImage = `url(${style.backgroundImage})`;
  if (style.backgroundSize) customStyles.backgroundSize = style.backgroundSize;
  if (style.backgroundPosition) customStyles.backgroundPosition = style.backgroundPosition;
  if (style.backgroundRepeat) customStyles.backgroundRepeat = style.backgroundRepeat;

  // Transition
  if (style.transition) customStyles.transition = style.transition;

  // Grid layout
  if (style.gridTemplateColumns) customStyles.gridTemplateColumns = style.gridTemplateColumns;
  if (style.gridTemplateRows) customStyles.gridTemplateRows = style.gridTemplateRows;
  if (style.gridGap) customStyles.gap = style.gridGap;

  // Cursor
  if (style.cursor) customStyles.cursor = style.cursor;

  // Custom CSS - parse "key: value; key: value;" into CSSProperties
  if (style.customCSS) {
    style.customCSS.split(';').forEach((rule) => {
      const [prop, val] = rule.split(':').map((s) => s.trim());
      if (prop && val) {
        // Convert kebab-case to camelCase
        const camelProp = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        (customStyles as Record<string, string>)[camelProp] = val;
      }
    });
  }

  // fontFamily stores Tailwind class names (e.g., "font-sans"), apply as className
  const fontFamilyClass = style.fontFamily || '';

  return (
    <div className={fontFamilyClass} style={customStyles}>
      {children}
    </div>
  );
}
