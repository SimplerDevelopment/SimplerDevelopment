'use client';

import { FeaturedProductsBlock } from '@/types/blocks';
import { useEffect, useState } from 'react';
import { getElementCSS } from '@/lib/utils/elementStyles';
import { useBranding } from '@/contexts/BrandingContext';

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

interface FeaturedProductsBlockRenderProps {
  block: FeaturedProductsBlock;
  siteId?: number;
}

export function FeaturedProductsBlockRender({ block, siteId }: FeaturedProductsBlockRenderProps) {
  const branding = useBranding();
  const bs = branding?.buttonStyle;
  const btnRadius = bs?.borderRadius || branding?.borderRadius;
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!siteId) return;

    async function fetchProducts() {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          sort: 'featured',
          limit: String(block.limit || 4),
        });
        const res = await fetch(`/api/storefront/${siteId}/products?${params}`);
        const json = await res.json();
        if (json.success) {
          setProducts(json.data);
        }
      } catch (error) {
        console.error('Error fetching featured products:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchProducts();
  }, [siteId, block.limit]);

  const columnClasses: Record<number, string> = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-2 lg:grid-cols-3',
    4: 'md:grid-cols-2 lg:grid-cols-4',
  };

  function formatPrice(cents: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  }

  return (
    <section>
      <div className="container mx-auto px-4">
        {(block.title || block.description) && (
          <div className="text-center mb-12">
            {block.title && (
              <h2 className="font-heading text-4xl md:text-5xl font-bold mb-4" style={getElementCSS(block.elementStyles, 'title')} dangerouslySetInnerHTML={{ __html: block.title }} />
            )}
            {block.description && (
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto" style={getElementCSS(block.elementStyles, 'description')} dangerouslySetInnerHTML={{ __html: block.description }} />
            )}
          </div>
        )}

        {loading ? (
          <div className={`grid grid-cols-1 ${columnClasses[block.columns || 4]} gap-8`}>
            {[...Array(block.limit || 4)].map((_, i) => (
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
          <div className={`grid grid-cols-1 ${columnClasses[block.columns || 4]} gap-8`}>
            {products.map((product) => (
              <a key={product.id} href={`/shop/${product.slug}`} className="group">
                <div
                  className={`relative h-full border bg-card overflow-hidden transition-all hover:shadow-xl ${!branding?.borderRadius ? 'rounded-lg' : ''}`}
                  style={branding?.borderRadius ? { borderRadius: branding.borderRadius } : undefined}
                >
                  {block.showBadge !== false && (
                    <div className="absolute top-3 left-3 z-10 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full">
                      {block.badgeText || 'Featured'}
                    </div>
                  )}
                  {product.compareAtPrice && product.compareAtPrice > product.price && (
                    <div
                      className="absolute top-3 right-3 z-10 text-white text-xs font-bold px-3 py-1 rounded-full"
                      style={{ backgroundColor: branding?.accentColor || '#ef4444' }}
                    >
                      {Math.round((1 - product.price / product.compareAtPrice) * 100)}% OFF
                    </div>
                  )}
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
                  <div className="p-5">
                    <h3 className="font-semibold text-lg mb-2 group-hover:text-primary transition-colors line-clamp-2">
                      {product.name}
                    </h3>
                    {block.showPrice !== false && (
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xl">{formatPrice(product.price)}</span>
                        {product.compareAtPrice && product.compareAtPrice > product.price && (
                          <span className="text-sm text-muted-foreground line-through">
                            {formatPrice(product.compareAtPrice)}
                          </span>
                        )}
                      </div>
                    )}
                    {block.buttonText && (
                      <button
                        className={`mt-4 w-full px-4 py-2.5 bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors ${!btnRadius ? 'rounded-md' : ''}`}
                        style={{ ...(bs?.primaryBg ? { backgroundColor: bs.primaryBg } : {}), ...(bs?.primaryText ? { color: bs.primaryText } : {}), ...(btnRadius ? { borderRadius: btnRadius } : {}) }}
                      >
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
            <span className="material-icons text-5xl text-muted-foreground/30 mb-4 block">star_border</span>
            <p className="text-xl text-muted-foreground">No featured products yet.</p>
          </div>
        )}
      </div>
    </section>
  );
}
