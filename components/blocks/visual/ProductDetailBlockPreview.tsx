'use client';

import { ProductDetailBlock } from '@/types/blocks';
import { getElementCSS } from '@/lib/utils/elementStyles';

interface ProductDetailBlockPreviewProps {
  block: ProductDetailBlock;
  isSelected: boolean;
  onChange: (updates: Partial<ProductDetailBlock>) => void;
}

export function ProductDetailBlockPreview({ block, isSelected, onChange }: ProductDetailBlockPreviewProps) {
  const layout = block.layout || 'standard';
  const showGallery = block.showGallery !== false;
  const showDescription = block.showDescription !== false;
  const showAddToCart = block.showAddToCart !== false;
  const showBreadcrumb = block.showBreadcrumb !== false;
  const showTags = block.showTags !== false;

  return (
    <section className="py-12 my-4">
      <div className="container mx-auto px-4">
        {/* Product slug input */}
        {isSelected && (
          <div className="mb-6 p-3 bg-muted/30 rounded-lg border border-border">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Product Slug</label>
            <input
              type="text"
              value={block.productSlug || ''}
              onChange={(e) => onChange({ productSlug: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
              placeholder="e.g. dinner-at-the-club"
            />
          </div>
        )}

        {/* Breadcrumb mock */}
        {showBreadcrumb && (
          <nav
            className="flex items-center gap-2 text-sm text-muted-foreground mb-8"
            style={getElementCSS(block.elementStyles, 'breadcrumb')}
          >
            <span className="hover:text-foreground transition-colors">Shop</span>
            <span className="material-icons text-xs">chevron_right</span>
            <span className="hover:text-foreground transition-colors">Category</span>
            <span className="material-icons text-xs">chevron_right</span>
            <span className="text-foreground">
              {block.productSlug
                ? block.productSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                : 'Product Name'}
            </span>
          </nav>
        )}

        <div className={`grid grid-cols-1 ${layout === 'compact' ? 'lg:grid-cols-3 gap-8' : layout === 'wide' ? 'gap-10' : 'lg:grid-cols-2 gap-10'}`}>
          {/* Image placeholder */}
          {showGallery && (
            <div style={getElementCSS(block.elementStyles, 'gallery')}>
              <div className="aspect-square rounded-xl bg-muted/10 border border-border flex items-center justify-center relative overflow-hidden">
                <span className="material-icons text-7xl text-muted-foreground/15">inventory_2</span>
                <div
                  className="absolute top-4 left-4 bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full"
                  style={getElementCSS(block.elementStyles, 'badge')}
                >
                  12% OFF
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className={`w-20 h-20 rounded-lg bg-muted/10 border-2 ${i === 1 ? 'border-primary' : 'border-border'}`} />
                ))}
              </div>
            </div>
          )}

          {/* Product info placeholder */}
          <div className={`space-y-5 ${layout === 'compact' ? 'lg:col-span-2' : ''}`}>
            <div className="text-sm font-medium text-primary">Category</div>
            <div className="text-3xl font-bold" style={getElementCSS(block.elementStyles, 'productName')}>
              {block.productSlug
                ? block.productSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                : 'Product Name'}
            </div>

            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold" style={getElementCSS(block.elementStyles, 'price')}>
                $35.00
              </span>
              <span
                className="text-lg text-muted-foreground line-through"
                style={getElementCSS(block.elementStyles, 'comparePrice')}
              >
                $40.00
              </span>
            </div>

            <p
              className="text-lg text-muted-foreground"
              style={getElementCSS(block.elementStyles, 'shortDescription')}
            >
              Product description will appear here based on data from the store.
            </p>

            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
              <span className="text-sm font-medium text-green-700 dark:text-green-400">In Stock</span>
            </div>

            {block.showVariants !== false && (
              <div className="border-t border-border pt-5">
                <div
                  className="text-sm font-semibold mb-2"
                  style={getElementCSS(block.elementStyles, 'optionLabel')}
                >
                  Size
                </div>
                <div className="flex gap-2">
                  {['Small', 'Medium', 'Large'].map((s, i) => (
                    <div
                      key={s}
                      className={`px-4 py-2 text-sm font-medium rounded-lg border ${i === 0 ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-foreground'}`}
                      style={getElementCSS(block.elementStyles, 'optionButton')}
                    >
                      {s}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {showAddToCart && (
              <div className="border-t border-border pt-5">
                <div
                  className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-primary text-primary-foreground text-lg font-semibold rounded-xl"
                  style={getElementCSS(block.elementStyles, 'addToCartButton')}
                >
                  <span className="material-icons text-xl">shopping_cart</span>
                  Add to Cart — $35.00
                </div>
              </div>
            )}

            {showTags && (
              <div
                className="border-t border-border pt-5 flex items-center gap-2 flex-wrap text-sm text-muted-foreground"
                style={getElementCSS(block.elementStyles, 'sku')}
              >
                <span className="font-medium text-foreground">Tags:</span>
                {['cookbook', 'italian', 'recipes'].map(tag => (
                  <span key={tag} className="px-2 py-0.5 bg-muted rounded-full text-xs">{tag}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {showDescription && (
          <div className="mt-12 border-t border-border pt-8">
            <h3 className="text-2xl font-bold mb-4" style={getElementCSS(block.elementStyles, 'sectionTitle')}>
              Description
            </h3>
            <div className="space-y-2 text-muted-foreground">
              <div className="h-4 bg-muted/20 rounded w-full" />
              <div className="h-4 bg-muted/20 rounded w-5/6" />
              <div className="h-4 bg-muted/20 rounded w-4/6" />
            </div>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground mt-8 italic">
          Preview: Showing placeholder for product "{block.productSlug || '(none)'}". Live data loads from store.
        </p>
      </div>
    </section>
  );
}
