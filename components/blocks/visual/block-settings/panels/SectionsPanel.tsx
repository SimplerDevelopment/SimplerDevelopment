'use client';

// SectionsPanel: dispatcher for related block types' settings panels.
import type { Block, CtaBlock, ServicesGridBlock, StatsBlock, TestimonialBlock, SocialLinksBlock, LogoStripBlock, MetricCardsBlock, FlipCardGridBlock, TimelineBlock, TeamShowcaseBlock, TeamFlipGridBlock, BentoGridBlock, BentoCard, HeroBlock, HeroSlideshowBlock, HeroSlideshowSlide, SiteFooterBlock } from '@/types/blocks';
import type { Breakpoint } from '@/types/responsive';
import { useState } from 'react';
import MediaPicker from '@/components/admin/MediaPicker';
import { TokenColorPicker } from '@/components/blocks/visual/TokenColorPicker';
import { RichTextEditable } from '@/components/blocks/visual/RichTextEditable';
import { HeroBlockSettings } from './HeroSettings';
import { HeroSlideshowBlockSettings } from './HeroSlideshowSettings';
import { SiteFooterBlockSettings } from './SiteFooterSettings';

interface PanelProps {
  block: Block;
  onChange: (updates: Partial<Block>) => void;
  currentViewport: Breakpoint;
}

export function SectionsPanel({ block, onChange, currentViewport }: PanelProps) {
  switch (block.type) {
    case 'hero':
      return <HeroBlockSettings block={block as HeroBlock} onChange={onChange as (u: Partial<HeroBlock>) => void} currentViewport={currentViewport} />;
    case 'hero-slideshow':
      return <HeroSlideshowBlockSettings block={block as HeroSlideshowBlock} onChange={onChange as (u: Partial<HeroSlideshowBlock>) => void} />;
    case 'services-grid':
      return <ServicesGridBlockSettings block={block as ServicesGridBlock} onChange={onChange as (u: Partial<ServicesGridBlock>) => void} currentViewport={currentViewport} />;
    case 'cta':
      return <CtaBlockSettings block={block as CtaBlock} onChange={onChange as (u: Partial<CtaBlock>) => void} currentViewport={currentViewport} />;
    case 'testimonial':
      return <TestimonialBlockSettings block={block as TestimonialBlock} onChange={onChange as (u: Partial<TestimonialBlock>) => void} currentViewport={currentViewport} />;
    case 'stats':
      return <StatsBlockSettings block={block as StatsBlock} onChange={onChange as (u: Partial<StatsBlock>) => void} currentViewport={currentViewport} />;
    case 'social-links':
      return <SocialLinksBlockSettings block={block as SocialLinksBlock} onChange={onChange as (u: Partial<SocialLinksBlock>) => void} />;
    case 'logo-strip':
      return <LogoStripBlockSettings block={block as LogoStripBlock} onChange={onChange as (u: Partial<LogoStripBlock>) => void} />;
    case 'metric-cards':
      return <MetricCardsBlockSettings block={block as MetricCardsBlock} onChange={onChange as (u: Partial<MetricCardsBlock>) => void} />;
    case 'flip-card-grid':
      return <FlipCardGridBlockSettings block={block as FlipCardGridBlock} onChange={onChange as (u: Partial<FlipCardGridBlock>) => void} />;
    case 'timeline':
      return <TimelineBlockSettings block={block as TimelineBlock} onChange={onChange as (u: Partial<TimelineBlock>) => void} />;
    case 'team-showcase':
      return <TeamShowcaseBlockSettings block={block as TeamShowcaseBlock} onChange={onChange as (u: Partial<TeamShowcaseBlock>) => void} />;
    case 'team-flip-grid':
      return <TeamFlipGridBlockSettings block={block as TeamFlipGridBlock} onChange={onChange as (u: Partial<TeamFlipGridBlock>) => void} />;
    case 'bento-grid':
      return <BentoGridBlockSettings block={block as BentoGridBlock} onChange={onChange as (u: Partial<BentoGridBlock>) => void} />;
    case 'site-footer':
      return <SiteFooterBlockSettings block={block as SiteFooterBlock} onChange={onChange as (u: Partial<SiteFooterBlock>) => void} />;
    default:
      return null;
  }
}

