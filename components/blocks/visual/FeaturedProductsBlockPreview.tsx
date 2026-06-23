'use client';

import { FeaturedProductsBlock } from '@/types/blocks';
import { RichTextEditable } from './RichTextEditable';
import { getElementCSS } from '@/lib/utils/elementStyles';

interface FeaturedProductsBlockPreviewProps {
  block: FeaturedProductsBlock;
  isSelected: boolean;
  onChange: (updates: Partial<FeaturedProductsBlock>) => void;
}

const PLACEHOLDER_PRODUCTS = [
  { name: 'Premium Headphones', price: '$199.99', comparePrice: '$249.99', discount: '20%' },
  { name: 'Smart Watch Pro', price: '$299.99', comparePrice: '$349.99', discount: '14%' },
  { name: 'Designer Sneakers', price: '$149.99', comparePrice: null, discount: null },
  { name: 'Organic Skincare Set', price: '$79.99', comparePrice: '$99.99', discount: '20%' },
];

export function FeaturedProductsBlockPreview({ block, isSelected, onChange }: FeaturedProductsBlockPreviewProps) {
  const columnClasses: Record<number, string> = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-2 lg:grid-cols-3',
    4: 'md:grid-cols-2 lg:grid-cols-4',
  };

  const displayProducts = PLACEHOLDER_PRODUCTS.slice(0, block.limit || 4);
  const titleStyle = getElementCSS(block.elementStyles, 'title');
  const descriptionStyle = getElementCSS(block.elementStyles, 'description');

  return (
    <section className="py-16 my-8">
      <div className="container mx-auto px-4">
        {(block.title || block.description || isSelected) && (
          <div className="text-center mb-12">
            {(block.title || isSelected) && (
              <RichTextEditable
                html={block.title || ''}
                onChange={(html) => onChange({ title: html })}
                className="font-heading text-4xl md:text-5xl font-bold mb-4 w-full bg-transparent border-none focus:outline-none focus:border-b-2 border-primary text-center text-foreground"
                placeholder="Featured Products"
                singleLine={true}
                toolbar={true}
                style={titleStyle}
              />
            )}
            {(block.description || isSelected) && (
              <RichTextEditable
                html={block.description || ''}
                onChange={(html) => onChange({ description: html })}
                className="text-xl text-muted-foreground max-w-2xl mx-auto w-full bg-transparent border-none focus:outline-none text-center"
                placeholder="Our top picks just for you"
                singleLine={true}
                toolbar={true}
                style={descriptionStyle}
              />
            )}
          </div>
        )}

        <div className={`grid grid-cols-1 ${columnClasses[block.columns || 4]} gap-8`}>
          {displayProducts.map((product, i) => (
            <div key={i} className="relative h-full rounded-lg border bg-card overflow-hidden transition-all hover:shadow-xl">
              {block.showBadge !== false && (
                <div className="absolute top-3 left-3 z-10 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full">
                  {block.badgeText || 'Featured'}
                </div>
              )}
              {product.discount && (
                <div className="absolute top-3 right-3 z-10 bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                  {product.discount} OFF
                </div>
              )}
              <div className="aspect-square overflow-hidden bg-muted/10 flex items-center justify-center">
                <span className="material-icons text-5xl text-muted-foreground/20">star</span>
              </div>
              <div className="p-5">
                <h3 className="font-semibold text-lg mb-2 line-clamp-2">{product.name}</h3>
                {block.showPrice !== false && (
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xl">{product.price}</span>
                    {product.comparePrice && (
                      <span className="text-sm text-muted-foreground line-through">{product.comparePrice}</span>
                    )}
                  </div>
                )}
                {block.buttonText && (
                  <div className="mt-4 w-full px-4 py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium text-center">
                    {block.buttonText}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6 italic">
          Preview: Showing placeholder products. Live data loads featured items from your store.
        </p>
      </div>
    </section>
  );
}
