'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
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

interface Category {
  id: number;
  name: string;
  slug: string;
  productCount: number;
}

interface ShopPageProps {
  siteId: number;
}

export function ShopPage({ siteId }: ShopPageProps) {
  const searchParams = useSearchParams();
  const categoryFilter = searchParams.get('category') || '';
  const searchFilter = searchParams.get('search') || '';
  const sortFilter = searchParams.get('sort') || 'newest';

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });

  const [search, setSearch] = useState(searchFilter);
  const [sort, setSort] = useState(sortFilter);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (categoryFilter) params.set('category', categoryFilter);
        if (searchFilter) params.set('search', searchFilter);
        params.set('sort', sortFilter);
        params.set('limit', '24');

        const [productsRes, categoriesRes] = await Promise.all([
          fetch(`/api/storefront/${siteId}/products?${params}`),
          fetch(`/api/storefront/${siteId}/categories`),
        ]);

        const productsJson = await productsRes.json();
        const categoriesJson = await categoriesRes.json();

        if (productsJson.success) {
          setProducts(productsJson.data);
          setPagination(productsJson.pagination);
        }
        if (categoriesJson.success) {
          setCategories(categoriesJson.data);
        }
      } catch (error) {
        console.error('Error fetching shop data:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [siteId, categoryFilter, searchFilter, sortFilter]);

  function updateUrl(params: Record<string, string>) {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(params)) {
      if (value) {
        url.searchParams.set(key, value);
      } else {
        url.searchParams.delete(key);
      }
    }
    window.history.pushState({}, '', url.toString());
    window.location.href = url.toString();
  }

  const activeCategory = categories.find((c) => c.slug === categoryFilter);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 md:py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold mb-2">
          {activeCategory ? activeCategory.name : 'Shop'}
        </h1>
        <p className="text-muted-foreground">
          {pagination.total} {pagination.total === 1 ? 'product' : 'products'}
          {activeCategory && (
            <>
              {' '}in {activeCategory.name}
              <Link href="/shop" className="ml-2 text-primary hover:underline text-sm">
                Clear filter
              </Link>
            </>
          )}
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar */}
        <aside className="lg:w-64 flex-shrink-0">
          {/* Search */}
          <div className="mb-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateUrl({ search, category: categoryFilter, sort });
              }}
            >
              <div className="relative">
                <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-lg">
                  search
                </span>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search products..."
                  className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
            </form>
          </div>

          {/* Categories */}
          {categories.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider text-muted-foreground">
                Categories
              </h3>
              <div className="space-y-1">
                <Link
                  href="/shop"
                  className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                    !categoryFilter
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-foreground hover:bg-muted/50'
                  }`}
                >
                  All Products
                </Link>
                {categories.map((cat) => (
                  <Link
                    key={cat.id}
                    href={`/shop?category=${cat.slug}`}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                      categoryFilter === cat.slug
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-foreground hover:bg-muted/50'
                    }`}
                  >
                    <span>{cat.name}</span>
                    <span className="text-xs text-muted-foreground">{cat.productCount}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Products Grid */}
        <div className="flex-1">
          {/* Sort Bar */}
          <div className="flex items-center justify-between mb-6">
            <div className="text-sm text-muted-foreground">
              {loading ? 'Loading...' : `Showing ${products.length} of ${pagination.total}`}
            </div>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                updateUrl({ sort: e.target.value, category: categoryFilter, search });
              }}
              className="text-sm rounded-lg border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="newest">Newest</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="featured">Featured</option>
            </select>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="border border-border rounded-lg overflow-hidden animate-pulse">
                  <div className="aspect-square bg-muted/20" />
                  <div className="p-4 space-y-2">
                    <div className="h-4 bg-muted/30 rounded w-3/4" />
                    <div className="h-4 bg-muted/20 rounded w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : products.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map((product) => (
                <Link key={product.id} href={`/shop/${product.slug}`} className="group">
                  <div className="h-full rounded-lg border bg-card overflow-hidden transition-all hover:shadow-lg">
                    <div className="aspect-square overflow-hidden bg-muted/5">
                      {product.image ? (
                        <img
                          src={product.image}
                          alt={product.name}
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="material-icons text-5xl text-muted-foreground/20">inventory_2</span>
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      {product.categoryName && (
                        <div className="text-xs font-medium text-primary mb-1">{product.categoryName}</div>
                      )}
                      <h3 className="font-semibold text-base mb-1 group-hover:text-primary transition-colors line-clamp-2">
                        {product.name}
                      </h3>
                      {product.shortDescription && (
                        <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{product.shortDescription}</p>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{formatMoney(product.price)}</span>
                        {product.compareAtPrice && product.compareAtPrice > product.price && (
                          <span className="text-sm text-muted-foreground line-through">
                            {formatMoney(product.compareAtPrice)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <span className="material-icons text-6xl text-muted-foreground/20 mb-4 block">search_off</span>
              <h2 className="text-xl font-semibold mb-2">No products found</h2>
              <p className="text-muted-foreground mb-6">
                {searchFilter
                  ? `No results for "${searchFilter}"`
                  : 'No products available in this category.'}
              </p>
              <Link href="/shop" className="text-primary hover:underline">
                Browse all products
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
