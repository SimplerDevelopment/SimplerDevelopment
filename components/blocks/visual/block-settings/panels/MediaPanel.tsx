'use client';

// MediaPanel: dispatcher for related block types' settings panels.
import type { Block, ImageBlock, GalleryBlock, VideoBlock, YoutubeBlock, MarqueeBlock, MarqueeItem, HtmlEmbedBlock } from '@/types/blocks';
import type { Breakpoint } from '@/types/responsive';
import { useState } from 'react';
import MediaPicker from '@/components/admin/MediaPicker';
import { MarqueeBlockSettings } from './MarqueeSettings';
import { HtmlEmbedBlockSettings } from './HtmlEmbedSettings';

interface PanelProps {
  block: Block;
  onChange: (updates: Partial<Block>) => void;
  currentViewport: Breakpoint;
}

export function MediaPanel({ block, onChange, currentViewport }: PanelProps) {
  switch (block.type) {
    case 'image':
      return <ImageBlockSettings block={block as ImageBlock} onChange={onChange as (u: Partial<ImageBlock>) => void} currentViewport={currentViewport} />;
    case 'video':
      return <VideoBlockSettings block={block as VideoBlock} onChange={onChange as (u: Partial<VideoBlock>) => void} currentViewport={currentViewport} />;
    case 'youtube':
      return <YoutubeBlockSettings block={block as YoutubeBlock} onChange={onChange as (u: Partial<YoutubeBlock>) => void} currentViewport={currentViewport} />;
    case 'gallery':
      return <GalleryBlockSettings block={block as GalleryBlock} onChange={onChange as (u: Partial<GalleryBlock>) => void} />;
    case 'marquee':
      return <MarqueeBlockSettings block={block as MarqueeBlock} onChange={onChange as (u: Partial<MarqueeBlock>) => void} />;
    case 'html-embed':
      return <HtmlEmbedBlockSettings block={block as HtmlEmbedBlock} onChange={onChange as (u: Partial<HtmlEmbedBlock>) => void} />;
    default:
      return null;
  }
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
            <span className="material-icons text-5xl text-muted-foreground/20 mb-2">image</span>
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
            <span className="material-icons text-5xl text-muted-foreground/20 mb-2">movie</span>
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

