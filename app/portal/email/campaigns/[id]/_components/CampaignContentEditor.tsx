'use client';
// Extracted verbatim from app/portal/email/campaigns/[id]/page.tsx (PUX-175) — the page is pinned at 522 code lines.

import type { Block, BlockType } from '@/types/blocks';
import { VisualEditorShell } from '@/components/portal/VisualEditorShell';
import { EmailPreviewPane } from '@/components/email/EmailPreviewPane';
import { removeBlockById } from '@/lib/utils/blockHelpers';
import { applyBrandDefaults, type BrandDefaultsContext } from '@/lib/branding/block-defaults';
import { EmailFieldFocusIndicator } from './EmailFieldFocusIndicator';
import type { EmailPresenceApi } from './EmailCollaborationProvider';
import type { Campaign } from './campaign-types';
import { pBtnPrimary, pBtnGhost } from '@/components/portal/portal-ui';

const inputClass = 'w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15';

export function CampaignContentEditor({
  campaign,
  editForm,
  setEditForm,
  editBlocks,
  onBlocksChange,
  editError,
  editSaving,
  onSave,
  onCancel,
  showPreview,
  hasBlockContent,
  brandDefaults,
  presence,
}: {
  campaign: Campaign;
  editForm: { subject: string; previewText: string; htmlContent: string };
  setEditForm: React.Dispatch<React.SetStateAction<{ subject: string; previewText: string; htmlContent: string }>>;
  editBlocks: Block[];
  onBlocksChange: (next: Block[]) => void;
  editError: string;
  editSaving: boolean;
  onSave: (e: React.FormEvent) => void;
  onCancel: () => void;
  showPreview: boolean;
  hasBlockContent: boolean;
  brandDefaults: BrandDefaultsContext | null;
  presence: EmailPresenceApi;
}) {
  return (
    <div>
      <div className="p-5 space-y-4">
        {editError && <p className="text-sm text-red-600">{editError}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Subject *</label>
            <EmailFieldFocusIndicator fieldPath="subject">
              <input
                required
                value={editForm.subject}
                onChange={e => setEditForm(p => ({ ...p, subject: e.target.value }))}
                onFocus={() => presence.setFocusedField('subject')}
                onBlur={() => presence.setFocusedField(null)}
                className={inputClass}
              />
            </EmailFieldFocusIndicator>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Preview Text</label>
            <EmailFieldFocusIndicator fieldPath="previewText">
              <input
                value={editForm.previewText}
                onChange={e => setEditForm(p => ({ ...p, previewText: e.target.value }))}
                onFocus={() => presence.setFocusedField('previewText')}
                onBlur={() => presence.setFocusedField(null)}
                className={inputClass}
              />
            </EmailFieldFocusIndicator>
          </div>
        </div>
      </div>

      {hasBlockContent ? (
        <div className={showPreview ? 'flex flex-col md:flex-row gap-4 p-4' : 'p-4'}>
          <div className={`${showPreview ? 'flex-1 min-w-0' : 'w-full'}`}>
            <div className="rounded-xl overflow-hidden [&>div]:!h-[calc(100vh-340px)]" style={{ minHeight: '500px' }}>
              <VisualEditorShell
                key={`email-edit-${campaign.id}`}
                blocks={editBlocks}
                selectedBlockId={null}
                viewport="desktop"
                previewMode={false}
                initialZoom={100}
                iframeSrc="/portal/email/editor-preview?_edit=true"
                onBlocksChange={onBlocksChange}
                onSelectBlock={(blockId) => {
                  presence.setSelection(blockId ? { blockId } : null);
                }}
                onAddBlock={(type: string) => {
                  const id = `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                  let newBlock = { id, type: type as BlockType, order: editBlocks.length + 1, content: type === 'text' ? 'New text...' : type === 'heading' ? 'New heading' : undefined, level: type === 'heading' ? 2 : undefined } as Block;
                  if (brandDefaults) newBlock = applyBrandDefaults(newBlock, brandDefaults);
                  onBlocksChange([...editBlocks, newBlock]);
                }}
                onDeleteBlock={(blockId: string) => onBlocksChange(removeBlockById(editBlocks, blockId))}
                onUpdateBlock={(blockId: string, updates: Partial<Block>) => onBlocksChange(editBlocks.map(b => b.id === blockId ? { ...b, ...updates } as Block : b))}
                siteId={undefined}
              />
            </div>
          </div>
          {showPreview && (
            <div className="w-full sm:w-[380px] shrink-0 bg-card border border-border rounded-xl overflow-hidden" style={{ height: 'calc(100vh - 340px)' }}>
              <EmailPreviewPane blocks={editBlocks} />
            </div>
          )}
        </div>
      ) : (
        <div className="p-5 pt-0">
          <label className="block text-sm font-medium text-foreground mb-1">HTML Content *</label>
          <textarea required value={editForm.htmlContent} onChange={e => setEditForm(p => ({ ...p, htmlContent: e.target.value }))}
            rows={16} className={`${inputClass} font-mono text-xs`} />
        </div>
      )}

      <div className="flex gap-2 p-5 pt-0">
        <button type="button" onClick={onSave} disabled={editSaving}
          className={`${pBtnPrimary} disabled:opacity-50`}>
          {editSaving ? 'Saving...' : 'Save Changes'}
        </button>
        <button type="button" onClick={onCancel}
          className={pBtnGhost}>
          Cancel
        </button>
      </div>
    </div>
  );
}
