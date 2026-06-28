'use client';

import { RoiCalculatorBlock } from '@/types/blocks';
import { RoiCalculatorBlockRender } from '@/components/blocks/render/RoiCalculatorBlockRender';

interface RoiCalculatorBlockPreviewProps {
  block: RoiCalculatorBlock;
  isSelected: boolean;
  onChange: (updates: Partial<RoiCalculatorBlock>) => void;
}

export function RoiCalculatorBlockPreview({ block, isSelected }: RoiCalculatorBlockPreviewProps) {
  return <RoiCalculatorBlockRender block={block} />;
}
