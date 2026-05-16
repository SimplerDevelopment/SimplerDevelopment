'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface ProductImage {
  id: number;
  url: string;
  alt: string | null;
  order: number;
}

interface OptionValue {
  id: number;
  value: string;
  order: number;
}

interface ProductOption {
  id: number;
  name: string;
  order: number;
  values: OptionValue[];
}

interface ProductVariant {
  id: number;
  name: string;
  price: number;
  quantity: number;
  sku: string | null;
  optionValues: Record<string, string> | null;
  active: boolean;
}

interface BulkPricingRule {
  id: number;
  minQuantity: number;
  maxQuantity: number | null;
  price: number;
  discountType: string;
  discountValue: number;
}

interface ProductCategory {
  id: number;
  name: string;
  slug: string;
}

interface Product {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  shortDescription: string | null;
  price: number;
  compareAtPrice: number | null;
  sku: string | null;
  quantity: number;
  trackInventory: boolean;
  weight: number | null;
  weightUnit: string | null;
  tags: string[] | null;
  seoTitle: string | null;
  seoDescription: string | null;
  images: ProductImage[];
  options: ProductOption[];
  variants: ProductVariant[];
  bulkPricing: BulkPricingRule[];
  category: ProductCategory | null;
  designable?: boolean;
}

interface ProductPageProps {
  siteId: number;
  productSlug: string;
}

function formatPrice(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return '';
  let sessionId = localStorage.getItem('cart_session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem('cart_session_id', sessionId);
  }
  return sessionId;
}

