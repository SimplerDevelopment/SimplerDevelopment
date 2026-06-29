'use client';

import MediaPicker from '@/components/admin/MediaPicker';
import type { Block } from '@/types/blocks';
import {
  Field,
  RichTextField,
  SelectField,
  ColorField,
  CheckboxField,
} from '../../panel-fields';
import { ProductSlugPicker } from '../pickers/ProductSlugPicker';
import type { PanelProps } from './ContentPanel';

// ─── Commerce Panel ───────────────────────────────────────────────────────────
// product-grid, featured-products, product-categories, shopping-cart,
// store-banner, product-detail

export function CommercePanel({ block, onUpdate, siteId }: PanelProps) {
  const b = block as unknown as Record<string, unknown>;
  const mediaApi = siteId ? `/api/portal/cms/websites/${siteId}/media` : '/api/portal/media';
  return (
    <>
      {/* ── Product Grid Block ── */}
      {block.type === 'product-grid' && (
        <>
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <Field label="Category Slug" value={b.categorySlug as string} onChange={(v) => onUpdate({ categorySlug: v } as Partial<Block>)} />
          <SelectField label="Sort" value={(b.sort as string) || 'newest'} options={['newest','price_asc','price_desc','featured']} onChange={(v) => onUpdate({ sort: v } as Partial<Block>)} />
          <SelectField label="Limit" value={String(b.limit || 6)} options={['3','6','9','12']} onChange={(v) => onUpdate({ limit: Number(v) } as Partial<Block>)} />
          <SelectField label="Columns" value={String(b.columns || 3)} options={['2','3','4']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
          <CheckboxField label="Show Price" checked={b.showPrice as boolean ?? true} onChange={(v) => onUpdate({ showPrice: v } as Partial<Block>)} />
          <CheckboxField label="Show Description" checked={b.showDescription as boolean} onChange={(v) => onUpdate({ showDescription: v } as Partial<Block>)} />
          <CheckboxField label="Show Category" checked={b.showCategory as boolean} onChange={(v) => onUpdate({ showCategory: v } as Partial<Block>)} />
          <Field label="Button Text" value={b.buttonText as string} onChange={(v) => onUpdate({ buttonText: v } as Partial<Block>)} />
        </>
      )}

      {/* ── Featured Products Block ── */}
      {block.type === 'featured-products' && (
        <>
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <SelectField label="Limit" value={String(b.limit || 4)} options={['2','3','4','6','8']} onChange={(v) => onUpdate({ limit: Number(v) } as Partial<Block>)} />
          <SelectField label="Columns" value={String(b.columns || 4)} options={['2','3','4']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
          <SelectField label="Layout" value={(b.layout as string) || 'grid'} options={['grid','carousel']} onChange={(v) => onUpdate({ layout: v } as Partial<Block>)} />
          <CheckboxField label="Show Price" checked={b.showPrice as boolean ?? true} onChange={(v) => onUpdate({ showPrice: v } as Partial<Block>)} />
          <CheckboxField label="Show Badge" checked={b.showBadge as boolean} onChange={(v) => onUpdate({ showBadge: v } as Partial<Block>)} />
          <Field label="Badge Text" value={b.badgeText as string} onChange={(v) => onUpdate({ badgeText: v } as Partial<Block>)} />
          <Field label="Button Text" value={b.buttonText as string} onChange={(v) => onUpdate({ buttonText: v } as Partial<Block>)} />
        </>
      )}

      {/* ── Product Categories Block ── */}
      {block.type === 'product-categories' && (
        <>
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <SelectField label="Columns" value={String(b.columns || 3)} options={['2','3','4']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
          <SelectField label="Layout" value={(b.layout as string) || 'grid'} options={['grid','list']} onChange={(v) => onUpdate({ layout: v } as Partial<Block>)} />
          <CheckboxField label="Show Product Count" checked={b.showProductCount as boolean ?? true} onChange={(v) => onUpdate({ showProductCount: v } as Partial<Block>)} />
          <CheckboxField label="Show Image" checked={b.showImage as boolean ?? true} onChange={(v) => onUpdate({ showImage: v } as Partial<Block>)} />
        </>
      )}

      {/* ── Shopping Cart Block ── */}
      {block.type === 'shopping-cart' && (
        <>
          <SelectField label="Variant" value={(b.variant as string) || 'full'} options={['full','mini','icon-only']} onChange={(v) => onUpdate({ variant: v } as Partial<Block>)} />
          <CheckboxField label="Show Subtotal" checked={b.showSubtotal as boolean ?? true} onChange={(v) => onUpdate({ showSubtotal: v } as Partial<Block>)} />
          <Field label="Checkout Button Text" value={b.checkoutButtonText as string} onChange={(v) => onUpdate({ checkoutButtonText: v } as Partial<Block>)} />
          <Field label="Empty Cart Message" value={b.emptyCartMessage as string} onChange={(v) => onUpdate({ emptyCartMessage: v } as Partial<Block>)} />
        </>
      )}

      {/* ── Store Banner Block ── */}
      {block.type === 'store-banner' && (
        <>
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Subtitle" value={b.subtitle as string} onChange={(v) => onUpdate({ subtitle: v } as Partial<Block>)} singleLine />
          <Field label="Discount Code" value={b.discountCode as string} onChange={(v) => onUpdate({ discountCode: v } as Partial<Block>)} />
          <Field label="Button Text" value={b.buttonText as string} onChange={(v) => onUpdate({ buttonText: v } as Partial<Block>)} />
          <Field label="Button URL" value={b.buttonUrl as string} onChange={(v) => onUpdate({ buttonUrl: v } as Partial<Block>)} />
          <div><span className="text-xs font-medium text-muted-foreground">Background Image</span><MediaPicker value={b.backgroundImage as string} onChange={(v) => onUpdate({ backgroundImage: v } as Partial<Block>)} mimeTypeFilter="image" label="" apiEndpoint={mediaApi} /></div>
          <SelectField label="Background Style" value={(b.backgroundStyle as string) || 'gradient'} options={['gradient','solid','image']} onChange={(v) => onUpdate({ backgroundStyle: v } as Partial<Block>)} />
          <ColorField label="Accent Color" value={(b.accentColor as string) || ''} onChange={(v) => onUpdate({ accentColor: v } as Partial<Block>)} />
          <Field label="Countdown Date" value={b.countdownDate as string} onChange={(v) => onUpdate({ countdownDate: v } as Partial<Block>)} />
        </>
      )}

      {/* ── Product Detail Block ── */}
      {block.type === 'product-detail' && (
        <>
          <ProductSlugPicker siteId={siteId} value={b.productSlug as string} onChange={(v) => onUpdate({ productSlug: v } as Partial<Block>)} />
          <SelectField label="Layout" value={(b.layout as string) || 'standard'} options={['standard','compact','wide']} onChange={(v) => onUpdate({ layout: v } as Partial<Block>)} />
          <CheckboxField label="Show Image Gallery" checked={b.showGallery !== false} onChange={(v) => onUpdate({ showGallery: v } as Partial<Block>)} />
          <CheckboxField label="Show Full Description" checked={b.showDescription !== false} onChange={(v) => onUpdate({ showDescription: v } as Partial<Block>)} />
          <CheckboxField label="Show Variant Options" checked={b.showVariants !== false} onChange={(v) => onUpdate({ showVariants: v } as Partial<Block>)} />
          <CheckboxField label="Show Add to Cart" checked={b.showAddToCart !== false} onChange={(v) => onUpdate({ showAddToCart: v } as Partial<Block>)} />
          <CheckboxField label="Show Bulk Pricing" checked={b.showBulkPricing !== false} onChange={(v) => onUpdate({ showBulkPricing: v } as Partial<Block>)} />
          <CheckboxField label="Show Breadcrumb" checked={b.showBreadcrumb !== false} onChange={(v) => onUpdate({ showBreadcrumb: v } as Partial<Block>)} />
          <CheckboxField label="Show Tags & SKU" checked={b.showTags !== false} onChange={(v) => onUpdate({ showTags: v } as Partial<Block>)} />
        </>
      )}
    </>
  );
}
