// Body editor wrapper: routes between BlockEditor (classic) and EditorWithPreview (visual).
'use client';

import { BlockEditor } from '@/components/blocks/BlockEditor';
import { EditorWithPreview } from '@/components/blocks/EditorWithPreview';
import type { Block, BlockType } from '@/types/blocks';
import type { BrandDefaultsContext } from '@/lib/branding/block-defaults';

interface BodySectionProps {
  editorMode: 'visual' | 'classic';
  blocks: Block[];
  setBlocks: (blocks: Block[]) => void;
  blockTypes: Array<{ type: BlockType; label: string; icon: string; category: string; description: string }>;
  brandDefaults?: BrandDefaultsContext;
}

export function BodySection({ editorMode, blocks, setBlocks, blockTypes, brandDefaults }: BodySectionProps) {
  return (
    <div className="bg-card border border-border shadow rounded-lg">
      <div className="p-6">
        {editorMode === 'visual' ? (
          <EditorWithPreview
            onChange={(newBlocks) => setBlocks(newBlocks)}
            blockTypes={blockTypes}
            brandDefaults={brandDefaults}
          />
        ) : (
          <BlockEditor blocks={blocks} onChange={setBlocks} brandDefaults={brandDefaults} />
        )}
      </div>
    </div>
  );
}