function CtaBlockSettings({ block, onChange, currentViewport }: { block: CtaBlock; onChange: (updates: Partial<CtaBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title} onChange={(html) => onChange({ title: html })} singleLine placeholder="CTA Title" className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Description</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[60px]">
          <RichTextEditable html={block.description || ''} onChange={(html) => onChange({ description: html || undefined })} placeholder="Optional description" className="text-sm text-foreground" />
        </div>
      </div>
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
        <label className="block text-sm font-medium text-foreground mb-1">Overline</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.overline || ''} onChange={(html) => onChange({ overline: html || undefined })} singleLine placeholder="OUR SERVICES" className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Section title..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Description</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.description || ''} onChange={(html) => onChange({ description: html || undefined })} singleLine placeholder="Section description..." className="text-sm text-foreground" />
        </div>
      </div>
      <div className="border-t border-border pt-4">
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
      <div>
        <TokenColorPicker
          label="Accent Color"
          value={block.accentColor || ''}
          onChange={(v) => onChange({ accentColor: v || undefined })}
          placeholder="Brand primary"
        />
        <p className="text-xs text-muted-foreground mt-1">Used for icons, bullets, and the link arrow.</p>
      </div>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Services</label>
        {(block.services || []).map((service, i) => (
          <div key={service.id ?? i} className="space-y-1 p-2 rounded border border-border">
            <input
              type="text"
              value={service.title}
              onChange={(e) => {
                const next = [...(block.services || [])];
                next[i] = { ...next[i], title: e.target.value };
                onChange({ services: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold"
              placeholder="Service title"
            />
            <textarea
              value={service.description}
              onChange={(e) => {
                const next = [...(block.services || [])];
                next[i] = { ...next[i], description: e.target.value };
                onChange({ services: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Service description"
              rows={2}
            />
            <input
              type="text"
              value={service.icon || ''}
              onChange={(e) => {
                const next = [...(block.services || [])];
                next[i] = { ...next[i], icon: e.target.value || undefined };
                onChange({ services: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Material Icon name (e.g. 'design_services')"
            />
            <input
              type="url"
              value={service.image || ''}
              onChange={(e) => {
                const next = [...(block.services || [])];
                next[i] = { ...next[i], image: e.target.value || undefined };
                onChange({ services: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Service image URL (optional)"
            />
            <input
              type="url"
              value={service.link || ''}
              onChange={(e) => {
                const next = [...(block.services || [])];
                next[i] = { ...next[i], link: e.target.value || undefined };
                onChange({ services: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Link URL (optional)"
            />
            <input
              type="text"
              value={service.linkText || ''}
              onChange={(e) => {
                const next = [...(block.services || [])];
                next[i] = { ...next[i], linkText: e.target.value || undefined };
                onChange({ services: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder='CTA text (default "Learn More")'
            />
            <button
              type="button"
              onClick={() => onChange({ services: (block.services || []).filter((_, j) => j !== i) })}
              className="text-xs text-destructive hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ services: [...(block.services || []), { id: `service-${Date.now()}`, title: 'New service', description: '', bullets: [] }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Add Service
        </button>
        <p className="text-xs text-muted-foreground">Per-service bullets are edited via the iframe editor (BlockContentEditor). The bullet array is preserved on round-trip.</p>
      </div>
    </div>
  );
}

function StatsBlockSettings({ block, onChange, currentViewport }: { block: StatsBlock; onChange: (updates: Partial<StatsBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Section title..." className="text-sm text-foreground" />
        </div>
      </div>
      <div className="border-t border-border pt-4">
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
    </div>
  );
}

function TestimonialBlockSettings({ block, onChange, currentViewport }: { block: TestimonialBlock; onChange: (updates: Partial<TestimonialBlock>) => void; currentViewport: Breakpoint }) {
  const [showMediaPicker, setShowMediaPicker] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Quote</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[60px]">
          <RichTextEditable html={block.quote} onChange={(html) => onChange({ quote: html })} placeholder="Enter testimonial quote..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Author Name</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.author} onChange={(html) => onChange({ author: html })} singleLine placeholder="Author name..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Role</label>
        <input
          type="text"
          value={block.role || ''}
          onChange={(e) => onChange({ role: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Role..."
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Company</label>
        <input
          type="text"
          value={block.company || ''}
          onChange={(e) => onChange({ company: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Company..."
        />
      </div>

      <div className="border-t border-border pt-4">
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
            <span className="material-icons text-5xl text-muted-foreground/20 mb-2">person</span>
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

function SocialLinksBlockSettings({ block, onChange }: { block: SocialLinksBlock; onChange: (updates: Partial<SocialLinksBlock>) => void }) {
  const PLATFORMS: Array<SocialLinksBlock['links'][number]['platform']> = ['facebook', 'twitter', 'instagram', 'linkedin', 'youtube', 'tiktok'];
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Icon Size (px)</label>
        <select
          value={block.iconSize ?? 32}
          onChange={(e) => onChange({ iconSize: Number(e.target.value) })}
          className={inputClass}
        >
          <option value={24}>24</option>
          <option value={32}>32</option>
          <option value={40}>40</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Alignment</label>
        <select
          value={block.alignment ?? 'center'}
          onChange={(e) => onChange({ alignment: e.target.value as SocialLinksBlock['alignment'] })}
          className={inputClass}
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </div>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Links</label>
        {(block.links || []).map((link, i) => (
          <div key={i} className="flex gap-2 items-start">
            <select
              value={link.platform}
              onChange={(e) => {
                const next = [...(block.links || [])];
                next[i] = { ...next[i], platform: e.target.value as SocialLinksBlock['links'][number]['platform'] };
                onChange({ links: next });
              }}
              className="text-xs rounded border border-border bg-background px-2 py-2 text-foreground"
            >
              {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <input
              type="url"
              value={link.url}
              onChange={(e) => {
                const next = [...(block.links || [])];
                next[i] = { ...next[i], url: e.target.value };
                onChange({ links: next });
              }}
              className="flex-1 text-xs rounded border border-border bg-background px-2 py-2 text-foreground"
              placeholder="https://"
            />
            <button
              type="button"
              onClick={() => onChange({ links: (block.links || []).filter((_, j) => j !== i) })}
              className="px-2 py-2 text-xs rounded border border-border text-destructive hover:bg-destructive/10"
              title="Remove link"
            >
              <span className="material-icons text-xs">delete</span>
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ links: [...(block.links || []), { platform: 'facebook', url: '' }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Add Link
        </button>
      </div>
    </div>
  );
}

function LogoStripBlockSettings({ block, onChange }: { block: LogoStripBlock; onChange: (updates: Partial<LogoStripBlock>) => void }) {
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Overline (eyebrow text)</label>
        <input
          type="text"
          value={block.overline || ''}
          onChange={(e) => onChange({ overline: e.target.value || undefined })}
          className={inputClass}
          placeholder="e.g. TRUSTED BY 100+ TEAMS"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Columns</label>
          <select
            value={block.columns || 6}
            onChange={(e) => onChange({ columns: Number(e.target.value) as LogoStripBlock['columns'] })}
            className={inputClass}
          >
            {[3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Gap</label>
          <select
            value={block.gap || 'lg'}
            onChange={(e) => onChange({ gap: e.target.value as LogoStripBlock['gap'] })}
            className={inputClass}
          >
            <option value="sm">Small</option>
            <option value="md">Medium</option>
            <option value="lg">Large</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Alignment</label>
          <select
            value={block.alignment || 'center'}
            onChange={(e) => onChange({ alignment: e.target.value as LogoStripBlock['alignment'] })}
            className={inputClass}
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Logo Height</label>
          <input
            type="text"
            value={block.logoHeight || '40px'}
            onChange={(e) => onChange({ logoHeight: e.target.value })}
            className={inputClass}
            placeholder="40px"
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={block.grayscale ?? true}
          onChange={(e) => onChange({ grayscale: e.target.checked })}
          className="rounded border-border"
        />
        Grayscale (color on hover)
      </label>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Logos</label>
        {(block.logos || []).map((logo, i) => (
          <div key={logo.id ?? i} className="space-y-1 p-2 rounded border border-border">
            <input
              type="url"
              value={logo.imageUrl}
              onChange={(e) => {
                const next = [...(block.logos || [])];
                next[i] = { ...next[i], imageUrl: e.target.value };
                onChange({ logos: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Image URL"
            />
            <input
              type="text"
              value={logo.alt}
              onChange={(e) => {
                const next = [...(block.logos || [])];
                next[i] = { ...next[i], alt: e.target.value };
                onChange({ logos: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Alt text"
            />
            <input
              type="url"
              value={logo.link || ''}
              onChange={(e) => {
                const next = [...(block.logos || [])];
                next[i] = { ...next[i], link: e.target.value || undefined };
                onChange({ logos: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Link URL (optional)"
            />
            <button
              type="button"
              onClick={() => onChange({ logos: (block.logos || []).filter((_, j) => j !== i) })}
              className="text-xs text-destructive hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ logos: [...(block.logos || []), { id: `logo-${Date.now()}`, imageUrl: '', alt: '' }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Add Logo
        </button>
      </div>
    </div>
  );
}

function MetricCardsBlockSettings({ block, onChange }: { block: MetricCardsBlock; onChange: (updates: Partial<MetricCardsBlock>) => void }) {
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Overline</label>
        <input
          type="text"
          value={block.overline || ''}
          onChange={(e) => onChange({ overline: e.target.value || undefined })}
          className={inputClass}
          placeholder="e.g. PROOF POINTS"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Section title..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Description</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.description || ''} onChange={(html) => onChange({ description: html || undefined })} singleLine placeholder="Description..." className="text-sm text-foreground" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Columns</label>
          <select
            value={block.columns || 4}
            onChange={(e) => onChange({ columns: Number(e.target.value) as MetricCardsBlock['columns'] })}
            className={inputClass}
          >
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Accent Color</label>
          <TokenColorPicker value={block.accentColor || ''} onChange={(color) => onChange({ accentColor: color || undefined })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Logo Column Width</label>
          <input
            type="text"
            value={block.logoColumnWidth || ''}
            onChange={(e) => onChange({ logoColumnWidth: e.target.value || undefined })}
            className={inputClass}
            placeholder="auto, 240px, 16rem…"
          />
          <p className="text-xs text-muted-foreground mt-1">CSS width for the institution-logo column. Leave blank for default.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Label Max Width</label>
          <input
            type="text"
            value={block.labelMaxWidth || ''}
            onChange={(e) => onChange({ labelMaxWidth: e.target.value || undefined })}
            className={inputClass}
            placeholder="32rem, 480px…"
          />
          <p className="text-xs text-muted-foreground mt-1">Caps the metric label width. Leave blank for default.</p>
        </div>
      </div>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Metrics</label>
        {(block.metrics || []).map((metric, i) => (
          <div key={metric.id ?? i} className="space-y-1 p-2 rounded border border-border">
            <input
              type="text"
              value={metric.value}
              onChange={(e) => {
                const next = [...(block.metrics || [])];
                next[i] = { ...next[i], value: e.target.value };
                onChange({ metrics: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold"
              placeholder='Big value e.g. "83%"'
            />
            <input
              type="text"
              value={metric.label}
              onChange={(e) => {
                const next = [...(block.metrics || [])];
                next[i] = { ...next[i], label: e.target.value };
                onChange({ metrics: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Small label"
            />
            <input
              type="text"
              value={metric.institution || ''}
              onChange={(e) => {
                const next = [...(block.metrics || [])];
                next[i] = { ...next[i], institution: e.target.value || undefined };
                onChange({ metrics: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Institution (optional)"
            />
            <input
              type="url"
              value={metric.institutionLogo || ''}
              onChange={(e) => {
                const next = [...(block.metrics || [])];
                next[i] = { ...next[i], institutionLogo: e.target.value || undefined };
                onChange({ metrics: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Institution logo URL (optional)"
            />
            <input
              type="url"
              value={metric.link || ''}
              onChange={(e) => {
                const next = [...(block.metrics || [])];
                next[i] = { ...next[i], link: e.target.value || undefined };
                onChange({ metrics: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Link URL (optional)"
            />
            <input
              type="text"
              value={metric.linkText || ''}
              onChange={(e) => {
                const next = [...(block.metrics || [])];
                next[i] = { ...next[i], linkText: e.target.value || undefined };
                onChange({ metrics: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder='CTA text (default "Case Study")'
            />
            <button
              type="button"
              onClick={() => onChange({ metrics: (block.metrics || []).filter((_, j) => j !== i) })}
              className="text-xs text-destructive hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ metrics: [...(block.metrics || []), { id: `metric-${Date.now()}`, value: '', label: '' }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Add Metric
        </button>
      </div>
    </div>
  );
}

function FlipCardGridBlockSettings({ block, onChange }: { block: FlipCardGridBlock; onChange: (updates: Partial<FlipCardGridBlock>) => void }) {
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Overline</label>
        <input
          type="text"
          value={block.overline || ''}
          onChange={(e) => onChange({ overline: e.target.value || undefined })}
          className={inputClass}
          placeholder="e.g. WHY WE'RE DIFFERENT"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Section title..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Description</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.description || ''} onChange={(html) => onChange({ description: html || undefined })} singleLine placeholder="Description..." className="text-sm text-foreground" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Columns</label>
          <select
            value={block.columns || 3}
            onChange={(e) => onChange({ columns: Number(e.target.value) as FlipCardGridBlock['columns'] })}
            className={inputClass}
          >
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Card Height</label>
          <input
            type="text"
            value={block.cardHeight || '280px'}
            onChange={(e) => onChange({ cardHeight: e.target.value })}
            className={inputClass}
            placeholder="280px"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Flip Trigger</label>
          <select
            value={block.flipTrigger || 'hover'}
            onChange={(e) => onChange({ flipTrigger: e.target.value as FlipCardGridBlock['flipTrigger'] })}
            className={inputClass}
          >
            <option value="hover">Hover</option>
            <option value="click">Click</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Flip Axis</label>
          <select
            value={block.flipAxis || 'horizontal'}
            onChange={(e) => onChange({ flipAxis: e.target.value as FlipCardGridBlock['flipAxis'] })}
            className={inputClass}
          >
            <option value="horizontal">Horizontal (Y-axis)</option>
            <option value="vertical">Vertical (X-axis)</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Accent Color</label>
        <TokenColorPicker value={block.accentColor || ''} onChange={(color) => onChange({ accentColor: color || undefined })} />
      </div>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Cards</label>
        {(block.cards || []).map((card, i) => (
          <div key={card.id ?? i} className="space-y-1 p-2 rounded border border-border">
            <input
              type="text"
              value={card.frontTitle}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], frontTitle: e.target.value };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold"
              placeholder="Front title"
            />
            <input
              type="text"
              value={card.frontSubtitle || ''}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], frontSubtitle: e.target.value || undefined };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Front subtitle (optional)"
            />
            <input
              type="text"
              value={card.frontIcon || ''}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], frontIcon: e.target.value || undefined };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Material Icon name (e.g. trending_up)"
            />
            <input
              type="url"
              value={card.frontImage || ''}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], frontImage: e.target.value || undefined };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Front image URL (optional)"
            />
            <textarea
              value={card.backText}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], backText: e.target.value };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Back text"
              rows={2}
            />
            <input
              type="url"
              value={card.backLink || ''}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], backLink: e.target.value || undefined };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Back link URL (optional)"
            />
            <input
              type="text"
              value={card.backLinkText || ''}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], backLinkText: e.target.value || undefined };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Back link text (optional)"
            />
            <button
              type="button"
              onClick={() => onChange({ cards: (block.cards || []).filter((_, j) => j !== i) })}
              className="text-xs text-destructive hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ cards: [...(block.cards || []), { id: `flipcard-${Date.now()}`, frontTitle: '', backText: '' }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Add Card
        </button>
      </div>
    </div>
  );
}

function TimelineBlockSettings({ block, onChange }: { block: TimelineBlock; onChange: (updates: Partial<TimelineBlock>) => void }) {
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Overline</label>
        <input
          type="text"
          value={block.overline || ''}
          onChange={(e) => onChange({ overline: e.target.value || undefined })}
          className={inputClass}
          placeholder="e.g. OUR PROCESS"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Section title..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Subtitle</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.subtitle || ''} onChange={(html) => onChange({ subtitle: html || undefined })} singleLine placeholder="Subtitle..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Layout</label>
        <select
          value={block.layout || 'alternating'}
          onChange={(e) => onChange({ layout: e.target.value as TimelineBlock['layout'] })}
          className={inputClass}
        >
          <option value="alternating">Alternating (zigzag)</option>
          <option value="left">Left-aligned</option>
        </select>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Line Color</label>
          <TokenColorPicker value={block.lineColor || ''} onChange={(color) => onChange({ lineColor: color || undefined })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Number Color</label>
          <TokenColorPicker value={block.numberColor || ''} onChange={(color) => onChange({ numberColor: color || undefined })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Node Color</label>
          <TokenColorPicker value={block.nodeColor || ''} onChange={(color) => onChange({ nodeColor: color || undefined })} />
        </div>
      </div>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Steps</label>
        {(block.steps || []).map((step, i) => (
          <div key={step.id ?? i} className="space-y-1 p-2 rounded border border-border">
            <input
              type="text"
              value={step.number || ''}
              onChange={(e) => {
                const next = [...(block.steps || [])];
                next[i] = { ...next[i], number: e.target.value || undefined };
                onChange({ steps: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Number (e.g. 01) — optional"
            />
            <input
              type="text"
              value={step.icon || ''}
              onChange={(e) => {
                const next = [...(block.steps || [])];
                next[i] = { ...next[i], icon: e.target.value || undefined };
                onChange({ steps: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Material Icon name (optional, alt to number)"
            />
            <input
              type="text"
              value={step.title}
              onChange={(e) => {
                const next = [...(block.steps || [])];
                next[i] = { ...next[i], title: e.target.value };
                onChange({ steps: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold"
              placeholder="Step title"
            />
            <textarea
              value={step.description}
              onChange={(e) => {
                const next = [...(block.steps || [])];
                next[i] = { ...next[i], description: e.target.value };
                onChange({ steps: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Step description"
              rows={2}
            />
            <button
              type="button"
              onClick={() => onChange({ steps: (block.steps || []).filter((_, j) => j !== i) })}
              className="text-xs text-destructive hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ steps: [...(block.steps || []), { id: `step-${Date.now()}`, title: '', description: '' }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Add Step
        </button>
      </div>
    </div>
  );
}

function TeamShowcaseBlockSettings({ block, onChange }: { block: TeamShowcaseBlock; onChange: (updates: Partial<TeamShowcaseBlock>) => void }) {
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Overline</label>
        <input
          type="text"
          value={block.overline || ''}
          onChange={(e) => onChange({ overline: e.target.value || undefined })}
          className={inputClass}
          placeholder="e.g. OUR TEAM"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Section title..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Subtitle</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.subtitle || ''} onChange={(html) => onChange({ subtitle: html || undefined })} singleLine placeholder="Subtitle..." className="text-sm text-foreground" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Bio Panel Color</label>
          <TokenColorPicker value={block.bioPanelColor || ''} onChange={(color) => onChange({ bioPanelColor: color || undefined })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Accent Color</label>
          <TokenColorPicker value={block.accentColor || ''} onChange={(color) => onChange({ accentColor: color || undefined })} />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Photo Filter (CSS)</label>
        <input
          type="text"
          value={block.photoFilter || ''}
          onChange={(e) => onChange({ photoFilter: e.target.value || undefined })}
          className={inputClass}
          placeholder="e.g. sepia(0.08)"
        />
      </div>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Members</label>
        {(block.members || []).map((member, i) => (
          <div key={member.id ?? i} className="space-y-1 p-2 rounded border border-border">
            <input
              type="text"
              value={member.name}
              onChange={(e) => {
                const next = [...(block.members || [])];
                next[i] = { ...next[i], name: e.target.value };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold"
              placeholder="Name"
            />
            <input
              type="text"
              value={member.title}
              onChange={(e) => {
                const next = [...(block.members || [])];
                next[i] = { ...next[i], title: e.target.value };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Title"
            />
            <input
              type="text"
              value={member.credentials || ''}
              onChange={(e) => {
                const next = [...(block.members || [])];
                next[i] = { ...next[i], credentials: e.target.value || undefined };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Credentials (optional)"
            />
            <input
              type="url"
              value={member.photo}
              onChange={(e) => {
                const next = [...(block.members || [])];
                next[i] = { ...next[i], photo: e.target.value };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Photo URL"
            />
            <textarea
              value={member.bio}
              onChange={(e) => {
                const next = [...(block.members || [])];
                next[i] = { ...next[i], bio: e.target.value };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Bio"
              rows={3}
            />
            <input
              type="text"
              value={(member.specialties || []).join(', ')}
              onChange={(e) => {
                const next = [...(block.members || [])];
                const list = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                next[i] = { ...next[i], specialties: list.length ? list : undefined };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Specialties (comma-separated, optional)"
            />
            <button
              type="button"
              onClick={() => onChange({ members: (block.members || []).filter((_, j) => j !== i) })}
              className="text-xs text-destructive hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ members: [...(block.members || []), { id: `member-${Date.now()}`, name: '', title: '', photo: '', bio: '' }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Add Member
        </button>
      </div>
    </div>
  );
}

function TeamFlipGridBlockSettings({ block, onChange }: { block: TeamFlipGridBlock; onChange: (updates: Partial<TeamFlipGridBlock>) => void }) {
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Overline</label>
        <input
          type="text"
          value={block.overline || ''}
          onChange={(e) => onChange({ overline: e.target.value || undefined })}
          className={inputClass}
          placeholder="e.g. MEET THE TEAM"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Section title..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Subtitle</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.subtitle || ''} onChange={(html) => onChange({ subtitle: html || undefined })} singleLine placeholder="Subtitle..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Columns</label>
        <select
          value={block.columns || 4}
          onChange={(e) => onChange({ columns: Number(e.target.value) as TeamFlipGridBlock['columns'] })}
          className={inputClass}
        >
          <option value={2}>2</option>
          <option value={3}>3</option>
          <option value={4}>4</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Back BG Color</label>
          <TokenColorPicker value={block.backBgColor || ''} onChange={(color) => onChange({ backBgColor: color || undefined })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Back Text Color</label>
          <TokenColorPicker value={block.backTextColor || ''} onChange={(color) => onChange({ backTextColor: color || undefined })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Name Color</label>
          <TokenColorPicker value={block.nameColor || ''} onChange={(color) => onChange({ nameColor: color || undefined })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Title Color</label>
          <TokenColorPicker value={block.titleColor || ''} onChange={(color) => onChange({ titleColor: color || undefined })} />
        </div>
      </div>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Members</label>
        {(block.members || []).map((member, i) => (
          <div key={member.id ?? i} className="space-y-1 p-2 rounded border border-border">
            <input
              type="text"
              value={member.name}
              onChange={(e) => {
                const next = [...(block.members || [])];
                next[i] = { ...next[i], name: e.target.value };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold"
              placeholder="Name"
            />
            <input
              type="text"
              value={member.title}
              onChange={(e) => {
                const next = [...(block.members || [])];
                next[i] = { ...next[i], title: e.target.value };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Title"
            />
            <input
              type="url"
              value={member.photo}
              onChange={(e) => {
                const next = [...(block.members || [])];
                next[i] = { ...next[i], photo: e.target.value };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Photo URL"
            />
            <textarea
              value={member.bio}
              onChange={(e) => {
                const next = [...(block.members || [])];
                next[i] = { ...next[i], bio: e.target.value };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Bio (front)"
              rows={2}
            />
            <input
              type="text"
              value={member.question}
              onChange={(e) => {
                const next = [...(block.members || [])];
                next[i] = { ...next[i], question: e.target.value };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Question (back)"
            />
            <textarea
              value={member.answer}
              onChange={(e) => {
                const next = [...(block.members || [])];
                next[i] = { ...next[i], answer: e.target.value };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Answer (back)"
              rows={2}
            />
            <button
              type="button"
              onClick={() => onChange({ members: (block.members || []).filter((_, j) => j !== i) })}
              className="text-xs text-destructive hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ members: [...(block.members || []), { id: `tmember-${Date.now()}`, name: '', title: '', bio: '', photo: '', question: '', answer: '' }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Add Member
        </button>
      </div>
    </div>
  );
}

function BentoGridBlockSettings({ block, onChange }: { block: BentoGridBlock; onChange: (updates: Partial<BentoGridBlock>) => void }) {
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Overline</label>
        <input
          type="text"
          value={block.overline || ''}
          onChange={(e) => onChange({ overline: e.target.value || undefined })}
          className={inputClass}
          placeholder="e.g. CAPABILITIES"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Section title..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Subtitle</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.subtitle || ''} onChange={(html) => onChange({ subtitle: html || undefined })} singleLine placeholder="Subtitle..." className="text-sm text-foreground" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Columns</label>
          <select
            value={block.columns || 2}
            onChange={(e) => onChange({ columns: Number(e.target.value) })}
            className={inputClass}
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Dark BG</label>
          <TokenColorPicker value={block.darkBg || ''} onChange={(color) => onChange({ darkBg: color || undefined })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Light Border</label>
          <TokenColorPicker value={block.lightBorder || ''} onChange={(color) => onChange({ lightBorder: color || undefined })} />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Accent Color</label>
        <TokenColorPicker value={block.accentColor || ''} onChange={(color) => onChange({ accentColor: color || undefined })} />
      </div>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Cards</label>
        {(block.cards || []).map((card, i) => (
          <div key={card.id ?? i} className="space-y-1 p-2 rounded border border-border">
            <input
              type="text"
              value={card.title}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], title: e.target.value };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold"
              placeholder="Title"
            />
            <input
              type="text"
              value={card.lead || ''}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], lead: e.target.value || undefined };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground italic"
              placeholder="Lead/question (optional)"
            />
            <textarea
              value={(card.items || []).join('\n')}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], items: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Bullet items (one per line)"
              rows={3}
            />
            <input
              type="url"
              value={card.link || ''}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], link: e.target.value || undefined };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Link URL (optional)"
            />
            <input
              type="text"
              value={card.linkText || ''}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], linkText: e.target.value || undefined };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Link text (optional)"
            />
            <div className="flex gap-2">
              <select
                value={card.variant || 'dark'}
                onChange={(e) => {
                  const next = [...(block.cards || [])];
                  next[i] = { ...next[i], variant: e.target.value as BentoCard['variant'] };
                  onChange({ cards: next });
                }}
                className="flex-1 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
              <input
                type="number"
                min={1}
                max={12}
                value={card.span ?? 6}
                onChange={(e) => {
                  const next = [...(block.cards || [])];
                  next[i] = { ...next[i], span: Number(e.target.value) };
                  onChange({ cards: next });
                }}
                className="w-20 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
                placeholder="Span"
              />
            </div>
            <button
              type="button"
              onClick={() => onChange({ cards: (block.cards || []).filter((_, j) => j !== i) })}
              className="text-xs text-destructive hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ cards: [...(block.cards || []), { id: `bento-${Date.now()}`, title: '', items: [], variant: 'dark', span: 6 }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Add Card
        </button>
      </div>
    </div>
  );
}

