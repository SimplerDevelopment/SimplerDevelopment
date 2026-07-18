import type { BaseBlock } from './base';

export interface ProductGridBlock extends BaseBlock {
  type: 'product-grid';
  title?: string;
  description?: string;
  categorySlug?: string;
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'featured';
  limit?: number;
  columns?: 2 | 3 | 4;
  showPrice?: boolean;
  showDescription?: boolean;
  showCategory?: boolean;
  buttonText?: string;
}

export interface FeaturedProductsBlock extends BaseBlock {
  type: 'featured-products';
  title?: string;
  description?: string;
  limit?: number;
  columns?: 2 | 3 | 4;
  showPrice?: boolean;
  showBadge?: boolean;
  badgeText?: string;
  buttonText?: string;
}

export interface ProductCategoriesBlock extends BaseBlock {
  type: 'product-categories';
  title?: string;
  description?: string;
  columns?: 2 | 3 | 4;
  showProductCount?: boolean;
  showImage?: boolean;
  layout?: 'grid' | 'list';
}

export interface ShoppingCartBlock extends BaseBlock {
  type: 'shopping-cart';
  variant?: 'full' | 'mini' | 'icon-only';
  showSubtotal?: boolean;
  checkoutButtonText?: string;
  emptyCartMessage?: string;
}

export interface ProductDetailBlock extends BaseBlock {
  type: 'product-detail';
  productSlug?: string;
  layout?: 'standard' | 'compact' | 'wide';
  showGallery?: boolean;
  showDescription?: boolean;
  showVariants?: boolean;
  showAddToCart?: boolean;
  showBulkPricing?: boolean;
  showBreadcrumb?: boolean;
  showTags?: boolean;
}

export interface StoreBannerBlock extends BaseBlock {
  type: 'store-banner';
  title: string;
  subtitle?: string;
  discountCode?: string;
  buttonText?: string;
  buttonUrl?: string;
  backgroundImage?: string;
  backgroundStyle?: 'gradient' | 'solid' | 'image';
  accentColor?: string;
  countdownDate?: string;
}
