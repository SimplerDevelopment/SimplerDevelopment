/** Center pane for non-survey/non-decision slides — AI prompt, speaker notes, VisualEditorShell with brand-defaults-aware add-block. */
'use client';

import type { FormEvent, ReactNode } from 'react';
import { VisualEditorShell } from '@/components/portal/VisualEditorShell';
import { findBlockById, removeBlockById } from '@/lib/utils/blockHelpers';
import { applyBrandDefaults, type BrandDefaultsContext } from '@/lib/branding/block-defaults';
import type { Block, BlockType } from '@/types/blocks';
import type { PitchDeckSlideV2, PitchDeckTheme } from '@/lib/db/schema';
import { buildSlidePreviewSrc } from '../_lib/api';

const PITCH_DECK_EXTRA_BLOCKS = [
  { type: 'deck-next-slide' as const, label: 'Next Slide', icon: 'arrow_forward', category: 'Pitch Deck', description: 'Button that advances to the next slide' },
  { type: 'deck-jump-to' as const, label: 'Jump To Slide', icon: 'shortcut', category: 'Pitch Deck', description: 'Button that jumps to a specific slide' },
];

export interface SlideContentEditorProps {
  deckId: string;
  slide: PitchDeckSlideV2;
  slideIndex: number;
  theme: PitchDeckTheme;
  brandingProfileId: number | null;
  brandDefaults: BrandDefaultsContext | null;
  iframeViewport: 'desktop' | 'tablet' | 'mobile';
  editorMode: 'preview' | 'edit';
  editorLeftCollapsed: boolean;
  editorRightCollapsed: boolean;
  slidePrompt: string;
  slideGenerating: boolean;
  noSelectionPanel: ReactNode;

  onSlidePromptChange: (v: string) => void;
  onSubmitSlidePrompt: (e: FormEvent) => void;
  onChangeNotes: (notes: string) => void;
  onBlocksChange: (blocks: Block[]) => void;
  onSetEditorLeftCollapsed: (v: boolean) => void;
  onSetEditorRightCollapsed: (v: boolean) => void;
}

export function SlideContentEditor({
  deckId, slide, slideIndex: _slideIndex, theme, brandingProfileId, brandDefaults,
  iframeViewport, editorMode, editorLeftCollapsed, editorRightCollapsed,
  slidePrompt, slideGenerating, noSelectionPanel,
  onSlidePromptChange, onSubmitSlidePrompt, onChangeNotes, onBlocksChange,
  onSetEditorLeftCollapsed, onSetEditorRightCollapsed,
}: SlideContentEditorProps) {
  return (
    <>
      <form onSubmit={onSubmitSlidePrompt} className="flex items-center gap-2">
        <div className="flex-1 relative">
          <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-lg">auto_awesome</span>
          <input
            type="text"
            value={slidePrompt}
            onChange={(e) => onSlidePromptChange(e.target.value)}
            placeholder="Edit this slide with AI... e.g. 'Make it more concise' or 'Add competitor comparison'"
            className="w-full pl-10 pr-3 py-2.5 bg-card border border-border rounded-lg text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            disabled={slideGenerating}
          />
        </div>
        <button
          type="submit"
          disabled={slideGenerating || !slidePrompt.trim()}
          className="px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50 shrink-0"
        >
          {slideGenerating ? (
            <span className="material-icons animate-spin text-base">autorenew</span>
          ) : (
            'Edit'
          )}
        </button>
      </form>

      <details className="group">
        <summary className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors select-none">
          <span className="material-icons text-sm transition-transform group-open:rotate-90">chevron_right</span>
          <span className="material-icons text-sm">speaker_notes</span>
          Speaker Notes
          {slide.notes && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
        </summary>
        <textarea
          value={slide.notes || ''}
          onChange={(e) => onChangeNotes(e.target.value)}
          placeholder="Add speaker notes for this slide..."
          className="mt-2 w-full h-24 px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground resize-y focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </details>

      <div className="rounded-xl overflow-hidden [&>div]:!h-[calc(100vh-180px)]" style={{ minHeight: '600px' }}>
        <VisualEditorShell
          key={`shell-${slide.id}-${editorMode}`}
          blocks={slide.blocks}
          selectedBlockId={null}
          viewport={iframeViewport}
          previewMode={editorMode === 'preview'}
          initialZoom={60}
          leftCollapsed={editorLeftCollapsed}
          rightCollapsed={editorRightCollapsed}
          onLeftCollapsedChange={onSetEditorLeftCollapsed}
          onRightCollapsedChange={onSetEditorRightCollapsed}
          iframeSrc={buildSlidePreviewSrc({
            id: deckId,
            editorMode,
            slidePageSettings: slide.pageSettings as Record<string, unknown> | undefined,
            theme,
            brandingProfileId,
          })}
          onBlocksChange={(blocks: Block[]) => onBlocksChange(blocks)}
          onSelectBlock={() => {}}
          onAddBlock={(type: string) => {
            const uid = `block-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            let newBlock = {
              id: uid,
              type: type as BlockType,
              order: slide.blocks.length + 1,
              ...(type === 'text' && { content: 'New text...' }),
              ...(type === 'heading' && { content: 'New heading', level: 2 }),
              ...(type === 'hero' && { title: 'Hero Title' }),
              ...(type === 'cta' && { title: 'Call to Action', primaryButtonText: 'Learn More', primaryButtonUrl: '#' }),
              ...(type === 'columns' && { columns: [
                { id: `col-${Date.now()}-1`, width: 50, blocks: [] },
                { id: `col-${Date.now()}-2`, width: 50, blocks: [] },
              ], gap: 'md' }),
              ...(type === 'tabs' && { tabs: [
                { id: `tab-${Date.now()}-1`, label: 'Tab 1', blocks: [] },
                { id: `tab-${Date.now()}-2`, label: 'Tab 2', blocks: [] },
              ] }),
              ...(type === 'section' && { blocks: [] }),
              ...(type === 'accordion' && { items: [{ id: `item-${Date.now()}-1`, title: 'Item 1', content: '' }] }),
              ...(type === 'deck-next-slide' && { text: 'Next Slide', variant: 'primary', size: 'md', alignment: 'center' }),
              ...(type === 'deck-jump-to' && { text: 'Jump To', targetSlide: 1, variant: 'secondary', size: 'md', alignment: 'center' }),
            } as Block;
            if (brandDefaults) newBlock = applyBrandDefaults(newBlock, brandDefaults);
            onBlocksChange([...slide.blocks, newBlock]);
          }}
          onDeleteBlock={(blockId: string) => {
            const block = findBlockById(slide.blocks, blockId);
            if (block?.required) return;
            onBlocksChange(removeBlockById(slide.blocks, blockId));
          }}
          onUpdateBlock={(blockId: string, updates: Partial<Block>) => {
            onBlocksChange(slide.blocks.map(b => b.id === blockId ? { ...b, ...updates } as Block : b));
          }}
          siteId={undefined}
          extraBlockTypes={PITCH_DECK_EXTRA_BLOCKS}
          allowIframeScroll
          noSelectionPanel={noSelectionPanel}
        />
      </div>
    </>
  );
}