export function ProductPage({ siteId, productSlug }: ProductPageProps) {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [matchedVariant, setMatchedVariant] = useState<ProductVariant | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [addingToCart, setAddingToCart] = useState(false);
  const [cartMessage, setCartMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch product
  useEffect(() => {
    async function fetchProduct() {
      try {
        setLoading(true);
        const res = await fetch(`/api/storefront/${siteId}/products/${productSlug}`);
        const json = await res.json();
        if (json.success) {
          setProduct(json.data);
          // Pre-select first value for each option
          const defaults: Record<string, string> = {};
          for (const opt of json.data.options) {
            if (opt.values.length > 0) {
              defaults[opt.name] = opt.values[0].value;
            }
          }
          setSelectedOptions(defaults);
        } else {
          setError(json.message || 'Product not found');
        }
      } catch {
        setError('Failed to load product');
      } finally {
        setLoading(false);
      }
    }
    fetchProduct();
  }, [siteId, productSlug]);

  // Match variant when options change
  useEffect(() => {
    if (!product || product.variants.length === 0) {
      setMatchedVariant(null);
      return;
    }

    const match = product.variants.find((v) => {
      if (!v.optionValues) return false;
      return Object.entries(selectedOptions).every(
        ([key, val]) => v.optionValues?.[key] === val
      );
    });

    setMatchedVariant(match || null);
  }, [product, selectedOptions]);

  const currentPrice = matchedVariant ? matchedVariant.price : product?.price ?? 0;
  const comparePrice = product?.compareAtPrice;
  const inStock = product
    ? product.trackInventory
      ? matchedVariant
        ? matchedVariant.quantity > 0
        : product.quantity > 0
      : true
    : false;
  const maxStock = product?.trackInventory
    ? matchedVariant
      ? matchedVariant.quantity
      : product.quantity
    : 99;

  // Bulk pricing
  const activeBulkPrice = product?.bulkPricing.find(
    (rule) =>
      quantity >= rule.minQuantity &&
      (rule.maxQuantity === null || quantity <= rule.maxQuantity)
  );

  const effectivePrice = activeBulkPrice
    ? activeBulkPrice.discountType === 'fixed_price'
      ? activeBulkPrice.price
      : activeBulkPrice.discountType === 'percent'
        ? Math.round(currentPrice * (1 - activeBulkPrice.discountValue / 100))
        : currentPrice - activeBulkPrice.discountValue
    : currentPrice;

  const addToCart = useCallback(async () => {
    if (!product) return;
    setAddingToCart(true);
    setCartMessage(null);

    try {
      const sessionId = getOrCreateSessionId();
      const res = await fetch(`/api/storefront/${siteId}/cart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          productId: product.id,
          variantId: matchedVariant?.id || null,
          quantity,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setCartMessage({ type: 'success', text: 'Added to cart!' });
        // Dispatch custom event for cart icon widgets to update
        window.dispatchEvent(new CustomEvent('cart-updated'));
      } else {
        setCartMessage({ type: 'error', text: json.message || 'Failed to add to cart' });
      }
    } catch {
      setCartMessage({ type: 'error', text: 'Something went wrong' });
    } finally {
      setAddingToCart(false);
      setTimeout(() => setCartMessage(null), 4000);
    }
  }, [product, siteId, matchedVariant, quantity]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="space-y-4">
            <div className="aspect-square bg-muted/20 rounded-xl animate-pulse" />
            <div className="flex gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="w-20 h-20 bg-muted/20 rounded-lg animate-pulse" />
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <div className="h-8 bg-muted/20 rounded w-3/4 animate-pulse" />
            <div className="h-6 bg-muted/20 rounded w-1/4 animate-pulse" />
            <div className="h-4 bg-muted/20 rounded w-full animate-pulse" />
            <div className="h-4 bg-muted/20 rounded w-5/6 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <span className="material-icons text-6xl text-muted-foreground/30 mb-4 block">error_outline</span>
        <h1 className="text-2xl font-bold mb-2">Product Not Found</h1>
        <p className="text-muted-foreground mb-6">{error || 'This product does not exist or is no longer available.'}</p>
        <Link href="/shop" className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
          <span className="material-icons text-sm">arrow_back</span>
          Back to Shop
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 md:py-12">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
        <Link href="/shop" className="hover:text-foreground transition-colors">Shop</Link>
        <span className="material-icons text-xs">chevron_right</span>
        {product.category && (
          <>
            <Link href={`/shop?category=${product.category.slug}`} className="hover:text-foreground transition-colors">
              {product.category.name}
            </Link>
            <span className="material-icons text-xs">chevron_right</span>
          </>
        )}
        <span className="text-foreground">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
        {/* Image Gallery */}
        <div className="space-y-4">
          {/* Main Image */}
          <div className="relative aspect-square rounded-xl overflow-hidden bg-muted/5 border border-border">
            {product.images.length > 0 ? (
              <img
                src={product.images[selectedImage]?.url}
                alt={product.images[selectedImage]?.alt || product.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="material-icons text-8xl text-muted-foreground/20">inventory_2</span>
              </div>
            )}
            {comparePrice && comparePrice > currentPrice && (
              <div className="absolute top-4 left-4 bg-red-500 text-white text-sm font-bold px-3 py-1.5 rounded-full">
                {Math.round((1 - currentPrice / comparePrice) * 100)}% OFF
              </div>
            )}
          </div>

          {/* Thumbnail Strip */}
          {product.images.length > 1 && (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {product.images.map((img, i) => (
                <button
                  key={img.id}
                  onClick={() => setSelectedImage(i)}
                  className={`w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${
                    selectedImage === i
                      ? 'border-primary ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <img
                    src={img.url}
                    alt={img.alt || `${product.name} ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product Info */}
        <div className="space-y-6">
          {/* Category */}
          {product.category && (
            <Link
              href={`/shop?category=${product.category.slug}`}
              className="inline-block text-sm font-medium text-primary hover:text-primary/80 transition-colors"
            >
              {product.category.name}
            </Link>
          )}

          {/* Title */}
          <h1 className="text-3xl md:text-4xl font-bold leading-tight">{product.name}</h1>

          {/* Price */}
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold">{formatPrice(effectivePrice)}</span>
            {comparePrice && comparePrice > currentPrice && (
              <span className="text-lg text-muted-foreground line-through">{formatPrice(comparePrice)}</span>
            )}
            {activeBulkPrice && (
              <span className="text-sm bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">
                Bulk discount applied
              </span>
            )}
          </div>

          {/* Short Description */}
          {product.shortDescription && (
            <p className="text-lg text-muted-foreground leading-relaxed">{product.shortDescription}</p>
          )}

          {/* Stock Status */}
          <div className="flex items-center gap-2">
            {inStock ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <span className="text-sm font-medium text-green-700 dark:text-green-400">
                  In Stock
                  {product.trackInventory && maxStock <= 10 && (
                    <span className="text-muted-foreground font-normal"> — Only {maxStock} left</span>
                  )}
                </span>
              </>
            ) : (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span className="text-sm font-medium text-red-600 dark:text-red-400">Out of Stock</span>
              </>
            )}
          </div>

          {/* Variant Options */}
          {product.options.length > 0 && (
            <div className="space-y-4 border-t border-border pt-6">
              {product.options.map((option) => (
                <div key={option.id}>
                  <label className="block text-sm font-semibold mb-2">
                    {option.name}
                    {selectedOptions[option.name] && (
                      <span className="font-normal text-muted-foreground ml-2">— {selectedOptions[option.name]}</span>
                    )}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {option.values.map((val) => {
                      const isSelected = selectedOptions[option.name] === val.value;
                      // Check if selecting this value leads to an available variant
                      const testOptions = { ...selectedOptions, [option.name]: val.value };
                      const matchingVariant = product.variants.find((v) => {
                        if (!v.optionValues) return false;
                        return Object.entries(testOptions).every(
                          ([k, vv]) => v.optionValues?.[k] === vv
                        );
                      });
                      const isAvailable = product.variants.length === 0 || (matchingVariant && (!product.trackInventory || matchingVariant.quantity > 0));

                      return (
                        <button
                          key={val.id}
                          onClick={() =>
                            setSelectedOptions((prev) => ({ ...prev, [option.name]: val.value }))
                          }
                          disabled={!isAvailable}
                          className={`px-4 py-2 text-sm font-medium rounded-lg border transition-all ${
                            isSelected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : isAvailable
                                ? 'border-border bg-background text-foreground hover:border-primary/50'
                                : 'border-border bg-muted/30 text-muted-foreground/50 cursor-not-allowed line-through'
                          }`}
                        >
                          {val.value}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Bulk Pricing */}
          {product.bulkPricing.length > 0 && (
            <div className="border border-border rounded-lg p-4 bg-muted/5">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <span className="material-icons text-base">local_offer</span>
                Bulk Pricing
              </h3>
              <div className="space-y-1">
                {product.bulkPricing.map((rule) => (
                  <div
                    key={rule.id}
                    className={`flex justify-between text-sm py-1 px-2 rounded ${
                      activeBulkPrice?.id === rule.id ? 'bg-primary/10 text-primary font-medium' : ''
                    }`}
                  >
                    <span>
                      {rule.minQuantity}
                      {rule.maxQuantity ? `–${rule.maxQuantity}` : '+'} units
                    </span>
                    <span>
                      {rule.discountType === 'percent'
                        ? `${rule.discountValue}% off`
                        : rule.discountType === 'fixed_price'
                          ? formatPrice(rule.price)
                          : `${formatPrice(rule.discountValue)} off`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quantity + Add to Cart */}
          <div className="border-t border-border pt-6 space-y-4">
            <div className="flex items-center gap-4">
              <label className="text-sm font-semibold">Quantity</label>
              <div className="flex items-center border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="px-3 py-2 hover:bg-muted/50 transition-colors"
                  disabled={quantity <= 1}
                >
                  <span className="material-icons text-sm">remove</span>
                </button>
                <input
                  type="number"
                  min="1"
                  max={maxStock}
                  value={quantity}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 1;
                    setQuantity(Math.min(Math.max(1, val), maxStock));
                  }}
                  className="w-16 text-center text-sm font-medium bg-transparent border-x border-border py-2 focus:outline-none"
                />
                <button
                  onClick={() => setQuantity(Math.min(maxStock, quantity + 1))}
                  className="px-3 py-2 hover:bg-muted/50 transition-colors"
                  disabled={quantity >= maxStock}
                >
                  <span className="material-icons text-sm">add</span>
                </button>
              </div>
            </div>

            {product.designable && (
              <Link
                href={`/design/${product.slug}?siteId=${siteId}`}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-primary text-primary-foreground text-lg font-semibold rounded-xl hover:bg-primary/90 transition-colors"
              >
                <span className="material-icons text-xl">brush</span>
                Customize this product
              </Link>
            )}

            <button
              onClick={addToCart}
              disabled={!inStock || addingToCart || (product.variants.length > 0 && !matchedVariant)}
              className={`w-full flex items-center justify-center gap-3 px-6 py-4 ${
                product.designable
                  ? 'bg-background text-foreground border-2 border-primary hover:bg-primary/5'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              } text-lg font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {addingToCart ? (
                <>
                  <span className="material-icons animate-spin text-xl">refresh</span>
                  Adding...
                </>
              ) : !inStock ? (
                'Out of Stock'
              ) : product.variants.length > 0 && !matchedVariant ? (
                'Select Options'
              ) : (
                <>
                  <span className="material-icons text-xl">shopping_cart</span>
                  {product.designable ? 'Buy as-is' : 'Add to Cart'} — {formatPrice(effectivePrice * quantity)}
                </>
              )}
            </button>

            {/* Cart Message */}
            {cartMessage && (
              <div
                className={`flex items-center gap-2 p-3 rounded-lg text-sm font-medium ${
                  cartMessage.type === 'success'
                    ? 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                    : 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                }`}
              >
                <span className="material-icons text-base">
                  {cartMessage.type === 'success' ? 'check_circle' : 'error'}
                </span>
                {cartMessage.text}
                {cartMessage.type === 'success' && (
                  <Link href="/cart" className="ml-auto underline hover:no-underline">
                    View Cart
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* SKU / Tags */}
          {(product.sku || (product.tags && product.tags.length > 0)) && (
            <div className="border-t border-border pt-6 space-y-2 text-sm text-muted-foreground">
              {product.sku && (
                <div>
                  <span className="font-medium text-foreground">SKU:</span>{' '}
                  {matchedVariant?.sku || product.sku}
                </div>
              )}
              {product.tags && product.tags.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-foreground">Tags:</span>
                  {product.tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 bg-muted rounded-full text-xs">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Full Description */}
      {product.description && (
        <div className="mt-16 border-t border-border pt-12">
          <h2 className="text-2xl font-bold mb-6">Description</h2>
          <div
            className="prose prose-lg dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: product.description }}
          />
        </div>
      )}
    </div>
  );
}
