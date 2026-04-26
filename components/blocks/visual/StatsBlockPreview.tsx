'use client';

import { StatsBlock } from '@/types/blocks';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { getElementCSS } from '@/lib/utils/elementStyles';
import { RichTextEditable } from './RichTextEditable';

interface StatsBlockPreviewProps {
  block: StatsBlock;
  isSelected: boolean;
  onChange: (updates: Partial<StatsBlock>) => void;
}

export function StatsBlockPreview({ block, isSelected, onChange }: StatsBlockPreviewProps) {
  // Mirror renderer's style guards.
  const style = typeof block.style === 'object' ? block.style : {};
  const hasCustomFontSize = !!style.fontSize;
  const hasCustomFontWeight = !!style.fontWeight;
  const hasCustomColor = !!style.color;

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

  const addStat = () => {
    onChange({
      stats: [
        ...block.stats,
        {
          id: `stat-${Date.now()}`,
          value: '100+',
          label: 'New Stat',
        },
      ],
    });
  };

  const updateStat = (id: string, updates: Partial<typeof block.stats[0]>) => {
    onChange({
      stats: block.stats.map(s => (s.id === id ? { ...s, ...updates } : s)),
    });
  };

  const removeStat = (id: string) => {
    onChange({
      stats: block.stats.filter(s => s.id !== id),
    });
  };

  const columnClasses = {
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
  };

  return (
    <div className={`py-16 px-6 ${responsiveClasses}`}>
      {(block.title || isSelected) && (
        <div className="text-center mb-12">
          <RichTextEditable
            html={block.title || ''}
            onChange={(html) => onChange({ title: html })}
            className={`${hasCustomFontSize ? '' : 'text-3xl md:text-4xl'} ${hasCustomFontWeight ? '' : 'font-bold'} w-full bg-transparent border-none focus:outline-none focus:border-b-2 border-primary text-center text-foreground`}
            placeholder="Stats Title (optional)"
            singleLine={true}
            toolbar={true}
            style={getElementCSS(block.elementStyles, 'title')}
          />
        </div>
      )}

      <div className={`grid grid-cols-1 ${{
        2: 'md:grid-cols-2',
        3: 'md:grid-cols-2 lg:grid-cols-3',
        4: 'md:grid-cols-2 lg:grid-cols-4',
      }[block.columns || 3]} gap-8`}>
        {block.stats.map((stat) => (
          <div
            key={stat.id}
            className="text-center relative group"
          >
            {isSelected && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeStat(stat.id);
                }}
                className="absolute top-0 right-0 p-1 text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                title="Remove stat"
              >
                <span className="material-icons text-base">close</span>
              </button>
            )}

            <input
              type="text"
              value={stat.value}
              onChange={(e) => updateStat(stat.id, { value: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              className={`${hasCustomFontSize ? '' : 'text-4xl md:text-5xl'} ${hasCustomFontWeight ? '' : 'font-bold'} ${hasCustomColor ? '' : 'text-primary'} mb-2 w-full bg-transparent border-none focus:outline-none focus:border-b-2 border-primary text-center`}
              placeholder="100+"
              style={getElementCSS(block.elementStyles, 'statValue')}
            />

            <input
              type="text"
              value={stat.label}
              onChange={(e) => updateStat(stat.id, { label: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              className="text-lg text-muted-foreground w-full bg-transparent border-none focus:outline-none focus:border-b border-border text-center"
              placeholder="Label"
              style={getElementCSS(block.elementStyles, 'statLabel')}
            />
          </div>
        ))}

        {isSelected && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              addStat();
            }}
            className="p-6 border-2 border-dashed border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors flex flex-col items-center justify-center min-h-[120px]"
          >
            <span className="material-icons text-2xl text-muted-foreground mb-2">add</span>
            <span className="text-sm text-muted-foreground">Add Stat</span>
          </button>
        )}
      </div>
    </div>
  );
}

// Note on stat-counter animation: the production renderer (StatsBlockRender.tsx)
// does NOT animate stat values — it just renders the string as-is. So no
// preview/production divergence on animation. If a counter animation is ever
// added to the renderer, the preview should opt out (showing the resting value)
// to avoid distracting users while editing.
