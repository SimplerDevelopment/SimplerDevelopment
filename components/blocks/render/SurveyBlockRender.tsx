'use client';

import { SurveyBlock } from '@/types/blocks';
import { getElementCSS } from '@/lib/utils/elementStyles';

interface SurveyBlockRenderProps {
  block: SurveyBlock;
}

export function SurveyBlockRender({ block }: SurveyBlockRenderProps) {
  if (!block.slug) {
    return (
      <div className="p-8 text-center text-muted-foreground border border-dashed rounded-lg">
        <span className="material-icons text-4xl mb-2 block">assignment</span>
        <p>No survey selected</p>
      </div>
    );
  }

  const height = block.height || '700px';

  return (
    <div>
      {block.title && (
        <h2
          className="text-2xl font-bold mb-2"
          style={getElementCSS(block.elementStyles, 'title')}
          data-editable-field="title"
        >
          {block.title}
        </h2>
      )}
      {block.description && (
        <p
          className="text-muted-foreground mb-4"
          style={getElementCSS(block.elementStyles, 'description')}
          data-editable-field="description"
        >
          {block.description}
        </p>
      )}
      <iframe
        src={`/s/${block.slug}?embed=1${block.showPageTitle === false ? '&hideTitle=1' : ''}`}
        width="100%"
        height={height}
        style={{ border: 'none', borderRadius: '0.5rem' }}
        title={block.title || 'Take a Survey'}
        loading="lazy"
      />
    </div>
  );
}
