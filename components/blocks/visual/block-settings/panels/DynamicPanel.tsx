'use client';

// DynamicPanel: dispatcher for related block types' settings panels.
import type { Block, BlogPostsBlock, CardGridBlock, FeaturedContentBlock, ProductGridBlock, FeaturedProductsBlock, ProductCategoriesBlock, ShoppingCartBlock, ProductDetailBlock, StoreBannerBlock, AccordionBlock, TabsBlock } from '@/types/blocks';
import type { Breakpoint } from '@/types/responsive';
import { useState } from 'react';
import MediaPicker from '@/components/admin/MediaPicker';
import { TokenColorPicker } from '@/components/blocks/visual/TokenColorPicker';
import { RichTextEditable } from '@/components/blocks/visual/RichTextEditable';

interface PanelProps {
  block: Block;
  onChange: (updates: Partial<Block>) => void;
  currentViewport: Breakpoint;
}

export function DynamicPanel({ block, onChange, currentViewport }: PanelProps) {
  switch (block.type) {
    case 'blog-posts':
      return <BlogPostsBlockSettings block={block as BlogPostsBlock} onChange={onChange as (u: Partial<BlogPostsBlock>) => void} currentViewport={currentViewport} />;
    case 'card-grid':
      return <CardGridBlockSettings block={block as CardGridBlock} onChange={onChange as (u: Partial<CardGridBlock>) => void} currentViewport={currentViewport} />;
    case 'featured-content':
      return <FeaturedContentBlockSettings block={block as FeaturedContentBlock} onChange={onChange as (u: Partial<FeaturedContentBlock>) => void} currentViewport={currentViewport} />;
    case 'accordion':
      return <AccordionBlockSettings block={block as AccordionBlock} onChange={onChange as (u: Partial<AccordionBlock>) => void} currentViewport={currentViewport} />;
    case 'product-grid':
      return <ProductGridBlockSettings block={block as ProductGridBlock} onChange={onChange as (u: Partial<ProductGridBlock>) => void} />;
    case 'featured-products':
      return <FeaturedProductsBlockSettings block={block as FeaturedProductsBlock} onChange={onChange as (u: Partial<FeaturedProductsBlock>) => void} />;
    case 'product-categories':
      return <ProductCategoriesBlockSettings block={block as ProductCategoriesBlock} onChange={onChange as (u: Partial<ProductCategoriesBlock>) => void} />;
    case 'shopping-cart':
      return <ShoppingCartBlockSettings block={block as ShoppingCartBlock} onChange={onChange as (u: Partial<ShoppingCartBlock>) => void} />;
    case 'store-banner':
      return <StoreBannerBlockSettings block={block as StoreBannerBlock} onChange={onChange as (u: Partial<StoreBannerBlock>) => void} />;
    case 'product-detail':
      return <ProductDetailBlockSettings block={block as ProductDetailBlock} onChange={onChange as (u: Partial<ProductDetailBlock>) => void} />;
    case 'tabs':
      return <TabsBlockSettings block={block as TabsBlock} onChange={onChange as (u: Partial<TabsBlock>) => void} />;
    default:
      return null;
  }
}

