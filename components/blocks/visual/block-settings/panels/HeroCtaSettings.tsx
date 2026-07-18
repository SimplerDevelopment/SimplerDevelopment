'use client';

// Settings panel for the unified `hero-cta` block (VEQA-067 Strategy A),
// extracted alongside HeroSettings.tsx. A `layout` toggle switches between
// the two legacy looks; fields specific to one layout are hidden for the other.
import type { HeroCtaBlock } from '@/types/blocks';
import type { Breakpoint } from '@/types/responsive';
import { useState } from 'react';
import MediaPicker from '@/components/admin/MediaPicker';
import { RichTextEditable } from '@/components/blocks/visual/RichTextEditable';

export function HeroCtaBlockSettings({ block, onChange, currentViewport }: { block: HeroCtaBlock; onChange: (updates: Partial<HeroCtaBlock>) => void; currentViewport: Breakpoint }) {
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [showVideoPicker, setShowVideoPicker] = useState(false);

  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  const isHero = block.layout !== 'banner';

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Layout</label>
        <select
          value={block.layout || 'hero'}
          onChange={(e) => onChange({ layout: e.target.value as HeroCtaBlock['layout'] })}
          className={inputClass}
        >
          <option value="hero">Hero (full-bleed)</option>
          <option value="banner">Banner (centered CTA band)</option>
        </select>
      </div>

      {/* Content Fields */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title} onChange={(html) => onChange({ title: html })} singleLine placeholder="Title" className="text-sm text-foreground" />
        </div>
      </div>
      {isHero && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Subtitle</label>
          <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
            <RichTextEditable html={block.subtitle || ''} onChange={(html) => onChange({ subtitle: html || undefined })} singleLine placeholder="Optional subtitle" className="text-sm text-foreground" />
          </div>
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Description</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[60px]">
          <RichTextEditable html={block.description || ''} onChange={(html) => onChange({ description: html || undefined })} placeholder="Optional description" className="text-sm text-foreground" />
        </div>
      </div>

      <div className="space-y-3 pt-3 border-t border-border">
        <h4 className="text-sm font-semibold text-foreground">Primary Button</h4>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Button Text</label>
          <input type="text" value={block.primaryButtonText || ''} onChange={(e) => onChange({ primaryButtonText: e.target.value })} className={inputClass} placeholder="Get Started" />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Button URL</label>
          <input type="text" value={block.primaryButtonUrl || ''} onChange={(e) => onChange({ primaryButtonUrl: e.target.value })} className={inputClass} placeholder="/contact" />
        </div>
      </div>

      <div className="space-y-3 pt-3 border-t border-border">
        <h4 className="text-sm font-semibold text-foreground">Secondary Button (optional)</h4>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Button Text</label>
          <input type="text" value={block.secondaryButtonText || ''} onChange={(e) => onChange({ secondaryButtonText: e.target.value })} className={inputClass} placeholder="Optional" />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Button URL</label>
          <input type="text" value={block.secondaryButtonUrl || ''} onChange={(e) => onChange({ secondaryButtonUrl: e.target.value })} className={inputClass} placeholder="Optional" />
        </div>
      </div>

      {isHero ? (
        <>
          <div className="border-t border-border pt-4">
            <label className="block text-sm font-medium text-foreground mb-2">Background Image (optional)</label>
            {block.backgroundImage ? (
              <div className="space-y-2">
                <img src={block.backgroundImage} alt="Background" className="w-full h-32 object-cover rounded border border-border" />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowImagePicker(true)} className="flex-1 px-3 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90">Change Image</button>
                  <button type="button" onClick={() => onChange({ backgroundImage: '' })} className="px-3 py-2 text-sm bg-background border border-border text-foreground rounded hover:bg-accent">Remove</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setShowImagePicker(true)} className="w-full p-6 border-2 border-dashed border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors text-center">
                <span className="material-icons text-5xl text-muted-foreground/20 mb-2">image</span>
                <p className="text-sm text-muted-foreground">Click to select background image</p>
              </button>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Background Video (optional)</label>
            {block.backgroundVideo ? (
              <div className="space-y-2">
                <div className="w-full aspect-video bg-black rounded border border-border overflow-hidden">
                  <video src={block.backgroundVideo} controls className="w-full h-full" />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowVideoPicker(true)} className="flex-1 px-3 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90">Change Video</button>
                  <button type="button" onClick={() => onChange({ backgroundVideo: '' })} className="px-3 py-2 text-sm bg-background border border-border text-foreground rounded hover:bg-accent">Remove</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setShowVideoPicker(true)} className="w-full p-6 border-2 border-dashed border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors text-center">
                <span className="material-icons text-5xl text-muted-foreground/20 mb-2">movie</span>
                <p className="text-sm text-muted-foreground">Click to select background video</p>
              </button>
            )}
          </div>

          {showImagePicker && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]" onClick={() => setShowImagePicker(false)}>
              <div className="bg-white dark:bg-gray-900 border border-border rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <MediaPicker
                  value={block.backgroundImage || ''}
                  onChange={(url) => { onChange({ backgroundImage: url }); setShowImagePicker(false); }}
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
                  onChange={(url) => { onChange({ backgroundVideo: url }); setShowVideoPicker(false); }}
                  label="Select Background Video"
                />
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="border-t border-border pt-4">
          <label className="block text-sm font-medium text-foreground mb-2">Background Style</label>
          <select
            value={block.backgroundStyle || 'gradient'}
            onChange={(e) => onChange({ backgroundStyle: e.target.value as HeroCtaBlock['backgroundStyle'] })}
            className={inputClass}
          >
            <option value="gradient">Gradient</option>
            <option value="solid">Solid</option>
            <option value="none">None</option>
          </select>
        </div>
      )}
    </div>
  );
}
