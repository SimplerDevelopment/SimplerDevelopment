'use client';

// Top-level dispatcher for block-specific settings panels.
// Renders General/Style/Elements tabs; the General tab routes to category
// panels under ./block-settings/panels which house the per-block UIs.

import { Block } from '@/types/blocks';
import { Breakpoint } from '@/types/responsive';
import { useState } from 'react';
import { StyleSettings } from './StyleSettings';
import { LayoutPanel } from './block-settings/panels/LayoutPanel';
import { ContentPanel } from './block-settings/panels/ContentPanel';
import { FormPanel } from './block-settings/panels/FormPanel';
import { MediaPanel } from './block-settings/panels/MediaPanel';
import { DynamicPanel } from './block-settings/panels/DynamicPanel';
import { SectionsPanel } from './block-settings/panels/SectionsPanel';
import { ELEMENT_DEFINITIONS } from './block-settings/element-definitions';

interface BlockSettingsProps {
  block: Block;
  onChange: (updates: Partial<Block>, options?: { batch?: boolean }) => void;
  currentViewport: Breakpoint;
}

type SettingsTab = 'general' | 'style' | 'elements';

const SLUG_TO_CATEGORY: Record<string, 'LayoutPanel' | 'ContentPanel' | 'FormPanel' | 'MediaPanel' | 'DynamicPanel' | 'SectionsPanel'> = {
  'section': 'LayoutPanel',
  'divider': 'LayoutPanel',
  'spacer': 'LayoutPanel',
  'columns': 'LayoutPanel',
  'sticky-scroll-tabs': 'LayoutPanel',
  'text': 'ContentPanel',
  'heading': 'ContentPanel',
  'quote': 'ContentPanel',
  'code': 'ContentPanel',
  'html-render': 'ContentPanel',
  'button': 'FormPanel',
  'survey': 'FormPanel',
  'survey-results': 'FormPanel',
  'booking': 'FormPanel',
  'survey-input': 'FormPanel',
  'email-header': 'FormPanel',
  'email-footer': 'FormPanel',
  'booking-menu': 'FormPanel',
  'image': 'MediaPanel',
  'gallery': 'MediaPanel',
  'video': 'MediaPanel',
  'youtube': 'MediaPanel',
  'marquee': 'MediaPanel',
  'html-embed': 'MediaPanel',
  'blog-posts': 'DynamicPanel',
  'card-grid': 'DynamicPanel',
  'featured-content': 'DynamicPanel',
  'product-grid': 'DynamicPanel',
  'featured-products': 'DynamicPanel',
  'product-categories': 'DynamicPanel',
  'shopping-cart': 'DynamicPanel',
  'product-detail': 'DynamicPanel',
  'store-banner': 'DynamicPanel',
  'accordion': 'DynamicPanel',
  'tabs': 'DynamicPanel',
  'hero': 'SectionsPanel',
  'hero-slideshow': 'SectionsPanel',
  'cta': 'SectionsPanel',
  'services-grid': 'SectionsPanel',
  'stats': 'SectionsPanel',
  'testimonial': 'SectionsPanel',
  'social-links': 'SectionsPanel',
  'logo-strip': 'SectionsPanel',
  'metric-cards': 'SectionsPanel',
  'flip-card-grid': 'SectionsPanel',
  'timeline': 'SectionsPanel',
  'team-showcase': 'SectionsPanel',
  'team-flip-grid': 'SectionsPanel',
  'bento-grid': 'SectionsPanel',
  'site-footer': 'SectionsPanel',
};


export function BlockSettings({ block, onChange, currentViewport }: BlockSettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const hasElements = !!ELEMENT_DEFINITIONS[block.type]?.length;

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab('general')}
          className={`px-4 py-2 text-sm font-medium transition-colors relative ${
            activeTab === 'general'
              ? 'text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          General
          {activeTab === 'general' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('style')}
          className={`px-4 py-2 text-sm font-medium transition-colors relative ${
            activeTab === 'style'
              ? 'text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Style
          {activeTab === 'style' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
        {hasElements && (
          <button
            type="button"
            onClick={() => setActiveTab('elements')}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              activeTab === 'elements'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Elements
            {activeTab === 'elements' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>
        )}
      </div>

      {/* Tab Content */}
      <div className="pt-2">
        {activeTab === 'general' ? (
          <GeneralSettings block={block} onChange={onChange} currentViewport={currentViewport} />
        ) : activeTab === 'style' ? (
          <StyleSettings block={block} onChange={(updates) => onChange(updates, { batch: true })} currentViewport={currentViewport} />
        ) : activeTab === 'elements' ? (
          <ElementsPanel block={block} onChange={onChange} currentViewport={currentViewport} />
        ) : null}
      </div>
    </div>
  );
}

function ElementStyleSettings({ block, onChange, currentViewport, elementKey }: BlockSettingsProps & { elementKey: string }) {
  const elementBlock = {
    ...block,
    style: (block.elementStyles?.[elementKey] || {}) as Block['style'],
  };

  const handleElementChange = (updates: Partial<Block>) => {
    if (updates.style) {
      onChange({
        elementStyles: {
          ...(block.elementStyles || {}),
          [elementKey]: {
            ...(block.elementStyles?.[elementKey] || {}),
            ...updates.style,
          },
        },
      } as Partial<Block>, { batch: true });
    }
  };

  return <StyleSettings block={elementBlock} onChange={handleElementChange} currentViewport={currentViewport} />;
}

function ElementsPanel({ block, onChange, currentViewport }: BlockSettingsProps) {
  const elements = ELEMENT_DEFINITIONS[block.type];
  const [selectedElement, setSelectedElement] = useState(elements?.[0]?.key || '');

  if (!elements || elements.length === 0) return null;

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Element</label>
        <select
          value={selectedElement}
          onChange={(e) => setSelectedElement(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
        >
          {elements.map(el => (
            <option key={el.key} value={el.key}>{el.label}</option>
          ))}
        </select>
      </div>

      {selectedElement && (
        <ElementStyleSettings
          block={block}
          onChange={onChange}
          currentViewport={currentViewport}
          elementKey={selectedElement}
        />
      )}
    </div>
  );
}

function GeneralSettings({ block, onChange, currentViewport }: BlockSettingsProps) {
  const cat = SLUG_TO_CATEGORY[block.type];
  let panel: React.ReactNode;
  switch (cat) {
    case 'LayoutPanel':
      panel = <LayoutPanel block={block} onChange={onChange} currentViewport={currentViewport} />;
      break;
    case 'ContentPanel':
      panel = <ContentPanel block={block} onChange={onChange} currentViewport={currentViewport} />;
      break;
    case 'FormPanel':
      panel = <FormPanel block={block} onChange={onChange} currentViewport={currentViewport} />;
      break;
    case 'MediaPanel':
      panel = <MediaPanel block={block} onChange={onChange} currentViewport={currentViewport} />;
      break;
    case 'DynamicPanel':
      panel = <DynamicPanel block={block} onChange={onChange} currentViewport={currentViewport} />;
      break;
    case 'SectionsPanel':
      panel = <SectionsPanel block={block} onChange={onChange} currentViewport={currentViewport} />;
      break;
    default:
      panel = <div className="text-sm text-muted-foreground">No settings available for this block.</div>;
  }
  return (
    <div className="space-y-4">
      <div>{panel}</div>
    </div>
  );
}
