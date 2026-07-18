'use client';

import type { SurveyInputBlock } from '@/types/blocks';
import { SurveyInputPreview } from '@/components/blocks/visual/SurveyInputBlockPreview';

export function SurveyInputBlockRender({ block }: { block: SurveyInputBlock }) {
  return (
    <SurveyInputPreview
      fieldType={block.fieldType}
      placeholder={block.placeholder}
      options={block.options}
      min={block.min}
      max={block.max}
      step={block.step}
    />
  );
}
