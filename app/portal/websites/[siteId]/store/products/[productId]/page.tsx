'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import MediaUploadModal from '@/components/admin/MediaUploadModal';
import DesignSurfacesEditor from '@/components/portal/store/DesignSurfacesEditor';

interface ProductImage {
  id?: number;
  url: string;
  altText?: string;
  position: number;
}

interface ProductOption {
  id?: number;
  name: string;
  values: string[];
}

interface ProductVariant {
  id?: number;
  name: string;
  sku: string;
  priceCents: number;
  quantity: number;
  active: boolean;
  options: Record<string, string>;
  printfulVariantId: number | null;
}

interface BulkPricingRule {
  id?: number;
  minQty: number;
  maxQty: number | null;
  type: 'fixed' | 'percent_off';
  amount: number;
}

interface Category {
  id: number;
  name: string;
}

type ProductDesignMode = 'standard' | 'store' | 'customer';

interface ProductForm {
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  status: string;
  featured: boolean;
  isDesignable: boolean;
  designMode: ProductDesignMode;
  metadata: Record<string, string>;
  designable: boolean;
  priceCents: number;
  compareAtPriceCents: number;
  costPriceCents: number;
  sku: string;
  barcode: string;
  trackInventory: boolean;
  quantity: number;
  weight: string;
  weightUnit: string;
  categoryId: string;
  tags: string;
  seoTitle: string;
  seoDescription: string;
  images: ProductImage[];
  options: ProductOption[];
  variants: ProductVariant[];
  bulkPricing: BulkPricingRule[];
  printfulVariantId: number | null;
}

function generateSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function centsToDollars(cents: number) {
  return cents ? (cents / 100).toFixed(2) : '';
}

function dollarsToCents(dollars: string) {
  const num = parseFloat(dollars);
  return isNaN(num) ? 0 : Math.round(num * 100);
}

function moneyToCents(value: unknown) {
  if (value == null || value === '') return 0;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? Math.round(num) : 0;
}

function normalizeOptionValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const row = value as { value?: unknown; label?: unknown };
    if (typeof row.value === 'string') return row.value;
    if (typeof row.label === 'string') return row.label;
  }
  return String(value ?? '');
}

function normalizeProductImage(img: {
  id?: number;
  url: string;
  alt?: string | null;
  altText?: string | null;
  order?: number;
  position?: number;
}, index: number): ProductImage {
  return {
    id: img.id,
    url: img.url,
    altText: img.altText ?? img.alt ?? '',
    position: img.position ?? img.order ?? index,
  };
}

function normalizeProductOption(opt: {
  id?: number;
  name?: string | null;
  values?: unknown[];
}): ProductOption {
  return {
    id: opt.id,
    name: opt.name ?? '',
    values: (opt.values ?? []).map(normalizeOptionValue).filter(Boolean),
  };
}

function normalizeVariant(variant: {
  id?: number;
  name?: string | null;
  sku?: string | null;
  price?: unknown;
  priceCents?: unknown;
  quantity?: number | null;
  active?: boolean | null;
  options?: Record<string, string> | null;
  printfulVariantId?: number | null;
}): ProductVariant {
  return {
    id: variant.id,
    name: variant.name ?? '',
    sku: variant.sku ?? '',
    priceCents: moneyToCents(variant.priceCents ?? variant.price),
    quantity: variant.quantity ?? 0,
    active: variant.active ?? true,
    options: variant.options ?? {},
    printfulVariantId: variant.printfulVariantId ?? null,
  };
}

function normalizeBulkRule(rule: {
  id?: number;
  minQty?: number;
  minQuantity?: number;
  maxQty?: number | null;
  maxQuantity?: number | null;
  type?: 'fixed' | 'percent_off';
  amount?: number | string | null;
}): BulkPricingRule {
  return {
    id: rule.id,
    minQty: rule.minQty ?? rule.minQuantity ?? 1,
    maxQty: rule.maxQty ?? rule.maxQuantity ?? null,
    type: rule.type ?? 'fixed',
    amount: typeof rule.amount === 'string' ? parseFloat(rule.amount) || 0 : rule.amount ?? 0,
  };
}

function normalizeMetadata(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(value)) {
    if (val != null) out[key] = String(val);
  }
  return out;
}