function BlogPostsBlockSettings({ block, onChange, currentViewport }: { block: BlogPostsBlock; onChange: (updates: Partial<BlogPostsBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Section title..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Description</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.description || ''} onChange={(html) => onChange({ description: html || undefined })} singleLine placeholder="Section description..." className="text-sm text-foreground" />
        </div>
      </div>
      <div className="border-t border-border pt-4">
        <label className="block text-sm font-medium text-foreground mb-2">Post Type</label>
        <input
          type="text"
          value={block.postType || ''}
          onChange={(e) => onChange({ postType: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Leave empty for all posts"
        />
        <p className="text-xs text-muted-foreground mt-1">Filter by post type (optional). Set to <span className="font-mono">category</span> to enable category filtering below.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Category Slug</label>
        <input
          type="text"
          value={block.categorySlug || ''}
          onChange={(e) => onChange({ categorySlug: e.target.value || undefined })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="e.g. company-news"
        />
        <p className="text-xs text-muted-foreground mt-1">Active when Post Type is <span className="font-mono">category</span>.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Number of Posts</label>
        <input
          type="number"
          value={block.limit || 3}
          onChange={(e) => onChange({ limit: parseInt(e.target.value) })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          min="1"
          max="12"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Columns</label>
        <select
          value={block.columns || 3}
          onChange={(e) => onChange({ columns: parseInt(e.target.value) as BlogPostsBlock['columns'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="2">2 Columns</option>
          <option value="3">3 Columns</option>
        </select>
      </div>

      <div className="flex items-center">
        <input
          type="checkbox"
          id="showExcerpt"
          checked={block.showExcerpt !== false}
          onChange={(e) => onChange({ showExcerpt: e.target.checked })}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
        />
        <label htmlFor="showExcerpt" className="ml-2 text-sm text-foreground">
          Show Excerpt
        </label>
      </div>
    </div>
  );
}

function CardGridBlockSettings({ block, onChange, currentViewport }: { block: CardGridBlock; onChange: (updates: Partial<CardGridBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Section title..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Description</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.description || ''} onChange={(html) => onChange({ description: html || undefined })} singleLine placeholder="Section description..." className="text-sm text-foreground" />
        </div>
      </div>
      <div className="border-t border-border pt-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Number of Columns</label>
        <select
          value={block.columns || 3}
          onChange={(e) => onChange({ columns: parseInt(e.target.value) as CardGridBlock['columns'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="2">2 Columns</option>
          <option value="3">3 Columns</option>
          <option value="4">4 Columns</option>
        </select>
      </div>
      </div>
    </div>
  );
}

function FeaturedContentBlockSettings({ block, onChange, currentViewport }: { block: FeaturedContentBlock; onChange: (updates: Partial<FeaturedContentBlock>) => void; currentViewport: Breakpoint }) {
  const [showMediaPicker, setShowMediaPicker] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title} onChange={(html) => onChange({ title: html })} singleLine placeholder="Title..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Description</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[60px]">
          <RichTextEditable html={block.description || ''} onChange={(html) => onChange({ description: html || undefined })} placeholder="Description..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Button Text</label>
        <input
          type="text"
          value={block.buttonText || ''}
          onChange={(e) => onChange({ buttonText: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Button text..."
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Button URL</label>
        <input
          type="text"
          value={block.buttonUrl || ''}
          onChange={(e) => onChange({ buttonUrl: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="/url..."
        />
      </div>
      <div className="border-t border-border pt-4">
        <label className="block text-sm font-medium text-foreground mb-2">Featured Image</label>
        {block.imageUrl ? (
          <div className="space-y-2">
            <img
              src={block.imageUrl}
              alt="Featured"
              className="w-full h-32 object-cover rounded border border-border"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowMediaPicker(true)}
                className="flex-1 px-3 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
              >
                Change Image
              </button>
              <button
                type="button"
                onClick={() => onChange({ imageUrl: '' })}
                className="px-3 py-2 text-sm bg-background border border-border text-foreground rounded hover:bg-accent"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowMediaPicker(true)}
            className="w-full p-8 border-2 border-dashed border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors text-center"
          >
            <span className="material-icons text-5xl text-muted-foreground/20 mb-2">image</span>
            <p className="text-sm text-muted-foreground">Click to select image</p>
          </button>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Image Position</label>
        <select
          value={block.imagePosition || 'right'}
          onChange={(e) => onChange({ imagePosition: e.target.value as FeaturedContentBlock['imagePosition'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>
      </div>

      <div className="space-y-3 pt-3 border-t border-border">
        <h4 className="text-sm font-semibold text-foreground">Call to Action (optional)</h4>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Button Text</label>
          <input
            type="text"
            value={block.buttonText || ''}
            onChange={(e) => onChange({ buttonText: e.target.value })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
            placeholder="Learn More"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Button URL</label>
          <input
            type="text"
            value={block.buttonUrl || ''}
            onChange={(e) => onChange({ buttonUrl: e.target.value })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
            placeholder="/learn-more"
          />
        </div>
      </div>

      {showMediaPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]" onClick={() => setShowMediaPicker(false)}>
          <div className="bg-white dark:bg-gray-900 border border-border rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <MediaPicker
              value={block.imageUrl || ''}
              onChange={(url) => {
                onChange({ imageUrl: url });
                setShowMediaPicker(false);
              }}
              label="Select Featured Image"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ProductGridBlockSettings({ block, onChange }: { block: ProductGridBlock; onChange: (updates: Partial<ProductGridBlock>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Optional section title..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Description</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.description || ''} onChange={(html) => onChange({ description: html || undefined })} singleLine placeholder="Optional description..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Category Filter</label>
        <input
          type="text"
          value={block.categorySlug || ''}
          onChange={(e) => onChange({ categorySlug: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Leave empty for all products"
        />
        <p className="text-xs text-muted-foreground mt-1">Category slug to filter by</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Sort By</label>
        <select
          value={block.sort || 'newest'}
          onChange={(e) => onChange({ sort: e.target.value as ProductGridBlock['sort'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="newest">Newest</option>
          <option value="price_asc">Price: Low to High</option>
          <option value="price_desc">Price: High to Low</option>
          <option value="featured">Featured</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Number of Products</label>
        <input
          type="number"
          value={block.limit || 6}
          onChange={(e) => onChange({ limit: parseInt(e.target.value) })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          min="1"
          max="24"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Columns</label>
        <select
          value={block.columns || 3}
          onChange={(e) => onChange({ columns: parseInt(e.target.value) as ProductGridBlock['columns'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="2">2 Columns</option>
          <option value="3">3 Columns</option>
          <option value="4">4 Columns</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Button Text</label>
        <input
          type="text"
          value={block.buttonText || ''}
          onChange={(e) => onChange({ buttonText: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="e.g. Add to Cart"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center">
          <input type="checkbox" id="pgShowPrice" checked={block.showPrice !== false} onChange={(e) => onChange({ showPrice: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pgShowPrice" className="ml-2 text-sm text-foreground">Show Price</label>
        </div>
        <div className="flex items-center">
          <input type="checkbox" id="pgShowDesc" checked={block.showDescription === true} onChange={(e) => onChange({ showDescription: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pgShowDesc" className="ml-2 text-sm text-foreground">Show Description</label>
        </div>
        <div className="flex items-center">
          <input type="checkbox" id="pgShowCat" checked={block.showCategory === true} onChange={(e) => onChange({ showCategory: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pgShowCat" className="ml-2 text-sm text-foreground">Show Category</label>
        </div>
      </div>
    </div>
  );
}

function FeaturedProductsBlockSettings({ block, onChange }: { block: FeaturedProductsBlock; onChange: (updates: Partial<FeaturedProductsBlock>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Optional section title..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Description</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.description || ''} onChange={(html) => onChange({ description: html || undefined })} singleLine placeholder="Optional description..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Number of Products</label>
        <input
          type="number"
          value={block.limit || 4}
          onChange={(e) => onChange({ limit: parseInt(e.target.value) })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          min="1"
          max="12"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Columns</label>
        <select
          value={block.columns || 4}
          onChange={(e) => onChange({ columns: parseInt(e.target.value) as FeaturedProductsBlock['columns'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="2">2 Columns</option>
          <option value="3">3 Columns</option>
          <option value="4">4 Columns</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Badge Text</label>
        <input
          type="text"
          value={block.badgeText || ''}
          onChange={(e) => onChange({ badgeText: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Featured"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Button Text</label>
        <input
          type="text"
          value={block.buttonText || ''}
          onChange={(e) => onChange({ buttonText: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="e.g. Shop Now"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center">
          <input type="checkbox" id="fpShowPrice" checked={block.showPrice !== false} onChange={(e) => onChange({ showPrice: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="fpShowPrice" className="ml-2 text-sm text-foreground">Show Price</label>
        </div>
        <div className="flex items-center">
          <input type="checkbox" id="fpShowBadge" checked={block.showBadge !== false} onChange={(e) => onChange({ showBadge: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="fpShowBadge" className="ml-2 text-sm text-foreground">Show Badge</label>
        </div>
      </div>
    </div>
  );
}

function ProductCategoriesBlockSettings({ block, onChange }: { block: ProductCategoriesBlock; onChange: (updates: Partial<ProductCategoriesBlock>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Optional section title..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Description</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.description || ''} onChange={(html) => onChange({ description: html || undefined })} singleLine placeholder="Optional description..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Layout</label>
        <select
          value={block.layout || 'grid'}
          onChange={(e) => onChange({ layout: e.target.value as ProductCategoriesBlock['layout'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="grid">Grid</option>
          <option value="list">List</option>
        </select>
      </div>

      {block.layout !== 'list' && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Columns</label>
          <select
            value={block.columns || 3}
            onChange={(e) => onChange({ columns: parseInt(e.target.value) as ProductCategoriesBlock['columns'] })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          >
            <option value="2">2 Columns</option>
            <option value="3">3 Columns</option>
            <option value="4">4 Columns</option>
          </select>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center">
          <input type="checkbox" id="pcShowCount" checked={block.showProductCount !== false} onChange={(e) => onChange({ showProductCount: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pcShowCount" className="ml-2 text-sm text-foreground">Show Product Count</label>
        </div>
        <div className="flex items-center">
          <input type="checkbox" id="pcShowImage" checked={block.showImage !== false} onChange={(e) => onChange({ showImage: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pcShowImage" className="ml-2 text-sm text-foreground">Show Image</label>
        </div>
      </div>
    </div>
  );
}

function ShoppingCartBlockSettings({ block, onChange }: { block: ShoppingCartBlock; onChange: (updates: Partial<ShoppingCartBlock>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Cart Style</label>
        <select
          value={block.variant || 'full'}
          onChange={(e) => onChange({ variant: e.target.value as ShoppingCartBlock['variant'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="full">Full Cart</option>
          <option value="mini">Mini Cart</option>
          <option value="icon-only">Icon Only</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Checkout Button Text</label>
        <input
          type="text"
          value={block.checkoutButtonText || ''}
          onChange={(e) => onChange({ checkoutButtonText: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Proceed to Checkout"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Empty Cart Message</label>
        <input
          type="text"
          value={block.emptyCartMessage || ''}
          onChange={(e) => onChange({ emptyCartMessage: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Your cart is empty"
        />
      </div>

      <div className="flex items-center">
        <input type="checkbox" id="scShowSubtotal" checked={block.showSubtotal !== false} onChange={(e) => onChange({ showSubtotal: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
        <label htmlFor="scShowSubtotal" className="ml-2 text-sm text-foreground">Show Subtotal</label>
      </div>
    </div>
  );
}

function ProductDetailBlockSettings({ block, onChange }: { block: ProductDetailBlock; onChange: (updates: Partial<ProductDetailBlock>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Product Slug</label>
        <input
          type="text"
          value={block.productSlug || ''}
          onChange={(e) => onChange({ productSlug: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="e.g. dinner-at-the-club"
        />
        <p className="text-xs text-muted-foreground mt-1">The URL slug of the product to display</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Layout</label>
        <select
          value={block.layout || 'standard'}
          onChange={(e) => onChange({ layout: e.target.value as ProductDetailBlock['layout'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="standard">Standard (2 column)</option>
          <option value="compact">Compact (image small)</option>
          <option value="wide">Wide (stacked)</option>
        </select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center">
          <input type="checkbox" id="pdShowGallery" checked={block.showGallery !== false} onChange={(e) => onChange({ showGallery: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pdShowGallery" className="ml-2 text-sm text-foreground">Show Image Gallery</label>
        </div>
        <div className="flex items-center">
          <input type="checkbox" id="pdShowDescription" checked={block.showDescription !== false} onChange={(e) => onChange({ showDescription: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pdShowDescription" className="ml-2 text-sm text-foreground">Show Full Description</label>
        </div>
        <div className="flex items-center">
          <input type="checkbox" id="pdShowVariants" checked={block.showVariants !== false} onChange={(e) => onChange({ showVariants: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pdShowVariants" className="ml-2 text-sm text-foreground">Show Variant Options</label>
        </div>
        <div className="flex items-center">
          <input type="checkbox" id="pdShowAddToCart" checked={block.showAddToCart !== false} onChange={(e) => onChange({ showAddToCart: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pdShowAddToCart" className="ml-2 text-sm text-foreground">Show Add to Cart</label>
        </div>
        <div className="flex items-center">
          <input type="checkbox" id="pdShowBulkPricing" checked={block.showBulkPricing !== false} onChange={(e) => onChange({ showBulkPricing: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pdShowBulkPricing" className="ml-2 text-sm text-foreground">Show Bulk Pricing</label>
        </div>
        <div className="flex items-center">
          <input type="checkbox" id="pdShowBreadcrumb" checked={block.showBreadcrumb !== false} onChange={(e) => onChange({ showBreadcrumb: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pdShowBreadcrumb" className="ml-2 text-sm text-foreground">Show Breadcrumb</label>
        </div>
        <div className="flex items-center">
          <input type="checkbox" id="pdShowTags" checked={block.showTags !== false} onChange={(e) => onChange({ showTags: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pdShowTags" className="ml-2 text-sm text-foreground">Show Tags & SKU</label>
        </div>
      </div>
    </div>
  );
}

function StoreBannerBlockSettings({ block, onChange }: { block: StoreBannerBlock; onChange: (updates: Partial<StoreBannerBlock>) => void }) {
  const [showMediaPicker, setShowMediaPicker] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title} onChange={(html) => onChange({ title: html })} singleLine placeholder="Banner title..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Subtitle</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.subtitle || ''} onChange={(html) => onChange({ subtitle: html || undefined })} singleLine placeholder="Subtitle..." className="text-sm text-foreground" />
        </div>
      </div>
      <div className="border-t border-border pt-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Discount Code</label>
          <input
            type="text"
            value={block.discountCode || ''}
            onChange={(e) => onChange({ discountCode: e.target.value })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground font-mono"
            placeholder="e.g. SAVE20"
          />
        </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Button Text</label>
        <input
          type="text"
          value={block.buttonText || ''}
          onChange={(e) => onChange({ buttonText: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Shop Now"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Button URL</label>
        <input
          type="text"
          value={block.buttonUrl || ''}
          onChange={(e) => onChange({ buttonUrl: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="/shop"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Background Style</label>
        <select
          value={block.backgroundStyle || 'gradient'}
          onChange={(e) => onChange({ backgroundStyle: e.target.value as StoreBannerBlock['backgroundStyle'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="gradient">Gradient</option>
          <option value="solid">Solid</option>
          <option value="image">Image</option>
        </select>
      </div>

      <div>
        <TokenColorPicker
          label="Accent Color"
          value={block.accentColor || ''}
          onChange={(v) => onChange({ accentColor: v })}
          placeholder="#6366f1"
        />
      </div>

      {block.backgroundStyle === 'image' && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Background Image</label>
          {block.backgroundImage ? (
            <div className="space-y-2">
              <img src={block.backgroundImage} alt="Banner background" className="w-full h-24 object-cover rounded border border-border" />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowMediaPicker(true)} className="flex-1 px-3 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90">Change</button>
                <button type="button" onClick={() => onChange({ backgroundImage: '' })} className="px-3 py-2 text-sm bg-background border border-border text-foreground rounded hover:bg-accent">Remove</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setShowMediaPicker(true)} className="w-full px-3 py-2 text-sm bg-background border border-border text-foreground rounded hover:bg-accent">
              Choose Image
            </button>
          )}
          {showMediaPicker && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]" onClick={() => setShowMediaPicker(false)}>
              <div className="bg-white dark:bg-gray-900 border border-border rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <MediaPicker
                  value={block.backgroundImage || ''}
                  onChange={(url) => {
                    onChange({ backgroundImage: url });
                    setShowMediaPicker(false);
                  }}
                  label="Select Banner Image"
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Countdown End Date</label>
        <input
          type="datetime-local"
          value={block.countdownDate || ''}
          onChange={(e) => onChange({ countdownDate: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        />
        <p className="text-xs text-muted-foreground mt-1">Optional: Shows a live countdown timer</p>
      </div>
      </div>
    </div>
  );
}

function AccordionBlockSettings({ block, onChange, currentViewport }: { block: AccordionBlock; onChange: (updates: Partial<AccordionBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Frequently Asked Questions" className="text-sm text-foreground" />
        </div>
      </div>
      <div className="border-t border-border pt-4">
      <p className="text-xs text-muted-foreground">Use the controls in the editor to add, remove, or edit accordion items.</p>
      </div>
    </div>
  );
}

function TabsBlockSettings({ block, onChange }: { block: TabsBlock; onChange: (updates: Partial<TabsBlock>) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Edit each tab&apos;s contents by selecting it in the canvas and using the inline editor. Add or remove tabs here.
      </p>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Tabs</label>
        {(block.tabs || []).map((tab, i) => (
          <div key={tab.id ?? i} className="flex gap-2 items-center">
            <input
              type="text"
              value={tab.label}
              onChange={(e) => {
                const next = [...(block.tabs || [])];
                next[i] = { ...next[i], label: e.target.value };
                onChange({ tabs: next });
              }}
              className="flex-1 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Tab label"
            />
            <button
              type="button"
              onClick={() => onChange({ tabs: (block.tabs || []).filter((_, j) => j !== i) })}
              className="px-2 py-1.5 text-xs rounded border border-border text-destructive hover:bg-destructive/10"
              title="Remove tab"
            >
              <span className="material-icons text-xs">delete</span>
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ tabs: [...(block.tabs || []), { id: `tab-${Date.now()}`, label: 'New Tab', blocks: [] }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Add Tab
        </button>
      </div>
    </div>
  );
}

