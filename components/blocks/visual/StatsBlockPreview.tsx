'use client';

import { StatsBlock } from '@/types/blocks';

interface StatsBlockPreviewProps {
  block: StatsBlock;
  isSelected: boolean;
  onChange: (updates: Partial<StatsBlock>) => void;
}

export function StatsBlockPreview({ block, isSelected, onChange }: StatsBlockPreviewProps) {
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
    <div className="py-16 my-8 px-6">
      <div className="container mx-auto">
        {(block.title || isSelected) && (
          <div className="text-center mb-12">
            <input
              type="text"
              value={block.title || ''}
              onChange={(e) => onChange({ title: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              className="text-3xl md:text-4xl font-bold w-full bg-transparent border-none focus:outline-none focus:border-b-2 border-primary text-center text-foreground"
              placeholder="Stats Title (optional)"
            />
          </div>
        )}

        <div className={`grid ${columnClasses[block.columns || 3]} gap-8`}>
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
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}

              <input
                type="text"
                value={stat.value}
                onChange={(e) => updateStat(stat.id, { value: e.target.value })}
                onClick={(e) => e.stopPropagation()}
                className="text-4xl md:text-5xl font-bold text-primary mb-2 w-full bg-transparent border-none focus:outline-none focus:border-b-2 border-primary text-center"
                placeholder="100+"
              />

              <input
                type="text"
                value={stat.label}
                onChange={(e) => updateStat(stat.id, { label: e.target.value })}
                onClick={(e) => e.stopPropagation()}
                className="text-lg text-muted-foreground w-full bg-transparent border-none focus:outline-none focus:border-b border-border text-center"
                placeholder="Label"
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
              <svg className="w-8 h-8 text-muted-foreground mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="text-sm text-muted-foreground">Add Stat</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