function resolveDesignMode(product: { isDesignable?: boolean; metadata?: unknown }): ProductDesignMode {
  const metadata = normalizeMetadata(product.metadata);
  const raw = metadata.productDesignMode;
  if (raw === 'standard' || raw === 'store' || raw === 'customer') return raw;
  if (product.isDesignable) return 'customer';
  if (metadata.magamommyDesignId || metadata.magamommyLifestyleHeroUrl || metadata.storeDesignId) {
    return 'store';
  }
  return 'standard';
}

const defaultForm: ProductForm = {
  name: '',
  slug: '',
  shortDescription: '',
  description: '',
  status: 'draft',
  featured: false,
  isDesignable: false,
  designMode: 'standard',
  metadata: {},
  designable: false,
  priceCents: 0,
  compareAtPriceCents: 0,
  costPriceCents: 0,
  sku: '',
  barcode: '',
  trackInventory: false,
  quantity: 0,
  weight: '',
  weightUnit: 'g',
  categoryId: '',
  tags: '',
  seoTitle: '',
  seoDescription: '',
  images: [],
  options: [],
  variants: [],
  bulkPricing: [],
  printfulVariantId: null,
};

export default function ProductEditPage() {
  const { siteId, productId } = useParams<{ siteId: string; productId: string }>();
  const router = useRouter();
  const isNew = productId === 'new';
  const base = `/api/portal/websites/${siteId}/store`;

  const [form, setForm] = useState<ProductForm>({ ...defaultForm });
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showSeo, setShowSeo] = useState(false);
  const [showVariants, setShowVariants] = useState(false);
  const [showBulkPricing, setShowBulkPricing] = useState(false);
  const [showCustomization, setShowCustomization] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [showMediaUpload, setShowMediaUpload] = useState(false);
  const [mediaItems, setMediaItems] = useState<{ id: number; filename: string; url: string; mimeType: string; alt?: string | null }[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaSearch, setMediaSearch] = useState('');
  const mediaEndpoint = `/api/portal/cms/websites/${siteId}/media`;

  useEffect(() => {
    fetch(`${base}/categories`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setCategories(data.data || []);
      })
      .catch(() => {});
  }, [base]);

  useEffect(() => {
    if (isNew) return;
    fetch(`${base}/products/${productId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data) {
          const p = data.data;
          const metadata = normalizeMetadata(p.metadata);
          const designMode = resolveDesignMode(p);
          setForm({
            name: p.name || '',
            slug: p.slug || '',
            shortDescription: p.shortDescription || '',
            description: p.description || '',
            status: p.status || 'draft',
            featured: p.featured || false,
            isDesignable: designMode === 'customer',
            designMode,
            metadata,
            designable: p.designable || false,
            priceCents: moneyToCents(p.priceCents ?? p.price),
            compareAtPriceCents: moneyToCents(p.compareAtPriceCents ?? p.compareAtPrice),
            costPriceCents: moneyToCents(p.costPriceCents ?? p.costPrice),
            sku: p.sku || '',
            barcode: p.barcode || '',
            trackInventory: p.trackInventory || false,
            quantity: p.quantity || 0,
            weight: p.weight ? String(p.weight) : '',
            weightUnit: p.weightUnit || 'g',
            categoryId: p.categoryId ? String(p.categoryId) : '',
            tags: (p.tags || []).join(', '),
            seoTitle: p.seoTitle || '',
            seoDescription: p.seoDescription || '',
            images: (p.images || []).map(normalizeProductImage),
            options: (p.options || []).map(normalizeProductOption),
            variants: (p.variants || []).map(normalizeVariant),
            bulkPricing: (p.bulkPricing || p.bulkPricingRules || []).map(normalizeBulkRule),
            printfulVariantId: p.printfulVariantId ?? null,
          });
          if (p.seoTitle || p.seoDescription) setShowSeo(true);
          if (p.options?.length || p.variants?.length) setShowVariants(true);
          if (p.bulkPricing?.length) setShowBulkPricing(true);
          if (designMode !== 'standard') setShowCustomization(true);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [base, productId, isNew]);

  const updateField = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError('');
    setSuccess('');
  };

  const setDesignMode = async (mode: ProductDesignMode) => {
    const metadata = { ...form.metadata, productDesignMode: mode };
    const isDesignable = mode === 'customer';
    setForm((prev) => ({
      ...prev,
      designMode: mode,
      isDesignable,
      metadata,
    }));
    setError('');
    setSuccess('');
    if (!isNew) {
      try {
        await fetch(`${base}/products/${productId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isDesignable, metadata }),
        });
      } catch {
        // Non-fatal. A later full save will surface any persistent issue.
      }
    }
  };

  const handleNameChange = (name: string) => {
    setForm((prev) => ({
      ...prev,
      name,
      slug: isNew && !prev.slug ? generateSlug(name) : prev.slug,
    }));
    setError('');
    setSuccess('');
  };

  const fetchMedia = useCallback(async (searchTerm?: string) => {
    setMediaLoading(true);
    const params = new URLSearchParams({ limit: '50', mimeType: 'image' });
    if (searchTerm) params.append('search', searchTerm);
    try {
      const res = await fetch(`${mediaEndpoint}?${params}`);
      const data = await res.json();
      if (data.success) setMediaItems(data.data || []);
    } catch { /* ignore */ }
    setMediaLoading(false);
  }, [mediaEndpoint]);

  useEffect(() => {
    if (showMediaPicker) {
      void Promise.resolve().then(() => fetchMedia(mediaSearch));
    }
  }, [showMediaPicker, mediaSearch, fetchMedia]);

  const addImageFromMedia = (url: string) => {
    const alreadyAdded = form.images.some(img => img.url === url);
    if (alreadyAdded) return;
    const newImg: ProductImage = { url, position: form.images.length };
    updateField('images', [...form.images, newImg]);
  };

  const removeImage = (index: number) => {
    const updated = form.images.filter((_, i) => i !== index).map((img, i) => ({ ...img, position: i }));
    updateField('images', updated);
  };

  const addOption = () => {
    updateField('options', [...form.options, { name: '', values: [] }]);
  };

  const updateOption = (index: number, field: 'name' | 'values', value: string | string[]) => {
    const updated = [...form.options];
    if (field === 'name') {
      updated[index] = { ...updated[index], name: value as string };
    } else {
      updated[index] = { ...updated[index], values: value as string[] };
    }
    updateField('options', updated);
  };

  const removeOption = (index: number) => {
    updateField('options', form.options.filter((_, i) => i !== index));
  };

  const generateVariants = () => {
    const validOptions = form.options.filter((o) => o.name && o.values.length > 0);
    if (validOptions.length === 0) return;

    const combinations: Record<string, string>[] = [{}];
    for (const opt of validOptions) {
      const newCombinations: Record<string, string>[] = [];
      for (const combo of combinations) {
        for (const val of opt.values) {
          newCombinations.push({ ...combo, [opt.name]: val });
        }
      }
      combinations.length = 0;
      combinations.push(...newCombinations);
    }

    const variants: ProductVariant[] = combinations.map((combo) => ({
      name: Object.values(combo).join(' / '),
      sku: '',
      priceCents: form.priceCents,
      quantity: 0,
      active: true,
      options: combo,
      printfulVariantId: null,
    }));
    updateField('variants', variants);
  };

  const updateVariant = (index: number, field: keyof ProductVariant, value: unknown) => {
    const updated = [...form.variants];
    updated[index] = { ...updated[index], [field]: value };
    updateField('variants', updated);
  };

  const addBulkRule = () => {
    updateField('bulkPricing', [
      ...form.bulkPricing,
      { minQty: 1, maxQty: null, type: 'fixed' as const, amount: 0 },
    ]);
  };

  const updateBulkRule = (index: number, field: keyof BulkPricingRule, value: unknown) => {
    const updated = [...form.bulkPricing];
    updated[index] = { ...updated[index], [field]: value };
    updateField('bulkPricing', updated);
  };

  const removeBulkRule = (index: number) => {
    updateField('bulkPricing', form.bulkPricing.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError('Product name is required.');
      return;
    }
    if (!form.slug.trim()) {
      setError('Slug is required.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    const payload = {
      ...form,
      price: form.priceCents,
      compareAtPrice: form.compareAtPriceCents || null,
      costPrice: form.costPriceCents || null,
      categoryId: form.categoryId ? parseInt(form.categoryId) : null,
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      weight: form.weight ? parseFloat(form.weight) : null,
      images: form.images.map((img, idx) => ({
        url: img.url,
        alt: img.altText || null,
        order: idx,
      })),
      isDesignable: form.designMode === 'customer',
      metadata: {
        ...form.metadata,
        productDesignMode: form.designMode,
      },
    };

    try {
      const url = isNew ? `${base}/products` : `${base}/products/${productId}`;
      const method = isNew ? 'POST' : 'PUT';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(isNew ? 'Product created!' : 'Product saved!');
        if (isNew && data.data?.id) {
          router.replace(`/portal/websites/${siteId}/store/products/${data.data.id}`);
        }
      } else {
        setError(data.message || 'Failed to save.');
      }
    } catch {
      setError('Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    );
  }

  const inputClass =
    'w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';
  const labelClass = 'text-sm font-medium text-foreground';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb + Save */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href={`/portal/websites/${siteId}/store/products`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="material-icons text-base">arrow_back</span>
          Products
        </Link>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving && <span className="material-icons text-base animate-spin">refresh</span>}
          {saving ? 'Saving...' : 'Save Product'}
        </button>
      </div>

      {/* Title */}
      <h1 className="text-2xl font-bold text-foreground">{isNew ? 'New Product' : 'Edit Product'}</h1>

      {/* Designer tab link */}
      {!isNew && form.designable && (
        <div className="flex items-center gap-2">
          <Link
            href={`/portal/websites/${siteId}/store/products/${productId}/designer`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-foreground rounded-lg text-sm font-medium hover:bg-accent/80 transition-colors"
          >
            <span className="material-icons text-base">design_services</span>
            Open Designer Setup
          </Link>
          <span className="text-xs text-muted-foreground">
            Configure styles, sides, and the asset library for the customer designer.
          </span>
        </div>
      )}

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          <span className="material-icons text-base">error</span>
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm dark:bg-green-900/20 dark:border-green-800 dark:text-green-400">
          <span className="material-icons text-base">check_circle</span>
          {success}
        </div>
      )}

      {/* Basic Info */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-lg text-muted-foreground">info</span>
          Basic Information
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className={labelClass}>Name</label>
            <input value={form.name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Product name" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Slug</label>
            <input
              value={form.slug}
              onChange={(e) => updateField('slug', e.target.value)}
              placeholder="product-slug"
              className={`${inputClass} font-mono`}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className={labelClass}>Short Description</label>
          <input
            value={form.shortDescription}
            onChange={(e) => updateField('shortDescription', e.target.value)}
            placeholder="Brief summary"
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelClass}>Description</label>
          <textarea
            value={form.description}
            onChange={(e) => updateField('description', e.target.value)}
            placeholder="Full product description..."
            rows={5}
            className={inputClass}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className={labelClass}>Status</label>
            <select value={form.status} onChange={(e) => updateField('status', e.target.value)} className={inputClass}>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Featured</label>
            <div className="flex items-center gap-3 pt-1.5">
              <button
                type="button"
                onClick={() => updateField('featured', !form.featured)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  form.featured ? 'bg-primary' : 'bg-border'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    form.featured ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-sm text-muted-foreground">{form.featured ? 'Yes' : 'No'}</span>
            </div>
          </div>
        </div>
        <div className="space-y-1.5 pt-2 border-t border-border">
          <label className={labelClass}>Customer-designable product</label>
          <div className="flex items-start gap-3 pt-1.5">
            <button
              type="button"
              onClick={() => updateField('designable', !form.designable)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                form.designable ? 'bg-primary' : 'bg-border'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  form.designable ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <div className="flex-1">
              <span className="text-sm text-muted-foreground block">
                {form.designable ? 'Enabled' : 'Disabled'}
              </span>
              <p className="text-xs text-muted-foreground mt-0.5">
                Lets customers create their own design on this product. Set up styles &amp; sides in the Designer tab.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-lg text-muted-foreground">payments</span>
          Pricing
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className={labelClass}>Price ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={centsToDollars(form.priceCents)}
              onChange={(e) => updateField('priceCents', dollarsToCents(e.target.value))}
              placeholder="0.00"
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Compare at Price ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={centsToDollars(form.compareAtPriceCents)}
              onChange={(e) => updateField('compareAtPriceCents', dollarsToCents(e.target.value))}
              placeholder="0.00"
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Cost Price ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={centsToDollars(form.costPriceCents)}
              onChange={(e) => updateField('costPriceCents', dollarsToCents(e.target.value))}
              placeholder="0.00"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Inventory */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-lg text-muted-foreground">inventory</span>
          Inventory
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className={labelClass}>SKU</label>
            <input value={form.sku} onChange={(e) => updateField('sku', e.target.value)} placeholder="SKU-001" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Barcode</label>
            <input value={form.barcode} onChange={(e) => updateField('barcode', e.target.value)} placeholder="123456789" className={inputClass} />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className={labelClass}>Track Inventory</label>
          <div className="flex items-center gap-3 pt-1.5">
            <button
              type="button"
              onClick={() => updateField('trackInventory', !form.trackInventory)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                form.trackInventory ? 'bg-primary' : 'bg-border'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  form.trackInventory ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-sm text-muted-foreground">{form.trackInventory ? 'Enabled' : 'Disabled'}</span>
          </div>
        </div>
        {form.trackInventory && (
          <div className="space-y-1.5 max-w-xs">
            <label className={labelClass}>Quantity</label>
            <input
              type="number"
              min="0"
              value={form.quantity}
              onChange={(e) => updateField('quantity', parseInt(e.target.value) || 0)}
              className={inputClass}
            />
          </div>
        )}
      </div>

      {/* Shipping */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-lg text-muted-foreground">local_shipping</span>
          Shipping
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className={labelClass}>Weight</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.weight}
              onChange={(e) => updateField('weight', e.target.value)}
              placeholder="0"
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Weight Unit</label>
            <select value={form.weightUnit} onChange={(e) => updateField('weightUnit', e.target.value)} className={inputClass}>
              <option value="g">Grams (g)</option>
              <option value="kg">Kilograms (kg)</option>
              <option value="oz">Ounces (oz)</option>
              <option value="lb">Pounds (lb)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Fulfillment */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-lg text-muted-foreground">print</span>
          Fulfillment
        </h2>
        {form.variants.length === 0 ? (
          <div className="space-y-1.5 max-w-xs">
            <label className={labelClass}>Printful Variant ID</label>
            <input
              type="number"
              min="1"
              value={form.printfulVariantId ?? ''}
              onChange={(e) =>
                updateField('printfulVariantId', e.target.value ? parseInt(e.target.value) : null)
              }
              placeholder="e.g. 4012"
              className={inputClass}
            />
            <p className="text-xs text-muted-foreground">
              Printful catalog variant ID — find this in Printful&apos;s Product Catalog. Required for automatic print-on-demand fulfillment via Printful.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Set the Printful Variant ID per variant in the Options &amp; Variants section below. Required for automatic print-on-demand fulfillment via Printful.
            </p>
          </div>
        )}
      </div>

      {/* Images */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <span className="material-icons text-lg text-muted-foreground">photo_library</span>
            Images
          </h2>
          <button
            type="button"
            onClick={() => setShowMediaPicker(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <span className="material-icons text-base">add_photo_alternate</span>
            Add from Media
          </button>
        </div>
        {form.images.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {form.images.map((img, i) => (
              <div key={i} className="relative group rounded-lg border border-border overflow-hidden aspect-square">
                <img src={img.url} alt={img.altText || ''} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  {i > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const updated = [...form.images];
                        [updated[i - 1], updated[i]] = [updated[i], updated[i - 1]];
                        updateField('images', updated.map((img, idx) => ({ ...img, position: idx })));
                      }}
                      className="p-1.5 bg-white/90 rounded-full text-foreground hover:bg-white transition-colors"
                      title="Move left"
                    >
                      <span className="material-icons text-lg">chevron_left</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="p-1.5 bg-white/90 rounded-full text-red-600 hover:bg-white transition-colors"
                  >
                    <span className="material-icons text-lg">close</span>
                  </button>
                  {i < form.images.length - 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const updated = [...form.images];
                        [updated[i], updated[i + 1]] = [updated[i + 1], updated[i]];
                        updateField('images', updated.map((img, idx) => ({ ...img, position: idx })));
                      }}
                      className="p-1.5 bg-white/90 rounded-full text-foreground hover:bg-white transition-colors"
                      title="Move right"
                    >
                      <span className="material-icons text-lg">chevron_right</span>
                    </button>
                  )}
                </div>
                <span className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                  {i === 0 ? 'Main' : `#${i + 1}`}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowMediaPicker(true)}
            className="w-full rounded-lg border-2 border-dashed border-border px-6 py-10 text-center hover:border-primary/50 transition-colors"
          >
            <span className="material-icons text-3xl text-muted-foreground/40 block mb-1">add_photo_alternate</span>
            <span className="text-sm text-muted-foreground">Click to add images from the media library</span>
          </button>
        )}
      </div>

      {/* Media Picker Modal */}
      {showMediaPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl shadow-xl max-w-5xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">Select Images</h2>
              <button onClick={() => setShowMediaPicker(false)} className="p-1 hover:bg-muted rounded-lg transition-colors">
                <span className="material-icons text-muted-foreground">close</span>
              </button>
            </div>
            <div className="p-4 border-b border-border flex items-center gap-2">
              <div className="flex-1 relative">
                <span className="material-icons text-muted-foreground text-lg absolute left-3 top-1/2 -translate-y-1/2">search</span>
                <input
                  type="text"
                  placeholder="Search media..."
                  value={mediaSearch}
                  onChange={(e) => setMediaSearch(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowMediaUpload(true)}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <span className="material-icons text-base">upload</span>
                Upload New
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {mediaLoading ? (
                <div className="flex items-center justify-center py-16">
                  <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
                </div>
              ) : mediaItems.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <span className="material-icons text-4xl text-muted-foreground/40 block mb-2">photo_library</span>
                  No images found. Upload some to get started.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {mediaItems.map((item) => {
                    const isSelected = form.images.some(img => img.url === item.url);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            updateField('images', form.images.filter(img => img.url !== item.url).map((img, idx) => ({ ...img, position: idx })));
                          } else {
                            addImageFromMedia(item.url);
                          }
                        }}
                        className={`relative rounded-lg border overflow-hidden text-left transition-all ${
                          isSelected
                            ? 'border-primary ring-2 ring-primary/30'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        {item.mimeType.startsWith('image/') ? (
                          <img src={item.url} alt={item.alt || item.filename} className="w-full aspect-square object-cover" />
                        ) : (
                          <div className="w-full aspect-square flex items-center justify-center bg-muted">
                            <span className="material-icons text-4xl text-muted-foreground">description</span>
                          </div>
                        )}
                        <div className="p-2">
                          <p className="text-xs text-muted-foreground truncate">{item.filename}</p>
                        </div>
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                            <span className="material-icons text-sm">check</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-border flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {form.images.length} image{form.images.length !== 1 ? 's' : ''} selected
              </span>
              <button
                type="button"
                onClick={() => setShowMediaPicker(false)}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {showMediaUpload && (
        <MediaUploadModal
          onClose={() => setShowMediaUpload(false)}
          onComplete={() => {
            setShowMediaUpload(false);
            fetchMedia(mediaSearch);
          }}
          apiEndpoint={`${mediaEndpoint}/upload`}
        />
      )}

      {/* Category & Tags */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-lg text-muted-foreground">category</span>
          Category & Tags
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className={labelClass}>Category</label>
            <select value={form.categoryId} onChange={(e) => updateField('categoryId', e.target.value)} className={inputClass}>
              <option value="">No category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={String(cat.id)}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Tags</label>
            <input
              value={form.tags}
              onChange={(e) => updateField('tags', e.target.value)}
              placeholder="tag1, tag2, tag3"
              className={inputClass}
            />
            <p className="text-xs text-muted-foreground">Comma separated</p>
          </div>
        </div>
      </div>

      {/* SEO (collapsible) */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowSeo(!showSeo)}
          className="w-full px-6 py-4 flex items-center justify-between text-foreground hover:bg-muted/20 transition-colors"
        >
          <span className="font-semibold flex items-center gap-2">
            <span className="material-icons text-lg text-muted-foreground">search</span>
            SEO Settings
          </span>
          <span className="material-icons text-muted-foreground">{showSeo ? 'expand_less' : 'expand_more'}</span>
        </button>
        {showSeo && (
          <div className="px-6 pb-6 space-y-4">
            <div className="space-y-1.5">
              <label className={labelClass}>SEO Title</label>
              <input
                value={form.seoTitle}
                onChange={(e) => updateField('seoTitle', e.target.value)}
                placeholder="Page title for search engines"
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>SEO Description</label>
              <textarea
                value={form.seoDescription}
                onChange={(e) => updateField('seoDescription', e.target.value)}
                placeholder="Meta description for search engines"
                rows={3}
                className={inputClass}
              />
            </div>
          </div>
        )}
      </div>

      {/* Options & Variants (collapsible) */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowVariants(!showVariants)}
          className="w-full px-6 py-4 flex items-center justify-between text-foreground hover:bg-muted/20 transition-colors"
        >
          <span className="font-semibold flex items-center gap-2">
            <span className="material-icons text-lg text-muted-foreground">tune</span>
            Options & Variants
          </span>
          <span className="material-icons text-muted-foreground">{showVariants ? 'expand_less' : 'expand_more'}</span>
        </button>
        {showVariants && (
          <div className="px-6 pb-6 space-y-4">
            {/* Options */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className={labelClass}>Options</label>
                <button
                  type="button"
                  onClick={addOption}
                  className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-primary hover:bg-accent rounded-lg transition-colors"
                >
                  <span className="material-icons text-sm">add</span>
                  Add Option
                </button>
              </div>
              {form.options.map((opt, i) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-muted/20 rounded-lg">
                  <div className="space-y-1.5 flex-1">
                    <input
                      value={opt.name}
                      onChange={(e) => updateOption(i, 'name', e.target.value)}
                      placeholder="Option name (e.g. Color, Size)"
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-1.5 flex-[2]">
                    <input
                      value={opt.values.join(', ')}
                      onChange={(e) =>
                        updateOption(
                          i,
                          'values',
                          e.target.value.split(',').map((v) => v.trim()).filter(Boolean)
                        )
                      }
                      placeholder="Values (comma separated, e.g. Red, Blue, Green)"
                      className={inputClass}
                    />
                    {opt.values.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {opt.values.map((v, vi) => (
                          <span key={vi} className="inline-flex items-center px-2 py-0.5 bg-accent text-foreground text-xs rounded-full">
                            {v}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeOption(i)}
                    className="p-1 text-muted-foreground hover:text-red-600 transition-colors mt-1"
                  >
                    <span className="material-icons text-lg">delete</span>
                  </button>
                </div>
              ))}
            </div>

            {/* Generate Variants */}
            {form.options.some((o) => o.name && o.values.length > 0) && (
              <button
                type="button"
                onClick={generateVariants}
                className="flex items-center gap-2 px-4 py-2 bg-accent text-foreground rounded-lg text-sm font-medium hover:bg-accent/80 transition-colors"
              >
                <span className="material-icons text-base">auto_awesome</span>
                Generate Variants
              </button>
            )}

            {/* Variants Table */}
            {form.variants.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Variant</th>
                      <th className="px-3 py-2 text-xs font-medium text-muted-foreground">SKU</th>
                      <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Price ($)</th>
                      <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Quantity</th>
                      <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Printful ID</th>
                      <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Active</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {form.variants.map((variant, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 font-medium text-foreground">{variant.name}</td>
                        <td className="px-3 py-2">
                          <input
                            value={variant.sku}
                            onChange={(e) => updateVariant(i, 'sku', e.target.value)}
                            className="w-24 px-2 py-1 rounded border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={centsToDollars(variant.priceCents)}
                            onChange={(e) => updateVariant(i, 'priceCents', dollarsToCents(e.target.value))}
                            className="w-20 px-2 py-1 rounded border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            value={variant.quantity}
                            onChange={(e) => updateVariant(i, 'quantity', parseInt(e.target.value) || 0)}
                            className="w-16 px-2 py-1 rounded border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="1"
                            value={variant.printfulVariantId ?? ''}
                            onChange={(e) =>
                              updateVariant(
                                i,
                                'printfulVariantId',
                                e.target.value ? parseInt(e.target.value) : null,
                              )
                            }
                            placeholder="—"
                            className="w-20 px-2 py-1 rounded border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => updateVariant(i, 'active', !variant.active)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                              variant.active ? 'bg-primary' : 'bg-border'
                            }`}
                          >
                            <span
                              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                variant.active ? 'translate-x-4.5' : 'translate-x-0.5'
                              }`}
                            />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Customization (collapsible) — store-authored vs customer-authored design modes */}
      {!isNew && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowCustomization(!showCustomization)}
            className="w-full px-6 py-4 flex items-center justify-between text-foreground hover:bg-muted/20 transition-colors"
          >
            <span className="font-semibold flex items-center gap-2">
              <span className="material-icons text-lg text-muted-foreground">brush</span>
              Customization
            </span>
            <span className="material-icons text-muted-foreground">{showCustomization ? 'expand_less' : 'expand_more'}</span>
          </button>
          {showCustomization && (
            <div className="px-6 pb-6 space-y-4">
              <div className="space-y-3">
                <label className={labelClass}>Product design type</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setDesignMode('standard')}
                    className={`text-left rounded-lg border p-3 transition-colors ${
                      form.designMode === 'standard'
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-background hover:bg-muted/30 text-muted-foreground'
                    }`}
                  >
                    <span className="material-icons text-lg block mb-1">inventory_2</span>
                    <span className="block text-sm font-medium">Standard product</span>
                    <span className="block text-xs mt-1">Sold as-is using product photos.</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDesignMode('store')}
                    className={`text-left rounded-lg border p-3 transition-colors ${
                      form.designMode === 'store'
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-background hover:bg-muted/30 text-muted-foreground'
                    }`}
                  >
                    <span className="material-icons text-lg block mb-1">brush</span>
                    <span className="block text-sm font-medium">Store-designed</span>
                    <span className="block text-xs mt-1">The store owns the artwork; customers buy the finished design.</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDesignMode('customer')}
                    className={`text-left rounded-lg border p-3 transition-colors ${
                      form.designMode === 'customer'
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-background hover:bg-muted/30 text-muted-foreground'
                    }`}
                  >
                    <span className="material-icons text-lg block mb-1">edit</span>
                    <span className="block text-sm font-medium">Customer-customizable</span>
                    <span className="block text-xs mt-1">Customers see the public designer and create their own version.</span>
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Store-designed products can still use design/template records and rendered product images, but only customer-customizable products expose the storefront Customize button.
                </p>
              </div>
              {form.designMode !== 'standard' && (
                <div className="pt-2 border-t border-border space-y-4">
                  {/* Open in Designer — store-designed products only. Customers
                      can't reach the canvas (the public route redirects to
                      /shop), but staff with site access can edit the saved
                      design via /sites/<domain>/designer/<slug>?staff=1.
                      Routed through the portal page so we don't expose the
                      ?staff=1 link directly in customer-facing UI. */}
                  {form.designMode === 'store' && (
                    <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 flex items-center justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <span className="material-icons text-primary">design_services</span>
                        <div>
                          <div className="text-sm font-semibold text-foreground">Edit this product&apos;s design</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Opens the same canvas editor customers use, in staff mode — load the saved layers, tweak them, save back to the same design row. Skips add-to-cart.
                          </div>
                        </div>
                      </div>
                      <a
                        href={`/portal/websites/${siteId}/store/products/${productId}/designer`}
                        target="_blank"
                        rel="noopener"
                        className="shrink-0 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        <span className="material-icons text-base">open_in_new</span>
                        Open in Designer
                      </a>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mb-3">
                    Each surface (front/back/sleeve…) defines the printable area. Customer-customizable products use these in the public designer; store-designed products use them for store-authored templates and fulfillment.
                  </p>
                  <DesignSurfacesEditor productId={parseInt(productId)} siteId={siteId} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bulk Pricing (collapsible) */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowBulkPricing(!showBulkPricing)}
          className="w-full px-6 py-4 flex items-center justify-between text-foreground hover:bg-muted/20 transition-colors"
        >
          <span className="font-semibold flex items-center gap-2">
            <span className="material-icons text-lg text-muted-foreground">price_change</span>
            Bulk Pricing
          </span>
          <span className="material-icons text-muted-foreground">{showBulkPricing ? 'expand_less' : 'expand_more'}</span>
        </button>
        {showBulkPricing && (
          <div className="px-6 pb-6 space-y-4">
            {form.bulkPricing.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Min Qty</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Max Qty</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Type</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Amount</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {form.bulkPricing.map((rule, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="1"
                          value={rule.minQty}
                          onChange={(e) => updateBulkRule(i, 'minQty', parseInt(e.target.value) || 1)}
                          className="w-16 px-2 py-1 rounded border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          value={rule.maxQty ?? ''}
                          onChange={(e) =>
                            updateBulkRule(i, 'maxQty', e.target.value ? parseInt(e.target.value) : null)
                          }
                          placeholder="No limit"
                          className="w-20 px-2 py-1 rounded border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={rule.type}
                          onChange={(e) => updateBulkRule(i, 'type', e.target.value)}
                          className="px-2 py-1 rounded border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                        >
                          <option value="fixed">Fixed Price</option>
                          <option value="percent_off">Percent Off</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={rule.amount}
                          onChange={(e) => updateBulkRule(i, 'amount', parseFloat(e.target.value) || 0)}
                          className="w-20 px-2 py-1 rounded border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => removeBulkRule(i)}
                          className="p-1 text-muted-foreground hover:text-red-600 transition-colors"
                        >
                          <span className="material-icons text-base">delete</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <button
              type="button"
              onClick={addBulkRule}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary hover:bg-accent rounded-lg transition-colors"
            >
              <span className="material-icons text-sm">add</span>
              Add Rule
            </button>
          </div>
        )}
      </div>

      {/* Bottom save */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving && <span className="material-icons text-base animate-spin">refresh</span>}
          {saving ? 'Saving...' : 'Save Product'}
        </button>
      </div>
    </div>
  );
}
