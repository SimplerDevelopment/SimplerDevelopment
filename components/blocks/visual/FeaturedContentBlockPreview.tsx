'use client';

import { FeaturedContentBlock } from '@/types/blocks';
import { getElementCSS } from '@/lib/utils/elementStyles';
import { RichTextEditable } from './RichTextEditable';

interface FeaturedContentBlockPreviewProps {
  block: FeaturedContentBlock;
  isSelected: boolean;
  onChange: (updates: Partial<FeaturedContentBlock>) => void;
}

export function FeaturedContentBlockPreview({ block, isSelected, onChange }: FeaturedContentBlockPreviewProps) {
  return (
    <div className="p-6">
      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-8 items-center ${
        block.imagePosition === 'right' ? '' : 'lg:grid-flow-dense'
      }`}>
        {/* Content Side */}
        <div className={block.imagePosition === 'right' ? '' : 'lg:col-start-2'}>
          <RichTextEditable
            html={block.title}
            onChange={(html) => onChange({ title: html })}
            className="text-3xl font-bold mb-4 w-full bg-transparent border-none focus:outline-none focus:border-b-2 border-primary text-foreground"
            placeholder="Featured Content Title"
            singleLine={true}
            style={getElementCSS(block.elementStyles, 'title')}
          />

          {(block.description || isSelected) && (
            <RichTextEditable
              html={block.description || ''}
              onChange={(html) => onChange({ description: html })}
              className="text-lg text-muted-foreground mb-6 w-full bg-transparent border-none focus:outline-none focus:border border-border rounded resize-none"
              placeholder="Description (optional)"
              singleLine={false}
              style={getElementCSS(block.elementStyles, 'description')}
            />
          )}

          {/* Stats */}
          {block.stats && block.stats.length > 0 && (
            <div className="grid grid-cols-2 gap-6 mb-6">
              {block.stats.map((stat) => (
                <div key={stat.id} className="text-center">
                  <div className="text-2xl font-bold text-primary" style={getElementCSS(block.elementStyles, 'statValue')}>{stat.value}</div>
                  <div className="text-sm text-muted-foreground" style={getElementCSS(block.elementStyles, 'statLabel')}>{stat.label}</div>
                </div>
              ))}
            </div>
          )}

          {(block.buttonText || isSelected) && (
            <button
              type="button"
              className="px-6 py-3 bg-primary text-primary-foreground rounded-md font-medium"
              onClick={(e) => e.preventDefault()}
              style={getElementCSS(block.elementStyles, 'button')}
            >
              {block.buttonText || 'Learn More'}
            </button>
          )}
        </div>

        {/* Image Side */}
        <div className={`${block.imagePosition === 'right' ? '' : 'lg:col-start-1 lg:row-start-1'}`}>
          {block.imageUrl ? (
            <img
              src={block.imageUrl}
              alt={block.title}
              className="w-full h-auto rounded-lg"
            />
          ) : (
            <div className="aspect-square bg-muted/30 rounded-lg flex items-center justify-center border-2 border-dashed border-border">
              <span className="material-icons text-7xl text-muted-foreground/20">image</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
