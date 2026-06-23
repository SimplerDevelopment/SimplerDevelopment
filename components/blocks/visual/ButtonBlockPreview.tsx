'use client';

import { ButtonBlock } from '@/types/blocks';
import { ContentEditable } from './ContentEditable';
import { useBranding } from '@/contexts/BrandingContext';
import { findPreset, presetToStyle } from '@/lib/branding/button-presets';
import { Icon } from '@/components/ui/Icon';

interface ButtonBlockPreviewProps {
  block: ButtonBlock;
  isSelected: boolean;
  onChange: (updates: Partial<ButtonBlock>) => void;
}

export function ButtonBlockPreview({ block, isSelected, onChange }: ButtonBlockPreviewProps) {
  const branding = useBranding();
  const style = typeof block.style === 'object' ? block.style : {};
  const hasCustomBg = !!style.backgroundColor;
  const hasCustomColor = !!style.color;
  const hasCustomFontSize = !!style.fontSize;

  const variant = block.variant || 'primary';
  const bs = branding?.buttonStyle;
  const preset = findPreset(branding?.buttonPresets, block.presetId);

  // Mirror ButtonBlockRender variant map — preset, when present, owns bg/text.
  const variantMap = {
    primary: {
      bg: hasCustomBg ? '' : 'bg-primary hover:bg-primary/90',
      text: hasCustomColor ? '' : 'text-primary-foreground',
    },
    secondary: {
      bg: hasCustomBg ? '' : 'bg-secondary hover:bg-secondary/90',
      text: hasCustomColor ? '' : 'text-secondary-foreground',
    },
    outline: {
      bg: hasCustomBg ? '' : 'border border-primary hover:bg-primary/10',
      text: hasCustomColor ? '' : 'text-primary',
    },
  } as const;
  const variantClasses = variantMap[variant as keyof typeof variantMap] ?? variantMap.primary;
  const variantClass = preset ? '' : `${variantClasses.bg} ${variantClasses.text}`.trim();

  const sizePadding = {
    sm: 'px-3 py-1.5',
    md: 'px-4 py-2',
    lg: 'px-6 py-3',
  }[block.size || 'md'];
  const sizeText = hasCustomFontSize ? '' : {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  }[block.size || 'md'];
  const sizeClass = `${sizePadding} ${sizeText}`.trim();

  const alignmentClasses = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end',
  };

  // Build inline styles, mirroring the renderer's preset → buttonStyle → block.style cascade.
  let inlineStyle: React.CSSProperties = {};
  if (preset) {
    inlineStyle = { ...presetToStyle(preset) };
  } else if (bs) {
    const btnRadius = bs.borderRadius || branding?.borderRadius;
    if (btnRadius) inlineStyle.borderRadius = btnRadius;
    if (variant === 'primary') {
      if (bs.primaryBg) inlineStyle.backgroundColor = bs.primaryBg;
      if (bs.primaryText) inlineStyle.color = bs.primaryText;
    } else if (variant === 'secondary') {
      if (bs.secondaryBg) inlineStyle.backgroundColor = bs.secondaryBg;
      if (bs.secondaryText) inlineStyle.color = bs.secondaryText;
    }
  } else if (branding?.borderRadius) {
    inlineStyle.borderRadius = branding.borderRadius;
  }

  if (style.backgroundColor) inlineStyle.backgroundColor = style.backgroundColor;
  if (style.color) inlineStyle.color = style.color;
  if (style.borderColor) inlineStyle.borderColor = style.borderColor;
  if (style.borderWidth) inlineStyle.borderWidth = style.borderWidth;
  if (style.borderStyle) inlineStyle.borderStyle = style.borderStyle as React.CSSProperties['borderStyle'];
  if (style.borderRadius) inlineStyle.borderRadius = style.borderRadius;
  if (style.fontSize) inlineStyle.fontSize = style.fontSize;
  if (style.fontWeight) inlineStyle.fontWeight = style.fontWeight;
  if (style.letterSpacing) inlineStyle.letterSpacing = style.letterSpacing;
  if (style.textTransform) inlineStyle.textTransform = style.textTransform;

  const iconEl = block.icon ? (
    <Icon name={block.icon} className="btn-icon" />
  ) : null;
  const iconPos = block.iconPosition || 'left';

  return (
    <div className="p-6">
      <div className={`flex ${alignmentClasses[block.alignment || 'left']} my-4`}>
        <div
          className={`${variantClass} ${sizeClass} font-medium inline-flex items-center gap-2 transition-colors ${!bs?.borderRadius && !branding?.borderRadius && !style.borderRadius ? 'rounded-md' : ''}`}
          style={inlineStyle}
        >
          {iconPos === 'left' && iconEl}
          <ContentEditable
            html={block.text}
            onChange={(text) => onChange({ text })}
            className="focus:outline-none"
            placeholder="Button text..."
            tagName="span"
          />
          {iconPos === 'right' && iconEl}
        </div>
      </div>
    </div>
  );
}
