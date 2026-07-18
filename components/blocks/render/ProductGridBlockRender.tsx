'use client';

import { ProductGridBlock } from '@/types/blocks';
import { useEffect, useState } from 'react';
import { getElementCSS } from '@/lib/utils/elementStyles';
import { sanitizeRichHtml } from '@/lib/security/sanitize-html';
import { formatMoney } from '@/lib/utils/money';

interface Product {
  id: number;
  name: string;
  slug: string;
  shortDescription: string | null;
  price: number;
  compareAtPrice: number | null;
  featured: boolean;
  image: string | null;
  categoryName: string | null;
}

interface ProductGridBlockRenderProps {
  block: ProductGridBlock;
  siteId?: number;
}

export function ProductGridBlockRender({ block, siteId }: ProductGridBlockRenderProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!siteId) return;

    async function fetchProducts() {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (block.categorySlug) params.set('category', block.categorySlug);
        if (block.sort) params.set('sort', block.sort);
        if (block.limit) params.set('limit', String(block.limit));

        const res = await fetch(`/api/storefront/${siteId}/products?${params}`);
        const json = await res.json();
        if (json.success) {
          setProducts(json.data);
        }
      } catch (error) {
        console.error('Error fetching products:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchProducts();
  }, [siteId, block.categorySlug, block.sort, block.limit]);

  const columnClasses: Record<number, string> = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-2 lg:grid-cols-3',
    4: 'md:grid-cols-2 lg:grid-cols-4',
  };

  return (
    <section>
      <div className="container mx-auto px-4">
        {(block.title || block.description) && (
          <div className="text-center mb-12">
            {block.title && (
              <h2 className="font-heading text-4xl md:text-5xl font-bold mb-4" style={getElementCSS(block.elementStyles, 'title')} dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(block.title) }} />
            )}
            {block.description && (
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto" style={getElementCSS(block.elementStyles, 'description')} dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(block.description) }} />
            )}
          </div>
        )}

        {loading ? (
          <div className={`grid grid-cols-1 ${columnClasses[block.columns || 3]} gap-8`}>
            {[...Array(block.limit || 6)].map((_, i) => (
              <div key={i} className="border border-border rounded-lg overflow-hidden bg-card animate-pulse">
                <div className="aspect-square bg-muted/30" />
                <div className="p-4">
                  <div className="h-4 bg-muted/50 rounded mb-2 w-3/4" />
                  <div className="h-3 bg-muted/30 rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : products.length > 0 ? (
          <div className={`grid grid-cols-1 ${columnClasses[block.columns || 3]} gap-8`}>
            {products.map((product) => (
              <a key={product.id} href={`/shop/${product.slug}`} className="group">
                <div className="h-full rounded-lg border bg-card overflow-hidden transition-all hover:shadow-lg">
                  <div className="aspect-square overflow-hidden bg-muted/10">
                    {product.image ? (
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="material-icons text-5xl text-muted-foreground/30">inventory_2</span>
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    {block.showCategory && product.categoryName && (
                      <div className="text-xs font-medium text-primary mb-1">{product.categoryName}</div>
                    )}
                    <h3 className="font-semibold text-lg mb-1 group-hover:text-primary transition-colors line-clamp-2">
                      {product.name}
                    </h3>
                    {block.showDescription && product.shortDescription && (
                      <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{product.shortDescription}</p>
                    )}
                    {block.showPrice !== false && (
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-lg">{formatMoney(product.price)}</span>
                        {product.compareAtPrice && product.compareAtPrice > product.price && (
                          <span className="text-sm text-muted-foreground line-through">
                            {formatMoney(product.compareAtPrice)}
                          </span>
                        )}
                      </div>
                    )}
                    {block.buttonText && (
                      <button className="mt-3 w-full px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
                        {block.buttonText}
                      </button>
                    )}
                  </div>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <span className="material-icons text-5xl text-muted-foreground/30 mb-4 block">storefront</span>
            <p className="text-xl text-muted-foreground">No products available.</p>
          </div>
        )}
      </div>
    </section>
  );
}
