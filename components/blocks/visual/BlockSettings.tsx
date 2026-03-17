'use client';

import { Block, TextBlock, HeadingBlock, ImageBlock, ButtonBlock, SpacerBlock, DividerBlock, QuoteBlock, CodeBlock, VideoBlock, YoutubeBlock, ColumnsBlock, HeroBlock, ServicesGridBlock, CtaBlock, TestimonialBlock, StatsBlock, BlogPostsBlock, CardGridBlock, FeaturedContentBlock, AccordionBlock, SectionBlock, GalleryBlock } from '@/types/blocks';
import { PageSettingsPanel } from './PageSettingsPanel';
import { Breakpoint } from '@/types/responsive';
import { useState } from 'react';
import MediaPicker from '@/components/admin/MediaPicker';
import { StyleSettings } from './StyleSettings';

interface BlockSettingsProps {
  block: Block;
  onChange: (updates: Partial<Block>) => void;
  currentViewport: Breakpoint;
}

type SettingsTab = 'general' | 'style';

export function BlockSettings({ block, onChange, currentViewport }: BlockSettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

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
      </div>

      {/* Tab Content */}
      <div className="pt-2">
        {activeTab === 'general' ? (
          <GeneralSettings block={block} onChange={onChange} currentViewport={currentViewport} />
        ) : (
          <StyleSettings block={block} onChange={onChange} currentViewport={currentViewport} />
        )}
      </div>
    </div>
  );
}

function GeneralSettings({ block, onChange, currentViewport }: BlockSettingsProps) {
  return (
    <div className="space-y-4">
      {/* Block-specific settings */}
      <div>
        {(() => {
          switch (block.type) {
            case 'text':
              return <TextBlockSettings block={block as TextBlock} onChange={onChange} currentViewport={currentViewport} />;
            case 'heading':
              return <HeadingBlockSettings block={block as HeadingBlock} onChange={onChange} currentViewport={currentViewport} />;
            case 'image':
              return <ImageBlockSettings block={block as ImageBlock} onChange={onChange} currentViewport={currentViewport} />;
            case 'button':
              return <ButtonBlockSettings block={block as ButtonBlock} onChange={onChange} currentViewport={currentViewport} />;
            case 'spacer':
              return <SpacerBlockSettings block={block as SpacerBlock} onChange={onChange} currentViewport={currentViewport} />;
            case 'divider':
              return <DividerBlockSettings block={block as DividerBlock} onChange={onChange} currentViewport={currentViewport} />;
            case 'quote':
              return <QuoteBlockSettings block={block as QuoteBlock} onChange={onChange} currentViewport={currentViewport} />;
            case 'code':
              return <CodeBlockSettings block={block as CodeBlock} onChange={onChange} currentViewport={currentViewport} />;
            case 'video':
              return <VideoBlockSettings block={block as VideoBlock} onChange={onChange} currentViewport={currentViewport} />;
            case 'youtube':
              return <YoutubeBlockSettings block={block as YoutubeBlock} onChange={onChange} currentViewport={currentViewport} />;
            case 'columns':
              return <ColumnsBlockSettings block={block as ColumnsBlock} onChange={onChange} currentViewport={currentViewport} />;
            case 'hero':
              return <HeroBlockSettings block={block as HeroBlock} onChange={onChange} currentViewport={currentViewport} />;
            case 'services-grid':
              return <ServicesGridBlockSettings block={block as ServicesGridBlock} onChange={onChange} currentViewport={currentViewport} />;
            case 'cta':
              return <CtaBlockSettings block={block as CtaBlock} onChange={onChange} currentViewport={currentViewport} />;
            case 'testimonial':
              return <TestimonialBlockSettings block={block as TestimonialBlock} onChange={onChange} currentViewport={currentViewport} />;
            case 'stats':
              return <StatsBlockSettings block={block as StatsBlock} onChange={onChange} currentViewport={currentViewport} />;
            case 'blog-posts':
              return <BlogPostsBlockSettings block={block as BlogPostsBlock} onChange={onChange} currentViewport={currentViewport} />;
            case 'card-grid':
              return <CardGridBlockSettings block={block as CardGridBlock} onChange={onChange} currentViewport={currentViewport} />;
            case 'featured-content':
              return <FeaturedContentBlockSettings block={block as FeaturedContentBlock} onChange={onChange} currentViewport={currentViewport} />;
            case 'accordion':
              return <AccordionBlockSettings block={block as AccordionBlock} onChange={onChange} currentViewport={currentViewport} />;
            case 'section':
              return <SectionBlockSettings block={block as SectionBlock} onChange={onChange} />;
            case 'gallery':
              return <GalleryBlockSettings block={block as GalleryBlock} onChange={onChange} />;
            default:
              return <div className="text-sm text-muted-foreground">No settings available for this block.</div>;
          }
        })()}
      </div>
    </div>
  );
}

