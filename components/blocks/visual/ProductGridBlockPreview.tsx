'use client';

import { ProductGridBlock } from '@/types/blocks';

interface ProductGridBlockPreviewProps {
  block: ProductGridBlock;
  isSelected: boolean;
  onChange: (updates: Partial<ProductGridBlock>) => void;
}

const PLACEHOLDER_PRODUCTS = [
  { name: 'Classic T-Shirt', price: '$29.99', comparePrice: '$39.99', category: 'Apparel', image: null },
  { name: 'Running Shoes', price: '$89.99', comparePrice: null, category: 'Footwear', image: null },
  { name: 'Leather Wallet', price: '$49.99', comparePrice: null, category: 'Accessories', image: null },
  { name: 'Wireless Earbuds', price: '$59.99', comparePrice: '$79.99', category: 'Electronics', image: null },
  { name: 'Canvas Backpack', price: '$64.99', comparePrice: null, category: 'Bags', image: null },
  { name: 'Sunglasses', price: '$34.99', comparePrice: '$44.99', category: 'Accessories', image: null },
];

export function ProductGridBlockPreview({ block, isSelected, onChange }: ProductGridBlockPreviewProps) {
  const columnClasses: Record<number, string> = {
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
  };

  const displayProducts = PLACEHOLDER_PRODUCTS.slice(0, block.limit || 6);

  return (
    <div className="py-16 my-8 px-6">
      <div className="text-center mb-12">
        {(block.title || isSelected) && (
          <input
            type="text"
            value={block.title || ''}
            onChange={(e) => onChange({ title: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            className="font-heading text-4xl md:text-5xl font-bold mb-4 w-full bg-transparent border-none focus:outline-none focus:border-b-2 border-primary text-center text-foreground"
            placeholder="Product Grid Title"
          />
        )}
        {(block.description || isSelected) && (
          <input
            type="text"
            value={block.description || ''}
            onChange={(e) => onChange({ description: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            className="text-xl max-w-2xl mx-auto w-full bg-transparent border-none focus:outline-none focus:border-b border-primary/50 text-center text-muted-foreground"
            placeholder="Browse our collection"
          />
        )}
      </div>

      <div className={`grid ${columnClasses[block.columns || 3]} gap-8`}>
        {displayProducts.map((product, i) => (
          <div key={i} className="rounded-lg border bg-card overflow-hidden">
            <div className="aspect-square bg-muted/10 flex items-center justify-center">
              <span className="material-icons text-5xl text-muted-foreground/20">inventory_2</span>
            </div>
            <div className="p-4">
              {block.showCategory && (
                <div className="text-xs font-medium text-primary mb-1">{product.category}</div>
              )}
              <h3 className="font-semibold text-lg mb-1">{product.name}</h3>
              {block.showDescription && (
                <p className="text-sm text-muted-foreground mb-2">Sample product description goes here</p>
              )}
              {block.showPrice !== false && (
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg">{product.price}</span>
                  {product.comparePrice && (
                    <span className="text-sm text-muted-foreground line-through">{product.comparePrice}</span>
                  )}
                </div>
              )}
              {block.buttonText && (
                <div className="mt-3 w-full px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium text-center">
                  {block.buttonText}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground mt-6 italic">
        Preview: Showing placeholder products. Live data loads from your store.
      </p>
    </div>
  );
}
