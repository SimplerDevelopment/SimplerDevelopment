'use client';

import { useState } from 'react';
import { Block } from '@/types/blocks';
import { getBlockIcon } from '@/lib/utils/blockIcons';

interface LayersPanelProps {
  blocks: Block[];
  selectedBlockId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  hoveredBlockId: string | null;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

function getBlockLabel(block: Block): string {
  switch (block.type) {
    case 'text':
      return block.content?.replace(/<[^>]*>/g, '').slice(0, 30) || 'Text';
    case 'heading':
      return block.content?.slice(0, 30) || `Heading ${block.level}`;
    case 'image':
      return block.alt || 'Image';
    case 'button':
      return block.text || 'Button';
    case 'hero':
      return block.title || 'Hero';
    case 'hero-slideshow':
      return `Hero Slideshow (${(block as { slides?: unknown[] }).slides?.length || 0})`;
    case 'marquee':
      return `Marquee (${(block as { items?: unknown[] }).items?.length || 0})`;
    case 'section':
      return `Section (${block.blocks?.length || 0})`;
    case 'columns':
      return `Columns (${block.columns?.length || 0})`;
    case 'tabs':
      return `Tabs (${block.tabs?.length || 0})`;
    case 'accordion':
      return block.title || 'Accordion';
    case 'gallery':
      return `Gallery (${block.images?.length || 0})`;
    case 'services-grid':
      return block.title || 'Services Grid';
    case 'cta':
      return block.title || 'CTA';
    case 'card-grid':
      return block.title || 'Card Grid';
    case 'stats':
      return block.title || 'Stats';
    case 'testimonial':
      return block.author || 'Testimonial';
    case 'featured-content':
      return block.title || 'Featured Content';
    case 'blog-posts':
      return block.title || 'Blog Posts';
    case 'quote':
      return block.content?.slice(0, 30) || 'Quote';
    case 'spacer':
      return `Spacer (${block.height})`;
    case 'divider':
      return 'Divider';
    case 'youtube':
      return block.caption || 'YouTube';
    case 'video':
      return block.caption || 'Video';
    case 'code':
      return `Code (${block.language || 'plain'})`;
    default:
      return (block as Block).type;
  }
}

function getNestedBlocks(block: Block): { label: string; blocks: Block[] }[] {
  if (block.type === 'columns' && block.columns) {
    return block.columns.map((col, i) => ({
      label: `Column ${i + 1} (${col.width}%)`,
      blocks: col.blocks || [],
    }));
  }
  if (block.type === 'tabs' && block.tabs) {
    return block.tabs.map((tab) => ({
      label: tab.label,
      blocks: tab.blocks || [],
    }));
  }
  if (block.type === 'section' && block.blocks) {
    return [{ label: 'Children', blocks: block.blocks }];
  }
  return [];
}

function LayerItem({
  block,
  depth,
  selectedBlockId,
  hoveredBlockId,
  onSelect,
  onHover,
}: {
  block: Block;
  depth: number;
  selectedBlockId: string | null;
  hoveredBlockId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const isSelected = selectedBlockId === block.id;
  const isHovered = hoveredBlockId === block.id;
  const nested = getNestedBlocks(block);
  const hasChildren = nested.some((n) => n.blocks.length > 0);
  const Icon = getBlockIcon(block.type);

  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(isSelected ? null : block.id)}
        onMouseEnter={() => onHover(block.id)}
        onMouseLeave={() => onHover(null)}
        className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-left text-xs transition-colors rounded-sm ${
          isSelected
            ? 'bg-primary/10 text-primary font-medium'
            : isHovered
            ? 'bg-accent/50 text-foreground'
            : 'text-muted-foreground hover:bg-accent/30 hover:text-foreground'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {/* Expand/collapse toggle for containers */}
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="flex-shrink-0 w-4 h-4 flex items-center justify-center"
          >
            <svg
              className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ) : (
          <span className="flex-shrink-0 w-4" />
        )}

        <Icon className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />

        <span className="truncate">{getBlockLabel(block)}</span>
      </button>

      {/* Nested children */}
      {expanded && hasChildren && (
        <div>
          {nested.map((group, gi) => (
            <div key={gi}>
              {nested.length > 1 && (
                <div
                  className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-medium"
                  style={{ paddingLeft: `${(depth + 1) * 16 + 8}px`, paddingTop: '2px', paddingBottom: '1px' }}
                >
                  {group.label}
                </div>
              )}
              {group.blocks.map((child) => (
                <LayerItem
                  key={child.id}
                  block={child}
                  depth={depth + (nested.length > 1 ? 2 : 1)}
                  selectedBlockId={selectedBlockId}
                  hoveredBlockId={hoveredBlockId}
                  onSelect={onSelect}
                  onHover={onHover}
                />
              ))}
              {group.blocks.length === 0 && (
                <div
                  className="text-[10px] text-muted-foreground/40 italic"
                  style={{ paddingLeft: `${(depth + (nested.length > 1 ? 2 : 1)) * 16 + 8}px`, paddingTop: '2px', paddingBottom: '2px' }}
                >
                  empty
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function LayersPanel({ blocks, selectedBlockId, onSelect, onHover, hoveredBlockId, collapsed, onCollapsedChange }: LayersPanelProps) {
  if (collapsed) {
    return (
      <div className="fixed left-0 top-[120px] z-10">
        <button
          type="button"
          onClick={() => onCollapsedChange(false)}
          className="bg-white dark:bg-gray-900 border border-border border-l-0 rounded-r-lg p-2 shadow-sm hover:bg-accent transition-colors"
          title="Show Layers"
        >
          <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="w-56 bg-white dark:bg-gray-900 border-r border-border fixed left-0 top-[120px] bottom-0 z-10 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
          <span className="text-xs font-semibold text-foreground">Layers</span>
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{blocks.length}</span>
        </div>
        <button
          type="button"
          onClick={() => onCollapsedChange(true)}
          className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-accent transition-colors"
          title="Collapse layers"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Layer Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {blocks.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">
            No blocks yet
          </div>
        ) : (
          blocks.map((block) => (
            <LayerItem
              key={block.id}
              block={block}
              depth={0}
              selectedBlockId={selectedBlockId}
              hoveredBlockId={hoveredBlockId}
              onSelect={onSelect}
              onHover={onHover}
            />
          ))
        )}
      </div>
    </div>
  );
}