function TextBlockSettings({ block, onChange, currentViewport }: { block: TextBlock; onChange: (updates: Partial<TextBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Text Size</label>
        <select
          value={block.size || 'base'}
          onChange={(e) => onChange({ size: e.target.value as TextBlock['size'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="sm">Small</option>
          <option value="base">Base</option>
          <option value="lg">Large</option>
          <option value="xl">Extra Large</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Alignment</label>
        <div className="flex gap-2">
          {(['left', 'center', 'right'] as const).map((align) => (
            <button
              key={align}
              type="button"
              onClick={() => onChange({ alignment: align })}
              className={`flex-1 px-3 py-2 text-sm rounded ${
                (block.alignment || 'left') === align
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background border border-border text-foreground hover:bg-accent'
              }`}
            >
              {align === 'left' && '⬅️ Left'}
              {align === 'center' && '↔️ Center'}
              {align === 'right' && '➡️ Right'}
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}

function HeadingBlockSettings({ block, onChange, currentViewport }: { block: HeadingBlock; onChange: (updates: Partial<HeadingBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Heading Level</label>
        <select
          value={block.level}
          onChange={(e) => onChange({ level: parseInt(e.target.value) as HeadingBlock['level'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="1">H1</option>
          <option value="2">H2</option>
          <option value="3">H3</option>
          <option value="4">H4</option>
          <option value="5">H5</option>
          <option value="6">H6</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Alignment</label>
        <div className="flex gap-2">
          {(['left', 'center', 'right'] as const).map((align) => (
            <button
              key={align}
              type="button"
              onClick={() => onChange({ alignment: align })}
              className={`flex-1 px-3 py-2 text-sm rounded ${
                (block.alignment || 'left') === align
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background border border-border text-foreground hover:bg-accent'
              }`}
            >
              {align === 'left' && '⬅️'}
              {align === 'center' && '↔️'}
              {align === 'right' && '➡️'}
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}

function ImageBlockSettings({ block, onChange, currentViewport }: { block: ImageBlock; onChange: (updates: Partial<ImageBlock>) => void; currentViewport: Breakpoint }) {
  const [showMediaPicker, setShowMediaPicker] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Image</label>
        {block.url ? (
          <div className="space-y-2">
            <img
              src={block.url}
              alt={block.alt}
              className="w-full h-32 object-cover rounded border border-border"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowMediaPicker(true)}
                className="flex-1 px-3 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
              >
                Change Image
              </button>
              <button
                type="button"
                onClick={() => onChange({ url: '' })}
                className="px-3 py-2 text-sm bg-background border border-border text-foreground rounded hover:bg-accent"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowMediaPicker(true)}
            className="w-full p-8 border-2 border-dashed border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors text-center"
          >
            <div className="text-4xl mb-2">🖼️</div>
            <p className="text-sm text-muted-foreground">Click to select image</p>
          </button>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Alt Text</label>
        <input
          type="text"
          value={block.alt}
          onChange={(e) => onChange({ alt: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Describe the image..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Caption (optional)</label>
        <input
          type="text"
          value={block.caption || ''}
          onChange={(e) => onChange({ caption: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Image caption..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Width</label>
        <select
          value={block.width || 'full'}
          onChange={(e) => onChange({ width: e.target.value as ImageBlock['width'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
          <option value="full">Full Width</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Alignment</label>
        <select
          value={block.alignment || 'center'}
          onChange={(e) => onChange({ alignment: e.target.value as ImageBlock['alignment'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </div>


      {showMediaPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]" onClick={() => setShowMediaPicker(false)}>
          <div className="bg-white dark:bg-gray-900 border border-border rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <MediaPicker
              value={block.url}
              onChange={(url) => {
                onChange({ url });
                setShowMediaPicker(false);
              }}
              label="Select Image"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ButtonBlockSettings({ block, onChange, currentViewport }: { block: ButtonBlock; onChange: (updates: Partial<ButtonBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Button Text</label>
        <input
          type="text"
          value={block.text}
          onChange={(e) => onChange({ text: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Click me"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Link URL</label>
        <input
          type="text"
          value={block.url}
          onChange={(e) => onChange({ url: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="https://..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Variant</label>
        <select
          value={block.variant || 'primary'}
          onChange={(e) => onChange({ variant: e.target.value as ButtonBlock['variant'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="primary">Primary</option>
          <option value="secondary">Secondary</option>
          <option value="outline">Outline</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Size</label>
        <select
          value={block.size || 'md'}
          onChange={(e) => onChange({ size: e.target.value as ButtonBlock['size'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="sm">Small</option>
          <option value="md">Medium</option>
          <option value="lg">Large</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Alignment</label>
        <div className="flex gap-2">
          {(['left', 'center', 'right'] as const).map((align) => (
            <button
              key={align}
              type="button"
              onClick={() => onChange({ alignment: align })}
              className={`flex-1 px-3 py-2 text-sm rounded ${
                (block.alignment || 'left') === align
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background border border-border text-foreground hover:bg-accent'
              }`}
            >
              {align === 'left' && '⬅️'}
              {align === 'center' && '↔️'}
              {align === 'right' && '➡️'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center">
        <input
          type="checkbox"
          id="openInNewTab"
          checked={block.openInNewTab || false}
          onChange={(e) => onChange({ openInNewTab: e.target.checked })}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
        />
        <label htmlFor="openInNewTab" className="ml-2 text-sm text-foreground">
          Open in new tab
        </label>
      </div>

    </div>
  );
}

function SpacerBlockSettings({ block, onChange, currentViewport }: { block: SpacerBlock; onChange: (updates: Partial<SpacerBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Height</label>
        <select
          value={block.height}
          onChange={(e) => onChange({ height: e.target.value as SpacerBlock['height'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="sm">Small (1rem)</option>
          <option value="md">Medium (2rem)</option>
          <option value="lg">Large (4rem)</option>
          <option value="xl">Extra Large (6rem)</option>
        </select>
      </div>
    </div>
  );
}

function DividerBlockSettings({ block, onChange, currentViewport }: { block: DividerBlock; onChange: (updates: Partial<DividerBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Line Style</label>
        <select
          value={block.lineStyle || 'solid'}
          onChange={(e) => onChange({ lineStyle: e.target.value as DividerBlock['lineStyle'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
        </select>
      </div>
    </div>
  );
}

function QuoteBlockSettings({ block, onChange, currentViewport }: { block: QuoteBlock; onChange: (updates: Partial<QuoteBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Author</label>
        <input
          type="text"
          value={block.author || ''}
          onChange={(e) => onChange({ author: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Author name..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Citation</label>
        <input
          type="text"
          value={block.citation || ''}
          onChange={(e) => onChange({ citation: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Source or citation..."
        />
      </div>

    </div>
  );
}

function CodeBlockSettings({ block, onChange, currentViewport }: { block: CodeBlock; onChange: (updates: Partial<CodeBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Language</label>
        <select
          value={block.language || 'javascript'}
          onChange={(e) => onChange({ language: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="javascript">JavaScript</option>
          <option value="typescript">TypeScript</option>
          <option value="python">Python</option>
          <option value="html">HTML</option>
          <option value="css">CSS</option>
          <option value="json">JSON</option>
          <option value="bash">Bash</option>
        </select>
      </div>
    </div>
  );
}

function VideoBlockSettings({ block, onChange, currentViewport }: { block: VideoBlock; onChange: (updates: Partial<VideoBlock>) => void; currentViewport: Breakpoint }) {
  const [showMediaPicker, setShowMediaPicker] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Video File</label>
        {block.url ? (
          <div className="space-y-2">
            <div className="w-full aspect-video bg-black rounded border border-border overflow-hidden">
              <video
                src={block.url}
                controls
                className="w-full h-full"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowMediaPicker(true)}
                className="flex-1 px-3 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
              >
                Change Video
              </button>
              <button
                type="button"
                onClick={() => onChange({ url: '' })}
                className="px-3 py-2 text-sm bg-background border border-border text-foreground rounded hover:bg-accent"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowMediaPicker(true)}
            className="w-full p-8 border-2 border-dashed border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors text-center"
          >
            <div className="text-4xl mb-2">🎬</div>
            <p className="text-sm text-muted-foreground">Click to select video file</p>
          </button>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Caption (optional)</label>
        <input
          type="text"
          value={block.caption || ''}
          onChange={(e) => onChange({ caption: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Video caption..."
        />
      </div>

      <div className="flex items-center">
        <input
          type="checkbox"
          id="autoplay"
          checked={block.autoplay || false}
          onChange={(e) => onChange({ autoplay: e.target.checked })}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
        />
        <label htmlFor="autoplay" className="ml-2 text-sm text-foreground">
          Autoplay
        </label>
      </div>

      <div className="flex items-center">
        <input
          type="checkbox"
          id="controls"
          checked={block.controls !== false}
          onChange={(e) => onChange({ controls: e.target.checked })}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
        />
        <label htmlFor="controls" className="ml-2 text-sm text-foreground">
          Show Controls
        </label>
      </div>

      {showMediaPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]" onClick={() => setShowMediaPicker(false)}>
          <div className="bg-white dark:bg-gray-900 border border-border rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <MediaPicker
              value={block.url}
              onChange={(url) => {
                onChange({ url });
                setShowMediaPicker(false);
              }}
              label="Select Video"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function YoutubeBlockSettings({ block, onChange, currentViewport }: { block: YoutubeBlock; onChange: (updates: Partial<YoutubeBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">YouTube URL</label>
        <input
          type="text"
          value={block.url}
          onChange={(e) => onChange({ url: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="https://www.youtube.com/watch?v=..."
        />
        <p className="text-xs text-muted-foreground mt-1">Paste a YouTube video URL or video ID</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Caption (optional)</label>
        <input
          type="text"
          value={block.caption || ''}
          onChange={(e) => onChange({ caption: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Video caption..."
        />
      </div>
    </div>
  );
}

function ColumnsBlockSettings({ block, onChange, currentViewport }: { block: ColumnsBlock; onChange: (updates: Partial<ColumnsBlock>) => void; currentViewport: Breakpoint }) {
  const [expandedColumnId, setExpandedColumnId] = useState<string | null>(null);

  const updateColumn = (columnId: string, updates: Partial<typeof block.columns[0]>) => {
    onChange({
      columns: block.columns.map(col =>
        col.id === columnId ? { ...col, ...updates } : col
      ),
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Layout</label>
        <p className="text-sm text-muted-foreground mb-2">{block.columns.length} columns</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Gap Between Columns</label>
        <select
          value={block.gap || 'md'}
          onChange={(e) => onChange({ gap: e.target.value as ColumnsBlock['gap'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="sm">Small</option>
          <option value="md">Medium</option>
          <option value="lg">Large</option>
        </select>
      </div>

      {/* Per-Column Settings */}
      <div className="border-t border-border pt-4">
        <label className="block text-sm font-medium text-foreground mb-3">Column Settings</label>
        <div className="space-y-2">
          {block.columns.map((column, index) => (
            <div key={column.id} className="border border-border rounded-md overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedColumnId(expandedColumnId === column.id ? null : column.id)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-accent transition-colors"
              >
                <span className="font-medium">Column {index + 1} ({Math.round(column.width)}%)</span>
                <svg
                  className={`w-4 h-4 text-muted-foreground transition-transform ${expandedColumnId === column.id ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedColumnId === column.id && (
                <div className="px-3 pb-3 space-y-3 border-t border-border">
                  <div className="pt-3">
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Width (%)</label>
                    <input
                      type="number"
                      min={5}
                      max={95}
                      value={Math.round(column.width)}
                      onChange={(e) => updateColumn(column.id, { width: Math.max(5, Math.min(95, parseInt(e.target.value) || 5)) })}
                      className="w-full text-sm rounded border border-border bg-background px-2 py-1 text-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Background</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={column.backgroundColor || '#ffffff'}
                        onChange={(e) => updateColumn(column.id, { backgroundColor: e.target.value })}
                        className="w-8 h-8 rounded border border-border cursor-pointer"
                      />
                      <input
                        type="text"
                        value={column.backgroundColor || ''}
                        onChange={(e) => updateColumn(column.id, { backgroundColor: e.target.value || undefined })}
                        placeholder="transparent"
                        className="flex-1 text-sm rounded border border-border bg-background px-2 py-1 text-foreground"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Padding</label>
                      <select
                        value={column.padding || 'none'}
                        onChange={(e) => updateColumn(column.id, { padding: e.target.value as any })}
                        className="w-full text-sm rounded border border-border bg-background px-2 py-1 text-foreground"
                      >
                        <option value="none">None</option>
                        <option value="sm">Small</option>
                        <option value="md">Medium</option>
                        <option value="lg">Large</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">V. Align</label>
                      <select
                        value={column.verticalAlign || 'top'}
                        onChange={(e) => updateColumn(column.id, { verticalAlign: e.target.value as any })}
                        className="w-full text-sm rounded border border-border bg-background px-2 py-1 text-foreground"
                      >
                        <option value="top">Top</option>
                        <option value="center">Center</option>
                        <option value="bottom">Bottom</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">CSS Class</label>
                    <input
                      type="text"
                      value={column.cssClass || ''}
                      onChange={(e) => updateColumn(column.id, { cssClass: e.target.value || undefined })}
                      placeholder="e.g., rounded-lg shadow-sm"
                      className="w-full text-sm rounded border border-border bg-background px-2 py-1 text-foreground"
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Responsive Stacking */}
      <div className="border-t border-border pt-4">
        <label className="block text-sm font-medium text-foreground mb-3">Responsive Stacking</label>
        <div className="space-y-3">
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={block.stackOnMobile !== false}
              onChange={(e) => onChange({ stackOnMobile: e.target.checked })}
              className="rounded border-border mt-0.5"
            />
            <div>
              <div className="font-medium">Stack on Mobile</div>
              <div className="text-xs text-muted-foreground">Columns display vertically on screens &le; 767px</div>
            </div>
          </label>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={block.stackOnTablet === true}
              onChange={(e) => onChange({ stackOnTablet: e.target.checked })}
              className="rounded border-border mt-0.5"
            />
            <div>
              <div className="font-medium">Stack on Tablet</div>
              <div className="text-xs text-muted-foreground">Columns display vertically on screens 768px - 1023px</div>
            </div>
          </label>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={block.reverseOnStack === true}
              onChange={(e) => onChange({ reverseOnStack: e.target.checked })}
              className="rounded border-border mt-0.5"
            />
            <div>
              <div className="font-medium">Reverse on Stack</div>
              <div className="text-xs text-muted-foreground">Show last column first when stacked vertically</div>
            </div>
          </label>
        </div>
      </div>

    </div>
  );
}

function HeroBlockSettings({ block, onChange, currentViewport }: { block: HeroBlock; onChange: (updates: Partial<HeroBlock>) => void; currentViewport: Breakpoint }) {
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [showVideoPicker, setShowVideoPicker] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Background Image (optional)</label>
        {block.backgroundImage ? (
          <div className="space-y-2">
            <img
              src={block.backgroundImage}
              alt="Background"
              className="w-full h-32 object-cover rounded border border-border"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowImagePicker(true)}
                className="flex-1 px-3 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
              >
                Change Image
              </button>
              <button
                type="button"
                onClick={() => onChange({ backgroundImage: '' })}
                className="px-3 py-2 text-sm bg-background border border-border text-foreground rounded hover:bg-accent"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowImagePicker(true)}
            className="w-full p-6 border-2 border-dashed border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors text-center"
          >
            <div className="text-3xl mb-1">🖼️</div>
            <p className="text-sm text-muted-foreground">Click to select background image</p>
          </button>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Background Video (optional)</label>
        {block.backgroundVideo ? (
          <div className="space-y-2">
            <div className="w-full aspect-video bg-black rounded border border-border overflow-hidden">
              <video
                src={block.backgroundVideo}
                controls
                className="w-full h-full"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowVideoPicker(true)}
                className="flex-1 px-3 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
              >
                Change Video
              </button>
              <button
                type="button"
                onClick={() => onChange({ backgroundVideo: '' })}
                className="px-3 py-2 text-sm bg-background border border-border text-foreground rounded hover:bg-accent"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowVideoPicker(true)}
            className="w-full p-6 border-2 border-dashed border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors text-center"
          >
            <div className="text-3xl mb-1">🎬</div>
            <p className="text-sm text-muted-foreground">Click to select background video</p>
          </button>
        )}
      </div>

      <div className="space-y-3 pt-3 border-t border-border">
        <h4 className="text-sm font-semibold text-foreground">Primary CTA</h4>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Button Text</label>
          <input
            type="text"
            value={block.ctaText || ''}
            onChange={(e) => onChange({ ctaText: e.target.value })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
            placeholder="Get Started"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Button URL</label>
          <input
            type="text"
            value={block.ctaLink || ''}
            onChange={(e) => onChange({ ctaLink: e.target.value })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
            placeholder="/contact"
          />
        </div>
      </div>

      <div className="space-y-3 pt-3 border-t border-border">
        <h4 className="text-sm font-semibold text-foreground">Secondary CTA (optional)</h4>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Button Text</label>
          <input
            type="text"
            value={block.secondaryCtaText || ''}
            onChange={(e) => onChange({ secondaryCtaText: e.target.value })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
            placeholder="Learn More"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Button URL</label>
          <input
            type="text"
            value={block.secondaryCtaLink || ''}
            onChange={(e) => onChange({ secondaryCtaLink: e.target.value })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
            placeholder="/about"
          />
        </div>
      </div>

      {showImagePicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]" onClick={() => setShowImagePicker(false)}>
          <div className="bg-white dark:bg-gray-900 border border-border rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <MediaPicker
              value={block.backgroundImage || ''}
              onChange={(url) => {
                onChange({ backgroundImage: url });
                setShowImagePicker(false);
              }}
              label="Select Background Image"
            />
          </div>
        </div>
      )}

      {showVideoPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]" onClick={() => setShowVideoPicker(false)}>
          <div className="bg-white dark:bg-gray-900 border border-border rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <MediaPicker
              value={block.backgroundVideo || ''}
              onChange={(url) => {
                onChange({ backgroundVideo: url });
                setShowVideoPicker(false);
              }}
              label="Select Background Video"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function CtaBlockSettings({ block, onChange, currentViewport }: { block: CtaBlock; onChange: (updates: Partial<CtaBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Background Style</label>
        <select
          value={block.backgroundStyle || 'gradient'}
          onChange={(e) => onChange({ backgroundStyle: e.target.value as CtaBlock['backgroundStyle'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="gradient">Gradient</option>
          <option value="solid">Solid</option>
          <option value="none">None</option>
        </select>
      </div>

      <div className="space-y-3 pt-3 border-t border-border">
        <h4 className="text-sm font-semibold text-foreground">Primary Button</h4>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Button Text</label>
          <input
            type="text"
            value={block.primaryButtonText}
            onChange={(e) => onChange({ primaryButtonText: e.target.value })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Button URL</label>
          <input
            type="text"
            value={block.primaryButtonUrl}
            onChange={(e) => onChange({ primaryButtonUrl: e.target.value })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          />
        </div>
      </div>

      <div className="space-y-3 pt-3 border-t border-border">
        <h4 className="text-sm font-semibold text-foreground">Secondary Button (optional)</h4>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Button Text</label>
          <input
            type="text"
            value={block.secondaryButtonText || ''}
            onChange={(e) => onChange({ secondaryButtonText: e.target.value })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
            placeholder="Optional"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Button URL</label>
          <input
            type="text"
            value={block.secondaryButtonUrl || ''}
            onChange={(e) => onChange({ secondaryButtonUrl: e.target.value })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
            placeholder="Optional"
          />
        </div>
      </div>
    </div>
  );
}

function ServicesGridBlockSettings({ block, onChange, currentViewport }: { block: ServicesGridBlock; onChange: (updates: Partial<ServicesGridBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Number of Columns</label>
        <select
          value={block.columns || 3}
          onChange={(e) => onChange({ columns: parseInt(e.target.value) as ServicesGridBlock['columns'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="2">2 Columns</option>
          <option value="3">3 Columns</option>
          <option value="4">4 Columns</option>
        </select>
      </div>
    </div>
  );
}

function StatsBlockSettings({ block, onChange, currentViewport }: { block: StatsBlock; onChange: (updates: Partial<StatsBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Number of Columns</label>
        <select
          value={block.columns || 3}
          onChange={(e) => onChange({ columns: parseInt(e.target.value) as StatsBlock['columns'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="2">2 Columns</option>
          <option value="3">3 Columns</option>
          <option value="4">4 Columns</option>
        </select>
      </div>
    </div>
  );
}

function CardGridBlockSettings({ block, onChange, currentViewport }: { block: CardGridBlock; onChange: (updates: Partial<CardGridBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Number of Columns</label>
        <select
          value={block.columns || 3}
          onChange={(e) => onChange({ columns: parseInt(e.target.value) as CardGridBlock['columns'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="2">2 Columns</option>
          <option value="3">3 Columns</option>
          <option value="4">4 Columns</option>
        </select>
      </div>
    </div>
  );
}

function TestimonialBlockSettings({ block, onChange, currentViewport }: { block: TestimonialBlock; onChange: (updates: Partial<TestimonialBlock>) => void; currentViewport: Breakpoint }) {
  const [showMediaPicker, setShowMediaPicker] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Avatar (optional)</label>
        {block.avatar ? (
          <div className="space-y-2">
            <img
              src={block.avatar}
              alt="Avatar"
              className="w-20 h-20 rounded-full object-cover border border-border"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowMediaPicker(true)}
                className="flex-1 px-3 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
              >
                Change Avatar
              </button>
              <button
                type="button"
                onClick={() => onChange({ avatar: '' })}
                className="px-3 py-2 text-sm bg-background border border-border text-foreground rounded hover:bg-accent"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowMediaPicker(true)}
            className="w-full p-8 border-2 border-dashed border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors text-center"
          >
            <div className="text-4xl mb-2">👤</div>
            <p className="text-sm text-muted-foreground">Click to select avatar</p>
          </button>
        )}
      </div>

      {showMediaPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]" onClick={() => setShowMediaPicker(false)}>
          <div className="bg-white dark:bg-gray-900 border border-border rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <MediaPicker
              value={block.avatar || ''}
              onChange={(url) => {
                onChange({ avatar: url });
                setShowMediaPicker(false);
              }}
              label="Select Avatar"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function BlogPostsBlockSettings({ block, onChange, currentViewport }: { block: BlogPostsBlock; onChange: (updates: Partial<BlogPostsBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Post Type</label>
        <input
          type="text"
          value={block.postType || ''}
          onChange={(e) => onChange({ postType: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Leave empty for all posts"
        />
        <p className="text-xs text-muted-foreground mt-1">Filter by post type (optional)</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Number of Posts</label>
        <input
          type="number"
          value={block.limit || 3}
          onChange={(e) => onChange({ limit: parseInt(e.target.value) })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          min="1"
          max="12"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Columns</label>
        <select
          value={block.columns || 3}
          onChange={(e) => onChange({ columns: parseInt(e.target.value) as BlogPostsBlock['columns'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="2">2 Columns</option>
          <option value="3">3 Columns</option>
        </select>
      </div>

      <div className="flex items-center">
        <input
          type="checkbox"
          id="showExcerpt"
          checked={block.showExcerpt !== false}
          onChange={(e) => onChange({ showExcerpt: e.target.checked })}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
        />
        <label htmlFor="showExcerpt" className="ml-2 text-sm text-foreground">
          Show Excerpt
        </label>
      </div>
    </div>
  );
}

function FeaturedContentBlockSettings({ block, onChange, currentViewport }: { block: FeaturedContentBlock; onChange: (updates: Partial<FeaturedContentBlock>) => void; currentViewport: Breakpoint }) {
  const [showMediaPicker, setShowMediaPicker] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Featured Image</label>
        {block.imageUrl ? (
          <div className="space-y-2">
            <img
              src={block.imageUrl}
              alt="Featured"
              className="w-full h-32 object-cover rounded border border-border"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowMediaPicker(true)}
                className="flex-1 px-3 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
              >
                Change Image
              </button>
              <button
                type="button"
                onClick={() => onChange({ imageUrl: '' })}
                className="px-3 py-2 text-sm bg-background border border-border text-foreground rounded hover:bg-accent"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowMediaPicker(true)}
            className="w-full p-8 border-2 border-dashed border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors text-center"
          >
            <div className="text-4xl mb-2">🖼️</div>
            <p className="text-sm text-muted-foreground">Click to select image</p>
          </button>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Image Position</label>
        <select
          value={block.imagePosition || 'right'}
          onChange={(e) => onChange({ imagePosition: e.target.value as FeaturedContentBlock['imagePosition'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>
      </div>

      <div className="space-y-3 pt-3 border-t border-border">
        <h4 className="text-sm font-semibold text-foreground">Call to Action (optional)</h4>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Button Text</label>
          <input
            type="text"
            value={block.buttonText || ''}
            onChange={(e) => onChange({ buttonText: e.target.value })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
            placeholder="Learn More"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Button URL</label>
          <input
            type="text"
            value={block.buttonUrl || ''}
            onChange={(e) => onChange({ buttonUrl: e.target.value })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
            placeholder="/learn-more"
          />
        </div>
      </div>

      {showMediaPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]" onClick={() => setShowMediaPicker(false)}>
          <div className="bg-white dark:bg-gray-900 border border-border rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <MediaPicker
              value={block.imageUrl || ''}
              onChange={(url) => {
                onChange({ imageUrl: url });
                setShowMediaPicker(false);
              }}
              label="Select Featured Image"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function AccordionBlockSettings({ block, onChange, currentViewport }: { block: AccordionBlock; onChange: (updates: Partial<AccordionBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Section Title (optional)</label>
        <input
          type="text"
          value={block.title || ''}
          onChange={(e) => onChange({ title: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Frequently Asked Questions"
        />
      </div>
      <p className="text-xs text-muted-foreground">Use the controls in the editor to add, remove, or edit accordion items.</p>
    </div>
  );
}

function SectionBlockSettings({ block, onChange }: { block: SectionBlock; onChange: (updates: Partial<SectionBlock>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">HTML Tag</label>
        <select
          value={block.htmlTag || 'section'}
          onChange={(e) => onChange({ htmlTag: e.target.value as SectionBlock['htmlTag'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="section">section</option>
          <option value="div">div</option>
          <option value="article">article</option>
          <option value="aside">aside</option>
          <option value="header">header</option>
          <option value="footer">footer</option>
        </select>
      </div>
      <div className="border-t border-border pt-4">
        <PageSettingsPanel
          settings={{
            backgroundColor: block.backgroundColor,
            backgroundImage: block.backgroundImage,
            backgroundSize: block.backgroundSize,
            backgroundPosition: block.backgroundPosition,
            maxWidth: block.maxWidth,
            paddingTop: block.paddingTop,
            paddingBottom: block.paddingBottom,
            paddingLeft: block.paddingLeft,
            paddingRight: block.paddingRight,
            color: block.color,
            fontFamily: block.fontFamily,
            cssClass: block.cssClass,
          }}
          onChange={(updates) => onChange(updates as Partial<SectionBlock>)}
        />
      </div>
      <p className="text-xs text-muted-foreground">{block.blocks.length} nested block{block.blocks.length !== 1 ? 's' : ''}</p>
    </div>
  );
}

function GalleryBlockSettings({ block, onChange }: { block: GalleryBlock; onChange: (updates: Partial<GalleryBlock>) => void }) {
  const addImage = () => {
    const newImage = { id: crypto.randomUUID(), url: '', alt: '', caption: '' };
    onChange({ images: [...block.images, newImage] });
  };

  const updateImage = (index: number, updates: Partial<GalleryBlock['images'][0]>) => {
    const images = [...block.images];
    images[index] = { ...images[index], ...updates };
    onChange({ images });
  };

  const removeImage = (index: number) => {
    onChange({ images: block.images.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Layout</label>
        <select
          value={block.layout || 'grid'}
          onChange={(e) => onChange({ layout: e.target.value as GalleryBlock['layout'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="grid">Grid</option>
          <option value="masonry">Masonry</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Columns</label>
        <select
          value={block.columns || 3}
          onChange={(e) => onChange({ columns: Number(e.target.value) as GalleryBlock['columns'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value={2}>2</option>
          <option value={3}>3</option>
          <option value={4}>4</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Gap</label>
        <select
          value={block.gap || 'md'}
          onChange={(e) => onChange({ gap: e.target.value as GalleryBlock['gap'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="sm">Small</option>
          <option value="md">Medium</option>
          <option value="lg">Large</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="gallery-lightbox"
          checked={block.lightbox !== false}
          onChange={(e) => onChange({ lightbox: e.target.checked })}
          className="rounded border-border"
        />
        <label htmlFor="gallery-lightbox" className="text-sm text-foreground">Enable lightbox</label>
      </div>

      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-foreground">Images ({block.images.length})</label>
          <button type="button" onClick={addImage} className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90">Add Image</button>
        </div>
        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {block.images.map((image, index) => (
            <div key={image.id} className="p-3 border border-border rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Image {index + 1}</span>
                <button type="button" onClick={() => removeImage(index)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
              </div>
              <input
                type="text"
                value={image.url}
                onChange={(e) => updateImage(index, { url: e.target.value })}
                placeholder="Image URL"
                className="w-full text-sm rounded border border-border bg-background px-3 py-1.5 text-foreground"
              />
              <input
                type="text"
                value={image.alt}
                onChange={(e) => updateImage(index, { alt: e.target.value })}
                placeholder="Alt text"
                className="w-full text-sm rounded border border-border bg-background px-3 py-1.5 text-foreground"
              />
              <input
                type="text"
                value={image.caption || ''}
                onChange={(e) => updateImage(index, { caption: e.target.value })}
                placeholder="Caption (optional)"
                className="w-full text-sm rounded border border-border bg-background px-3 py-1.5 text-foreground"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
