/** Decision-slide editor — renames, decision options (label/icon/path-group), optional cover-style content (TF1 two-column intro). */
'use client';

import type { PitchDeckSlideV2 } from '@/lib/db/schema';

export interface DecisionSlideEditorProps {
  slide: PitchDeckSlideV2;
  slideIndex: number;
  pathGroupSlideCounts: Record<string, number>;
  onUpdateLabel: (label: string) => void;
  onAddOption: () => void;
  onUpdateOption: (optionId: string, updates: Partial<{ label: string; description: string; icon: string; pathGroup: string }>) => void;
  onRemoveOption: (optionId: string) => void;
  onUpdateCover: (updates: Partial<NonNullable<PitchDeckSlideV2['decisionCover']>>) => void;
  onRemoveSlide: () => void;
}

export function DecisionSlideEditor({
  slide, slideIndex: _slideIndex, pathGroupSlideCounts,
  onUpdateLabel, onAddOption, onUpdateOption, onRemoveOption, onUpdateCover, onRemoveSlide,
}: DecisionSlideEditorProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-8 space-y-6" style={{ minHeight: '600px' }}>
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
          <span className="material-icons text-2xl text-amber-500">fork_right</span>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">Decision Slide</h3>
          <p className="text-sm text-muted-foreground">Viewers must choose a path to continue</p>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Slide Title</label>
        <input
          type="text"
          value={slide.label || ''}
          onChange={(e) => onUpdateLabel(e.target.value)}
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          placeholder="e.g. Choose your path"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">Options</label>
          <button
            onClick={onAddOption}
            className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80"
          >
            <span className="material-icons text-sm">add</span>
            Add Option
          </button>
        </div>
        {(slide.decisionOptions || []).map((opt) => (
          <div key={opt.id} className="bg-accent/30 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={opt.label}
                  onChange={(e) => onUpdateOption(opt.id, { label: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Option label"
                />
                <input
                  type="text"
                  value={opt.description || ''}
                  onChange={(e) => onUpdateOption(opt.id, { description: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-background border border-border rounded text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Description (optional)"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={opt.icon || ''}
                    onChange={(e) => onUpdateOption(opt.id, { icon: e.target.value })}
                    className="flex-1 px-2.5 py-1.5 bg-background border border-border rounded text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="Material icon name"
                  />
                  <input
                    type="text"
                    value={opt.pathGroup}
                    onChange={(e) => onUpdateOption(opt.id, { pathGroup: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                    className="flex-1 px-2.5 py-1.5 bg-background border border-border rounded text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
                    placeholder="path-group-name"
                  />
                </div>
              </div>
              <button
                onClick={() => onRemoveOption(opt.id)}
                className="p-1 text-muted-foreground hover:text-red-500 transition-colors shrink-0"
              >
                <span className="material-icons text-base">close</span>
              </button>
            </div>
            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
              <span className="material-icons text-xs text-blue-500">route</span>
              {pathGroupSlideCounts[opt.pathGroup] || 0} slide(s) in &quot;{opt.pathGroup}&quot;
            </div>
          </div>
        ))}
      </div>

      <details className="border-t border-border pt-4 group" open={Boolean(slide.decisionCover && Object.values(slide.decisionCover).some(Boolean))}>
        <summary className="cursor-pointer flex items-center justify-between text-sm font-medium text-foreground hover:text-primary transition-colors">
          <span className="inline-flex items-center gap-2">
            <span className="material-icons text-base text-primary">view_column</span>
            Cover-style content (optional)
          </span>
          <span className="material-icons text-base text-muted-foreground group-open:rotate-180 transition-transform">expand_more</span>
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">
          Renders a two-column intro layout (logo, eyebrow, headline + light punchline, body, image) with the decision options as CTA cards. Leave all fields blank to use the default centered grid.
        </p>
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Wordmark</label>
              <input
                type="text"
                value={slide.decisionCover?.wordmark || ''}
                onChange={(e) => onUpdateCover({ wordmark: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="CY STRATEGIES"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Eyebrow</label>
              <input
                type="text"
                value={slide.decisionCover?.eyebrow || ''}
                onChange={(e) => onUpdateCover({ eyebrow: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="MARKETING STRATEGY CONSULTANT"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Headline (bold)</label>
            <input
              type="text"
              value={slide.decisionCover?.headline || ''}
              onChange={(e) => onUpdateCover({ headline: e.target.value })}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="Most companies don't have a marketing problem."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Punchline (light)</label>
            <input
              type="text"
              value={slide.decisionCover?.punchline || ''}
              onChange={(e) => onUpdateCover({ punchline: e.target.value })}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="They have a decision problem."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Intro line</label>
            <input
              type="text"
              value={slide.decisionCover?.intro || ''}
              onChange={(e) => onUpdateCover({ intro: e.target.value })}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="Hi, I'm Cody."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Body</label>
            <textarea
              value={slide.decisionCover?.body || ''}
              onChange={(e) => onUpdateCover({ body: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
              placeholder="I figure out what's actually driving growth, what isn't, and what to do about it."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              About <span className="text-muted-foreground/70">(blank lines split paragraphs)</span>
            </label>
            <textarea
              value={slide.decisionCover?.about || ''}
              onChange={(e) => onUpdateCover({ about: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
              placeholder={"Most companies don't need more marketing.\n\nThis is a quick look at how I think."}
            />
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Image URL (right column)</label>
              <input
                type="text"
                value={slide.decisionCover?.image || ''}
                onChange={(e) => onUpdateCover({ image: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono text-xs"
                placeholder="https://… (headshot)"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Alt</label>
              <input
                type="text"
                value={slide.decisionCover?.imageAlt || ''}
                onChange={(e) => onUpdateCover({ imageAlt: e.target.value })}
                className="w-32 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="Headshot"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Logo URL (above wordmark)</label>
            <input
              type="text"
              value={slide.decisionCover?.logo || ''}
              onChange={(e) => onUpdateCover({ logo: e.target.value })}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono text-xs"
              placeholder="https://… (optional)"
            />
          </div>

          <div className="grid grid-cols-5 gap-2 pt-2 border-t border-border/60">
            {([
              ['backgroundColor', 'BG'],
              ['textColor', 'Text'],
              ['mutedColor', 'Muted'],
              ['softColor', 'Soft'],
              ['accentColor', 'Accent'],
            ] as const).map(([key, label]) => (
              <div key={key}>
                <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wide">{label}</label>
                <input
                  type="text"
                  value={slide.decisionCover?.[key] || ''}
                  onChange={(e) => onUpdateCover({ [key]: e.target.value || undefined })}
                  className="w-full px-2 py-1.5 bg-background border border-border rounded text-[11px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
                  placeholder="#005652"
                />
              </div>
            ))}
          </div>
        </div>
      </details>

      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={onRemoveSlide}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          <span className="material-icons text-base">delete</span>
          Remove
        </button>
      </div>
    </div>
  );
}
