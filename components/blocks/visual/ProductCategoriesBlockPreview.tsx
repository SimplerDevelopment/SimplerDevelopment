'use client';

import { ProductCategoriesBlock } from '@/types/blocks';
import { RichTextEditable } from './RichTextEditable';
import { getElementCSS } from '@/lib/utils/elementStyles';

interface ProductCategoriesBlockPreviewProps {
  block: ProductCategoriesBlock;
  isSelected: boolean;
  onChange: (updates: Partial<ProductCategoriesBlock>) => void;
}

const PLACEHOLDER_CATEGORIES = [
  { name: 'Clothing', count: 24 },
  { name: 'Accessories', count: 18 },
  { name: 'Electronics', count: 12 },
  { name: 'Home & Living', count: 9 },
];

export function ProductCategoriesBlockPreview({ block, isSelected, onChange }: ProductCategoriesBlockPreviewProps) {
  const columnClasses: Record<number, string> = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-2 lg:grid-cols-3',
    4: 'md:grid-cols-2 lg:grid-cols-4',
  };

  const titleStyle = getElementCSS(block.elementStyles, 'title');
  const descriptionStyle = getElementCSS(block.elementStyles, 'description');

  const titleAndDescription = (
    <>
      {(block.title || isSelected) && (
        <RichTextEditable
          html={block.title || ''}
          onChange={(html) => onChange({ title: html })}
          className="font-heading text-4xl md:text-5xl font-bold mb-4 w-full bg-transparent border-none focus:outline-none focus:border-b-2 border-primary text-center text-foreground"
          placeholder="Shop by Category"
          singleLine={true}
          toolbar={true}
          style={titleStyle}
        />
      )}
      {(block.description || isSelected) && (
        <RichTextEditable
          html={block.description || ''}
          onChange={(html) => onChange({ description: html })}
          className="text-xl max-w-2xl mx-auto w-full bg-transparent border-none focus:outline-none text-center text-muted-foreground"
          placeholder="Browse our collections"
          singleLine={true}
          toolbar={true}
          style={descriptionStyle}
        />
      )}
    </>
  );

  if (block.layout === 'list') {
    return (
      <section className="py-16 my-8">
        <div className="container mx-auto px-4">
          {(block.title || block.description || isSelected) && (
            <div className="text-center mb-12">{titleAndDescription}</div>
          )}
          <div className="max-w-2xl mx-auto space-y-3">
            {PLACEHOLDER_CATEGORIES.map((cat, i) => (
              <div key={i} className="flex items-center gap-4 p-4 border border-border rounded-lg transition-all hover:shadow-md">
                {block.showImage !== false && (
                  <div className="w-16 h-16 bg-muted/10 rounded flex items-center justify-center flex-shrink-0">
                    <span className="material-icons text-muted-foreground/30">category</span>
                  </div>
                )}
                <div className="flex-1">
                  <h3 className="font-semibold">{cat.name}</h3>
                </div>
                {block.showProductCount !== false && (
                  <span className="text-sm text-muted-foreground">{cat.count} products</span>
                )}
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-muted-foreground mt-6 italic">
            Preview: Showing placeholder categories. Live data loads from your store.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16 my-8">
      <div className="container mx-auto px-4">
        {(block.title || block.description || isSelected) && (
          <div className="text-center mb-12">{titleAndDescription}</div>
        )}

        <div className={`grid grid-cols-1 ${columnClasses[block.columns || 3]} gap-8`}>
          {PLACEHOLDER_CATEGORIES.map((cat, i) => (
            <div key={i} className="rounded-lg border bg-card overflow-hidden transition-all hover:shadow-lg">
              {block.showImage !== false && (
                <div className="aspect-[4/3] overflow-hidden bg-muted/10 flex items-center justify-center">
                  <span className="material-icons text-5xl text-muted-foreground/20">category</span>
                </div>
              )}
              <div className="p-4 text-center">
                <h3 className="font-semibold text-lg">{cat.name}</h3>
                {block.showProductCount !== false && (
                  <p className="text-sm text-muted-foreground mt-1">{cat.count} products</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6 italic">
          Preview: Showing placeholder categories. Live data loads from your store.
        </p>
      </div>
    </section>
  );
}
