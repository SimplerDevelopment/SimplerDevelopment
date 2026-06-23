'use client';

import { FeaturedContentBlock } from '@/types/blocks';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { getElementCSS } from '@/lib/utils/elementStyles';
import { RichTextEditable } from './RichTextEditable';
import { useBranding } from '@/contexts/BrandingContext';

interface FeaturedContentBlockPreviewProps {
  block: FeaturedContentBlock;
  isSelected: boolean;
  onChange: (updates: Partial<FeaturedContentBlock>) => void;
}

export function FeaturedContentBlockPreview({ block, isSelected, onChange }: FeaturedContentBlockPreviewProps) {
  // Mirror renderer's style guards so canvas reflects user-set typography overrides.
  const style = typeof block.style === 'object' ? block.style : {};
  const hasCustomFontSize = !!style.fontSize;
  const hasCustomFontWeight = !!style.fontWeight;
  const hasCustomColor = !!style.color;

  const branding = useBranding();
  const bs = branding?.buttonStyle;
  const btnRadius = bs?.borderRadius || branding?.borderRadius;

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
        block.responsive.visibility,
        block.responsive.fontSize,
      )
    : '';

  return (
    <section className={`py-16 px-6 ${responsiveClasses}`}>
      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-12 items-center ${
        block.imagePosition === 'right' ? '' : 'lg:grid-flow-dense'
      }`}>
        {/* Content Side */}
        <div className={block.imagePosition === 'right' ? 'lg:col-start-1' : 'lg:col-start-2'}>
          <RichTextEditable
            html={block.title}
            onChange={(html) => onChange({ title: html })}
            className={`${hasCustomFontSize ? '' : 'text-3xl md:text-4xl'} ${hasCustomFontWeight ? '' : 'font-bold'} mb-4 w-full bg-transparent border-none focus:outline-none focus:border-b-2 border-primary text-foreground`}
            placeholder="Featured Content Title"
            singleLine={true}
            toolbar={true}
            style={getElementCSS(block.elementStyles, 'title')}
          />

          {(block.description || isSelected) && (
            <RichTextEditable
              html={block.description || ''}
              onChange={(html) => onChange({ description: html || undefined })}
              className={`${hasCustomFontSize ? '' : 'text-lg'} text-muted-foreground mb-6 w-full bg-transparent border-none focus:outline-none focus:border border-border rounded resize-none`}
              placeholder="Description (optional)"
              singleLine={false}
              toolbar={true}
              style={getElementCSS(block.elementStyles, 'description')}
            />
          )}

          {/* Stats — read-only in preview because the settings panel doesn't yet expose
              a stats-array editor. They're set via JSON or AI today; flagged in the audit. */}
          {block.stats && block.stats.length > 0 && (
            <div className="grid grid-cols-2 gap-6 mb-6">
              {block.stats.map((stat) => (
                <div key={stat.id}>
                  <div
                    className={`${hasCustomFontSize ? '' : 'text-3xl'} ${hasCustomFontWeight ? '' : 'font-bold'} ${hasCustomColor ? '' : 'text-primary'} mb-1`}
                    style={getElementCSS(block.elementStyles, 'statValue')}
                  >
                    {stat.value}
                  </div>
                  <div className="text-sm text-muted-foreground" style={getElementCSS(block.elementStyles, 'statLabel')}>
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          )}

          {(block.buttonText || isSelected) && (
            <span
              className={`inline-flex items-center justify-center bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors ${!btnRadius ? 'rounded-md' : ''}`}
              style={{
                ...getElementCSS(block.elementStyles, 'button'),
                ...(bs?.primaryBg ? { backgroundColor: bs.primaryBg } : {}),
                ...(bs?.primaryText ? { color: bs.primaryText } : {}),
                ...(btnRadius ? { borderRadius: btnRadius } : {}),
              }}
            >
              {block.buttonText || 'Learn More'} →
            </span>
          )}
        </div>

        {/* Image Side */}
        <div className={block.imagePosition === 'right' ? 'lg:col-start-2' : 'lg:col-start-1'}>
          {block.imageUrl ? (
            <img
              src={block.imageUrl}
              alt={block.title}
              className={`w-full h-auto shadow-lg ${!branding?.borderRadius ? 'rounded-lg' : ''}`}
              style={branding?.borderRadius ? { borderRadius: branding.borderRadius } : undefined}
            />
          ) : (
            <div className="aspect-square bg-muted/30 rounded-lg flex items-center justify-center border-2 border-dashed border-border">
              <span className="material-icons text-7xl text-muted-foreground/20">image</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
