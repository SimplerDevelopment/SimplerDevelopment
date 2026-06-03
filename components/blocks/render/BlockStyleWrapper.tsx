'use client';

import React from 'react';
import { Block, BlockStyle } from '@/types/blocks';
import { isBrandSentinel, resolveBrandSentinel } from '@/lib/branding/sentinel';
import { generateResponsiveStyles, parseShorthandSide } from '@/lib/utils/responsiveCss';
import { cssFontStack } from '@/lib/blocks/page-fonts';

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
  const responsiveResult = generateResponsiveStyles(block);
  const rawStyle = block.style;
  // Normalize style to an object so the rest of the function can read fields
  // safely even when callers passed `undefined` (and we still need to render
  // because there are responsive values).
  const style: BlockStyle =
    rawStyle && typeof rawStyle === 'object' ? rawStyle : ({} as BlockStyle);

  const hasAnyStyle = Object.values(style).some((v) => v !== undefined && v !== '');
  if (!hasAnyStyle && !responsiveResult) {
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

  // Per-side resolution for margin/padding. Each side independently checks
  // whether `block.responsive` owns it (any breakpoint set) and, if not,
  // applies the static value — preferring longhand `style.{prop}{Side}` over
  // a side parsed out of the shorthand `style.{prop}`. Emitting longhand
  // (marginTop, etc.) — never shorthand — keeps each side independently
  // overridable by the responsive <style> tag without one side wiping the
  // others. Bug class this guards against: setting a single responsive side
  // dropped the entire static shorthand, so all four sides flipped at once.
  const resp = block.responsive;
  type SideKey = 'top' | 'right' | 'bottom' | 'left';
  type LonghandKey =
    | 'marginTop' | 'marginRight' | 'marginBottom' | 'marginLeft'
    | 'paddingTop' | 'paddingRight' | 'paddingBottom' | 'paddingLeft';

  const sideKey = (prop: 'margin' | 'padding', side: SideKey): LonghandKey =>
    (prop + side[0].toUpperCase() + side.slice(1)) as LonghandKey;

  const responsiveOwns = (prop: 'margin' | 'padding', side: SideKey): boolean => {
    if (!resp) return false;
    const bucket = resp[sideKey(prop, side) as keyof typeof resp] as
      | { mobile?: unknown; tablet?: unknown; desktop?: unknown }
      | undefined;
    if (!bucket || typeof bucket !== 'object') return false;
    const isSet = (v: unknown) => v !== undefined && v !== null && v !== '';
    return isSet(bucket.mobile) || isSet(bucket.tablet) || isSet(bucket.desktop);
  };

  const sides: SideKey[] = ['top', 'right', 'bottom', 'left'];
  for (const prop of ['margin', 'padding'] as const) {
    const shorthand = style[prop];
    for (const side of sides) {
      if (responsiveOwns(prop, side)) continue;
      const longhandKey = sideKey(prop, side);
      const longhand = style[longhandKey];
      const value = longhand && longhand !== '' ? longhand : parseShorthandSide(shorthand, side);
      if (value) {
        (customStyles as Record<string, string>)[longhandKey] = value;
      }
    }
  }

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

  // Compose background-image from gradient + image (gradient layers on top)
  const bgLayers: string[] = [];
  if (style.backgroundGradient) bgLayers.push(style.backgroundGradient);
  if (style.backgroundImage) bgLayers.push(`url(${style.backgroundImage})`);
  if (bgLayers.length > 0) customStyles.backgroundImage = bgLayers.join(', ');
  if (style.backgroundSize) customStyles.backgroundSize = style.backgroundSize;
  if (style.backgroundPosition) customStyles.backgroundPosition = style.backgroundPosition;
  if (style.backgroundRepeat) customStyles.backgroundRepeat = style.backgroundRepeat;
  if (style.backgroundAttachment) customStyles.backgroundAttachment = style.backgroundAttachment as React.CSSProperties['backgroundAttachment'];
  if (style.backgroundBlendMode) customStyles.backgroundBlendMode = style.backgroundBlendMode as React.CSSProperties['backgroundBlendMode'];

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
      // cssFontStack handles both bare names ("Raleway" → '"Raleway", sans-serif')
      // and already-stacked values ("Raleway, -apple-system, ..." used verbatim).
      // The old code quoted the whole value, turning a stack into one invalid
      // family name that silently fell back to the generic.
      customStyles.fontFamily = cssFontStack(rawFont);
    }
  }

  const wrapperClass = [fontFamilyClass, responsiveResult?.className]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      {/* Google Fonts links are NOT emitted per-block anymore — they are
          collected once at the page level (SiteBlockRenderer) into a single
          combined request. Emitting one <link> per styled block produced
          40-50 render-blocking requests and tanked FCP/LCP. */}
      {responsiveResult && (
        <style dangerouslySetInnerHTML={{ __html: responsiveResult.css }} />
      )}
      <div className={wrapperClass || undefined} style={customStyles}>
        {children}
      </div>
    </>
  );
}
