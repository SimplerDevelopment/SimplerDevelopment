'use client';

import { ProductCategoriesBlock } from '@/types/blocks';
import { getElementCSS } from '@/lib/utils/elementStyles';
import { useEffect, useState } from 'react';

interface Category {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  productCount: number;
}

interface ProductCategoriesBlockRenderProps {
  block: ProductCategoriesBlock;
  siteId?: number;
}

export function ProductCategoriesBlockRender({ block, siteId }: ProductCategoriesBlockRenderProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!siteId) return;

    async function fetchCategories() {
      try {
        setLoading(true);
        const res = await fetch(`/api/storefront/${siteId}/categories`);
        const json = await res.json();
        if (json.success) {
          setCategories(json.data);
        }
      } catch (error) {
        console.error('Error fetching categories:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchCategories();
  }, [siteId]);

  const columnClasses: Record<number, string> = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-2 lg:grid-cols-3',
    4: 'md:grid-cols-2 lg:grid-cols-4',
  };

  if (block.layout === 'list') {
    return (
      <section className="py-16 my-8">
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
          <div className="max-w-2xl mx-auto space-y-3">
            {loading ? (
              [...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4 border border-border rounded-lg animate-pulse">
                  <div className="w-16 h-16 bg-muted/30 rounded" />
                  <div className="flex-1">
                    <div className="h-4 bg-muted/50 rounded mb-1 w-1/3" />
                    <div className="h-3 bg-muted/30 rounded w-1/4" />
                  </div>
                </div>
              ))
            ) : (
              categories.map((cat) => (
                <a
                  key={cat.id}
                  href={`/shop?category=${cat.slug}`}
                  className="flex items-center gap-4 p-4 border border-border rounded-lg hover:shadow-md transition-all group"
                >
                  {block.showImage !== false && cat.image && (
                    <img src={cat.image} alt={cat.name} className="w-16 h-16 object-cover rounded" />
                  )}
                  <div className="flex-1">
                    <h3 className="font-semibold group-hover:text-primary transition-colors">{cat.name}</h3>
                    {cat.description && (
                      <p className="text-sm text-muted-foreground line-clamp-1">{cat.description}</p>
                    )}
                  </div>
                  {block.showProductCount !== false && (
                    <span className="text-sm text-muted-foreground">{cat.productCount} products</span>
                  )}
                </a>
              ))
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16 my-8">
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
          <div className={`grid grid-cols-1 ${columnClasses[block.columns || 3]} gap-8`}>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="border border-border rounded-lg overflow-hidden bg-card animate-pulse">
                <div className="aspect-[4/3] bg-muted/30" />
                <div className="p-4">
                  <div className="h-4 bg-muted/50 rounded mb-1 w-2/3" />
                  <div className="h-3 bg-muted/30 rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : categories.length > 0 ? (
          <div className={`grid grid-cols-1 ${columnClasses[block.columns || 3]} gap-8`}>
            {categories.map((cat) => (
              <a key={cat.id} href={`/shop?category=${cat.slug}`} className="group">
                <div className="rounded-lg border bg-card overflow-hidden transition-all hover:shadow-lg">
                  {block.showImage !== false && (
                    <div className="aspect-[4/3] overflow-hidden bg-muted/10">
                      {cat.image ? (
                        <img
                          src={cat.image}
                          alt={cat.name}
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="material-icons text-5xl text-muted-foreground/30">category</span>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="p-4 text-center">
                    <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">
                      {cat.name}
                    </h3>
                    {block.showProductCount !== false && (
                      <p className="text-sm text-muted-foreground mt-1">{cat.productCount} products</p>
                    )}
                  </div>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <span className="material-icons text-5xl text-muted-foreground/30 mb-4 block">category</span>
            <p className="text-xl text-muted-foreground">No categories available.</p>
          </div>
        )}
      </div>
    </section>
  );
}
