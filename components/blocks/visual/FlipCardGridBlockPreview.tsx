'use client';

import { FlipCardGridBlock } from '@/types/blocks';
import { FlipCardGridBlockRender } from '@/components/blocks/render/FlipCardGridBlockRender';

interface FlipCardGridBlockPreviewProps {
  block: FlipCardGridBlock;
  isSelected: boolean;
  onChange: (updates: Partial<FlipCardGridBlock>) => void;
}

export function FlipCardGridBlockPreview({ block, isSelected }: FlipCardGridBlockPreviewProps) {
  if (!block.cards || block.cards.length === 0) {
    return (
      <div className="py-16 px-6 text-center border-2 border-dashed border-border rounded-lg">
        <div className="text-sm text-muted-foreground mb-2">Flip Card Grid</div>
        <div className="text-xs text-muted-foreground">
          {isSelected ? 'Add cards in the side panel to see them here.' : 'No cards yet — click to select and add cards.'}
        </div>
      </div>
    );
  }
  // In the editor we re-use the production renderer for pixel-perfect parity, but disable the
  // hover-flip interaction (`group-hover:[transform:rotateY(180deg)]`) — it would fire while the user is
  // hovering to select/resize a card and break the editing experience. Click-trigger mode is left intact.
  // Production behavior (hover) is preserved on the live site via the renderer's own arbitrary class.
  return (
    <div className="pc-flipcard-editor-preview">
      <style jsx>{`
        .pc-flipcard-editor-preview :global(.group:hover) > div[style*='preserve-3d'] {
          transform: none !important;
        }
      `}</style>
      <FlipCardGridBlockRender block={block} />
      {block.flipTrigger !== 'click' && (
        <div className="text-center text-xs text-muted-foreground -mt-8 pb-4">
          <span className="material-icons text-sm align-middle mr-1">touch_app</span>
          Hover-flip preview disabled in editor — cards flip on hover in production.
        </div>
      )}
    </div>
  );
}
