'use client';

import React from 'react';
import { Block, BlockStyle } from '@/types/blocks';
import { isBrandSentinel, resolveBrandSentinel } from '@/lib/branding/sentinel';

interface BlockStyleWrapperProps {
  block: Block;
  children: React.ReactNode;
}

/**
 * Wraps rendered blocks with their block.style inline styles and fontFamily class.
 * Used in preview and production renders to apply user-configured styling
 * (background, text color, font, border, shadow, opacity, static padding/margin).
 *
 * Any style value may be a brand sentinel (e.g. "brand.primary") which is
 * resolved to `var(--brand-primary)` via resolveBrandSentinel. Unknown values
 * pass through unchanged.
 */
export function BlockStyleWrapper({ block, children }: BlockStyleWrapperProps) {
  const style = block.style;
  if (!style || typeof style !== 'object') {
    return <>{children}</>;
  }

  const hasAnyStyle = Object.values(style).some((v) => v !== undefined && v !== '');
  if (!hasAnyStyle) {
    return <>{children}</>;
  }

  const customStyles: React.CSSProperties = {};
  const r = (v: string | undefined) => resolveBrandSentinel(v);

  const selfStyled = block.type === 'section';

  if (style.backgroundColor) customStyles.backgroundColor = r(style.backgroundColor);
  if (style.color) customStyles.color = r(style.color);
  if (style.fontSize) customStyles.fontSize = style.fontSize;
  if (style.fontWeight) customStyles.fontWeight = style.fontWeight;
  if (style.lineHeight) customStyles.lineHeight = style.lineHeight;
  if (style.letterSpacing) customStyles.letterSpacing = style.letterSpacing;
  if (!selfStyled) {
    if (style.borderWidth) customStyles.borderWidth = style.borderWidth;
    if (style.borderColor) customStyles.borderColor = r(style.borderColor);
    if (style.borderStyle) customStyles.borderStyle = style.borderStyle;
    if (style.borderRadius) customStyles.borderRadius = r(style.borderRadius);
    if (style.borderTopWidth) customStyles.borderTopWidth = style.borderTopWidth;
    if (style.borderTopColor) customStyles.borderTopColor = r(style.borderTopColor);
    if (style.borderTopStyle) customStyles.borderTopStyle = style.borderTopStyle as React.CSSProperties['borderTopStyle'];
    if (style.borderRightWidth) customStyles.borderRightWidth = style.borderRightWidth;
    if (style.borderRightColor) customStyles.borderRightColor = r(style.borderRightColor);
    if (style.borderRightStyle) customStyles.borderRightStyle = style.borderRightStyle as React.CSSProperties['borderRightStyle'];
    if (style.borderBottomWidth) customStyles.borderBottomWidth = style.borderBottomWidth;
    if (style.borderBottomColor) customStyles.borderBottomColor = r(style.borderBottomColor);
    if (style.borderBottomStyle) customStyles.borderBottomStyle = style.borderBottomStyle as React.CSSProperties['borderBottomStyle'];
    if (style.borderLeftWidth) customStyles.borderLeftWidth = style.borderLeftWidth;
    if (style.borderLeftColor) customStyles.borderLeftColor = r(style.borderLeftColor);
    if (style.borderLeftStyle) customStyles.borderLeftStyle = style.borderLeftStyle as React.CSSProperties['borderLeftStyle'];
    if (style.borderTopLeftRadius) customStyles.borderTopLeftRadius = r(style.borderTopLeftRadius);
    if (style.borderTopRightRadius) customStyles.borderTopRightRadius = r(style.borderTopRightRadius);
    if (style.borderBottomLeftRadius) customStyles.borderBottomLeftRadius = r(style.borderBottomLeftRadius);
    if (style.borderBottomRightRadius) customStyles.borderBottomRightRadius = r(style.borderBottomRightRadius);
    if (style.boxShadow) customStyles.boxShadow = style.boxShadow;
    if (style.opacity) customStyles.opacity = style.opacity;
  }

  const resp = block.responsive;
  const hasResponsivePadding = resp?.paddingTop || resp?.paddingBottom || resp?.paddingLeft || resp?.paddingRight;
  const hasResponsiveMargin = resp?.marginTop || resp?.marginBottom || resp?.marginLeft || resp?.marginRight;

  if (style.padding && !hasResponsivePadding) customStyles.padding = style.padding;
  if (style.margin && !hasResponsiveMargin) customStyles.margin = style.margin;

  if (style.display) customStyles.display = style.display;
  if (style.flexDirection) customStyles.flexDirection = style.flexDirection;
  if (style.justifyContent) customStyles.justifyContent = style.justifyContent;
  if (style.alignItems) customStyles.alignItems = style.alignItems;
  if (style.flexWrap) customStyles.flexWrap = style.flexWrap;
  if (style.gap) customStyles.gap = style.gap;
  if (style.alignSelf) customStyles.alignSelf = style.alignSelf;

  if (style.width) customStyles.width = style.width;
  if (style.height) customStyles.height = style.height;
  if (style.minWidth) customStyles.minWidth = style.minWidth;
  if (style.minHeight) customStyles.minHeight = style.minHeight;
  if (style.maxWidth) customStyles.maxWidth = style.maxWidth;
  if (style.maxHeight) customStyles.maxHeight = style.maxHeight;

  if (style.overflow) customStyles.overflow = style.overflow;

  if (style.position) customStyles.position = style.position;
  if (style.top) customStyles.top = style.top;
  if (style.right) customStyles.right = style.right;
  if (style.bottom) customStyles.bottom = style.bottom;
  if (style.left) customStyles.left = style.left;
  if (style.zIndex) customStyles.zIndex = style.zIndex;

  if (style.textAlign) customStyles.textAlign = style.textAlign;
  if (style.textDecoration) customStyles.textDecoration = style.textDecoration;
  if (style.textTransform) customStyles.textTransform = style.textTransform;

  if (style.backgroundImage) customStyles.backgroundImage = `url(${style.backgroundImage})`;
  if (style.backgroundSize) customStyles.backgroundSize = style.backgroundSize;
  if (style.backgroundPosition) customStyles.backgroundPosition = style.backgroundPosition;
  if (style.backgroundRepeat) customStyles.backgroundRepeat = style.backgroundRepeat;

  if (style.transition) customStyles.transition = style.transition;

  if (style.gridTemplateColumns) customStyles.gridTemplateColumns = style.gridTemplateColumns;
  if (style.gridTemplateRows) customStyles.gridTemplateRows = style.gridTemplateRows;
  if (style.gridGap) customStyles.gap = style.gridGap;

  if (style.cursor) customStyles.cursor = style.cursor;

  if (style.customCSS) {
    style.customCSS.split(';').forEach((rule) => {
      const [prop, val] = rule.split(':').map((s) => s.trim());
      if (prop && val) {
        const camelProp = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        (customStyles as Record<string, string>)[camelProp] = val;
      }
    });
  }

  // fontFamily: supports Tailwind class ("font-*"), brand sentinel ("brand.headingFont"),
  // or a Google Font name (which we auto-load via <link>).
  const rawFont = style.fontFamily;
  const isTailwindFont = rawFont?.startsWith('font-');
  const isBrandFont = isBrandSentinel(rawFont);
  const fontFamilyClass = isTailwindFont ? rawFont : '';

  if (rawFont && !isTailwindFont) {
    if (isBrandFont) {
      customStyles.fontFamily = resolveBrandSentinel(rawFont);
    } else {
      customStyles.fontFamily = `"${rawFont}", sans-serif`;
    }
  }

  return (
    <>
      {rawFont && !isTailwindFont && !isBrandFont && (
        <link
          rel="stylesheet"
          href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(rawFont)}&display=swap`}
        />
      )}
      <div className={fontFamilyClass || undefined} style={customStyles}>
        {children}
      </div>
    </>
  );
}
