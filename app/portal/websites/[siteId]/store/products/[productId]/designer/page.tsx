'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import MediaUploadModal from '@/components/admin/MediaUploadModal';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Product {
  id: number;
  name: string;
  designable: boolean;
}

interface ProductStyle {
  id: number;
  productId: number;
  name: string;
  colorHex: string | null;
  thumbnailUrl: string | null;
  priceCents: number | null;
  order: number;
  active: boolean;
}

interface ProductSide {
  id: number;
  styleId: number;
  side: string;
  label: string | null;
  imageUrl: string;
  printableX: number;
  printableY: number;
  printableWidth: number | null;
  printableHeight: number | null;
  order: number;
}

interface DesignAsset {
  id: number;
  websiteId: number;
  type: 'icon' | 'art';
  category: string | null;
  name: string;
  iconName: string | null;
  iconPack: string | null;
  imageUrl: string | null;
  tags: string[];
  order: number;
  active: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const SIDE_OPTIONS = [
  'front',
  'back',
  'left',
  'right',
  'top',
  'bottom',
  'sleeve_left',
  'sleeve_right',
  'custom',
];

const ICON_PACKS = [
  { value: 'fa6', label: 'Font Awesome 6 (fa6)' },
  { value: 'bs', label: 'Bootstrap (bs)' },
  { value: 'ai', label: 'Ant Design (ai)' },
  { value: 'io5', label: 'Ionicons 5 (io5)' },
  { value: 'rx', label: 'Radix (rx)' },
  { value: 'md', label: 'Material (md)' },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function dollarsToCents(d: string): number | null {
  if (!d) return null;
  const n = parseFloat(d);
  return Number.isNaN(n) ? null : Math.round(n * 100);
}

function centsToDollars(c: number | null): string {
  return c == null ? '' : (c / 100).toFixed(2);
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ProductDesignerPage() {
  const { siteId, productId } = useParams<{ siteId: string; productId: string }>();
  const base = `/api/portal/websites/${siteId}/store`;
  const productBase = `${base}/products/${productId}`;

  const [product, setProduct] = useState<Product | null>(null);
  const [styles, setStyles] = useState<ProductStyle[]>([]);
  const [sidesByStyle, setSidesByStyle] = useState<Record<number, ProductSide[]>>({});
  const [expandedStyle, setExpandedStyle] = useState<number | null>(null);
  const [editingStyle, setEditingStyle] = useState<number | null>(null);

  const [icons, setIcons] = useState<DesignAsset[]>([]);
  const [art, setArt] = useState<DesignAsset[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  // ─── Loaders ──────────────────────────────────────────────────────────────

  const loadProduct = useCallback(async () => {
    try {
      const r = await fetch(`${productBase}`, { credentials: 'include' });
      const d = await r.json();
      if (d.success && d.data) {
        setProduct({
          id: d.data.id,
          name: d.data.name,
          designable: !!d.data.designable,
        });
      }
    } catch {
      /* ignore */
    }
  }, [productBase]);

  const loadStyles = useCallback(async () => {
    try {
      const r = await fetch(`${productBase}/styles`, { credentials: 'include' });
      const d = await r.json();
      if (d.success) setStyles(d.data || []);
    } catch {
      /* ignore */
    }
  }, [productBase]);

  const loadSides = useCallback(async (styleId: number) => {
    try {
      const r = await fetch(`${productBase}/styles/${styleId}/sides`, {
        credentials: 'include',
      });
      const d = await r.json();
      if (d.success) {
        setSidesByStyle((prev) => ({ ...prev, [styleId]: d.data || [] }));
      }
    } catch {
      /* ignore */
    }
  }, [productBase]);

  const loadAssets = useCallback(async () => {
    try {
      const [iconRes, artRes] = await Promise.all([
        fetch(`${base}/design-assets?type=icon`, { credentials: 'include' }),
        fetch(`${base}/design-assets?type=art`, { credentials: 'include' }),
      ]);
      const iconData = await iconRes.json();
      const artData = await artRes.json();
      if (iconData.success) setIcons(iconData.data || []);
      if (artData.success) setArt(artData.data || []);
    } catch {
      /* ignore */
    }
  }, [base]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadProduct(), loadStyles(), loadAssets()]).finally(() => setLoading(false));
  }, [loadProduct, loadStyles, loadAssets]);

  // Lazy-load sides when a style is expanded
  useEffect(() => {
    if (expandedStyle != null && sidesByStyle[expandedStyle] === undefined) {
      loadSides(expandedStyle);
    }
  }, [expandedStyle, sidesByStyle, loadSides]);

  // ─── Mutations ────────────────────────────────────────────────────────────

  const flash = (msg: string, ok = true) => {
    if (ok) {
      setSuccess(msg);
      setError('');
      setTimeout(() => setSuccess(''), 2500);
    } else {
      setError(msg);
      setSuccess('');
    }
  };

  const enableDesignable = async () => {
    setBusy(true);
    try {
      const r = await fetch(productBase, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ designable: true }),
      });
      const d = await r.json();
      if (d.success) {
        await loadProduct();
        flash('Customer designer enabled.');
      } else {
        flash(d.message || 'Failed to enable designer.', false);
      }
    } catch {
      flash('Network error.', false);
    } finally {
      setBusy(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center text-muted-foreground">
        Product not found.
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href={`/portal/websites/${siteId}/store/products/${productId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="material-icons text-base">arrow_back</span>
          {product.name}
        </Link>
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <span className="material-icons text-primary">design_services</span>
          Designer Setup
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure the customer designer for <span className="font-medium text-foreground">{product.name}</span>.
        </p>
      </div>

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

      {/* Status banner */}
      <div
        className={`rounded-xl border p-5 flex items-start gap-4 ${
          product.designable
            ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
            : 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800'
        }`}
      >
        <span
          className={`material-icons text-2xl ${
            product.designable ? 'text-green-700 dark:text-green-400' : 'text-yellow-700 dark:text-yellow-400'
          }`}
        >
          {product.designable ? 'check_circle' : 'warning'}
        </span>
        <div className="flex-1 space-y-1">
          <h2 className="font-semibold text-foreground">
            {product.designable ? 'Customer designer is enabled' : 'Customer designer is disabled'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {product.designable
              ? 'Customers see a "Design it" button on this product. Configure styles and sides below.'
              : 'Enable the designer to let customers create their own design on this product.'}
          </p>
        </div>
        {!product.designable && (
          <button
            type="button"
            onClick={enableDesignable}
            disabled={busy}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <span className="material-icons text-base">power_settings_new</span>
            Enable customer designer
          </button>
        )}
      </div>

      {/* Styles section */}
      <StylesSection
        styles={styles}
        sidesByStyle={sidesByStyle}
        expandedStyle={expandedStyle}
        editingStyle={editingStyle}
        productBase={productBase}
        siteId={siteId}
        onExpand={setExpandedStyle}
        onEdit={setEditingStyle}
        onChanged={loadStyles}
        onSidesChanged={loadSides}
        flash={flash}
      />

      {/* Asset library */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowLibrary(!showLibrary)}
          className="w-full px-6 py-4 flex items-center justify-between text-foreground hover:bg-muted/20 transition-colors"
        >
          <span className="font-semibold flex items-center gap-2">
            <span className="material-icons text-lg text-muted-foreground">collections</span>
            Design Asset Library
            <span className="text-xs font-normal text-muted-foreground">
              ({icons.length} icons, {art.length} clipart)
            </span>
          </span>
          <span className="material-icons text-muted-foreground">
            {showLibrary ? 'expand_less' : 'expand_more'}
          </span>
        </button>
        {showLibrary && (
          <div className="px-6 pb-6 space-y-6">
            <p className="text-xs text-muted-foreground">
              Assets here are shared across every designable product on this website.
            </p>
            <AssetSection
              type="icon"
              assets={icons}
              base={base}
              onChanged={loadAssets}
              flash={flash}
            />
            <AssetSection
              type="art"
              assets={art}
              base={base}
              siteId={siteId}
              onChanged={loadAssets}
              flash={flash}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Styles section ─────────────────────────────────────────────────────────

function StylesSection({
  styles,
  sidesByStyle,
  expandedStyle,
  editingStyle,
  productBase,
  siteId,
  onExpand,
  onEdit,
  onChanged,
  onSidesChanged,
  flash,
}: {
  styles: ProductStyle[];
  sidesByStyle: Record<number, ProductSide[]>;
  expandedStyle: number | null;
  editingStyle: number | null;
  productBase: string;
  siteId: string;
  onExpand: (id: number | null) => void;
  onEdit: (id: number | null) => void;
  onChanged: () => Promise<void> | void;
  onSidesChanged: (styleId: number) => Promise<void> | void;
  flash: (m: string, ok?: boolean) => void;
}) {
  const [adding, setAdding] = useState(false);

  const handleDelete = async (s: ProductStyle) => {
    if (!confirm(`Delete style "${s.name}"? This will remove all sides too.`)) return;
    const r = await fetch(`${productBase}/styles/${s.id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const d = await r.json();
    if (d.success) {
      flash('Style deleted.');
      await onChanged();
    } else {
      flash(d.message || 'Failed to delete.', false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-lg text-muted-foreground">palette</span>
          Styles &amp; Variants
          <span className="text-xs font-normal text-muted-foreground">({styles.length})</span>
        </h2>
        <button
          type="button"
          onClick={() => setAdding(!adding)}
          className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <span className="material-icons text-base">{adding ? 'close' : 'add'}</span>
          {adding ? 'Cancel' : 'Add Style'}
        </button>
      </div>

      {adding && (
        <StyleForm
          siteId={siteId}
          productBase={productBase}
          onCancel={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await onChanged();
            flash('Style added.');
          }}
          flash={flash}
        />
      )}

      {styles.length === 0 && !adding ? (
        <div className="text-center py-8 text-sm text-muted-foreground border-2 border-dashed border-border rounded-lg">
          <span className="material-icons text-3xl text-muted-foreground/40 block mb-1">palette</span>
          No styles yet. Add the product variants customers can choose from (e.g. shirt colors).
        </div>
      ) : (
        <div className="space-y-2">
          {styles.map((s) => {
            const isExpanded = expandedStyle === s.id;
            const isEditing = editingStyle === s.id;
            const sides = sidesByStyle[s.id] || [];
            return (
              <div
                key={s.id}
                className="border border-border rounded-lg overflow-hidden bg-background"
              >
                {/* Row */}
                <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/20 transition-colors">
                  <button
                    type="button"
                    onClick={() => onExpand(isExpanded ? null : s.id)}
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                    title={isExpanded ? 'Collapse' : 'Expand'}
                  >
                    <span className="material-icons text-lg">
                      {isExpanded ? 'expand_less' : 'expand_more'}
                    </span>
                  </button>
                  {s.thumbnailUrl ? (
                    <img
                      src={s.thumbnailUrl}
                      alt={s.name}
                      className="w-10 h-10 rounded object-cover border border-border"
                    />
                  ) : (
                    <div
                      className="w-10 h-10 rounded border border-border flex items-center justify-center"
                      style={s.colorHex ? { backgroundColor: s.colorHex } : undefined}
                    >
                      {!s.colorHex && (
                        <span className="material-icons text-muted-foreground text-base">palette</span>
                      )}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{s.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-3">
                      {s.colorHex && <span className="font-mono">{s.colorHex}</span>}
                      <span>{(sidesByStyle[s.id]?.length ?? 0)} side{(sidesByStyle[s.id]?.length ?? 0) === 1 ? '' : 's'}</span>
                      <span>order {s.order}</span>
                      {!s.active && <span className="text-yellow-600">inactive</span>}
                      {s.priceCents != null && (
                        <span>+ ${(s.priceCents / 100).toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onEdit(isEditing ? null : s.id)}
                    className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                    title="Edit style"
                  >
                    <span className="material-icons text-lg">edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(s)}
                    className="p-1.5 text-muted-foreground hover:text-red-600 transition-colors"
                    title="Delete style"
                  >
                    <span className="material-icons text-lg">delete</span>
                  </button>
                </div>

                {/* Inline edit */}
                {isEditing && (
                  <div className="px-3 pb-3 border-t border-border bg-muted/10">
                    <StyleForm
                      siteId={siteId}
                      productBase={productBase}
                      style={s}
                      onCancel={() => onEdit(null)}
                      onSaved={async () => {
                        onEdit(null);
                        await onChanged();
                        flash('Style saved.');
                      }}
                      flash={flash}
                    />
                  </div>
                )}

                {/* Expanded sides */}
                {isExpanded && (
                  <div className="border-t border-border bg-muted/10 px-3 py-3 space-y-3">
                    <SidesPanel
                      styleId={s.id}
                      sides={sides}
                      siteId={siteId}
                      productBase={productBase}
                      onChanged={() => onSidesChanged(s.id)}
                      flash={flash}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Style form (add or edit) ───────────────────────────────────────────────

function StyleForm({
  siteId,
  productBase,
  style,
  onCancel,
  onSaved,
  flash,
}: {
  siteId: string;
  productBase: string;
  style?: ProductStyle;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
  flash: (m: string, ok?: boolean) => void;
}) {
  const isEdit = !!style;
  const [name, setName] = useState(style?.name ?? '');
  const [colorHex, setColorHex] = useState(style?.colorHex ?? '#000000');
  const [priceDollars, setPriceDollars] = useState(centsToDollars(style?.priceCents ?? null));
  const [thumbnailUrl, setThumbnailUrl] = useState(style?.thumbnailUrl ?? '');
  const [order, setOrder] = useState<number>(style?.order ?? 0);
  const [active, setActive] = useState<boolean>(style?.active ?? true);
  const [showUpload, setShowUpload] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const inputClass =
    'w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';
  const labelClass = 'text-xs font-medium text-muted-foreground';

  const save = async () => {
    if (!name.trim()) {
      flash('Name is required.', false);
      return;
    }
    setSaving(true);
    const payload = {
      name: name.trim(),
      colorHex: colorHex || null,
      thumbnailUrl: thumbnailUrl || null,
      priceCents: dollarsToCents(priceDollars),
      order,
      active,
    };
    const url = isEdit ? `${productBase}/styles/${style!.id}` : `${productBase}/styles`;
    const method = isEdit ? 'PUT' : 'POST';
    try {
      const r = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (d.success) {
        await onSaved();
      } else {
        flash(d.message || 'Failed to save style.', false);
      }
    } catch {
      flash('Network error.', false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-muted/20 border border-border rounded-lg p-4 space-y-3 mt-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className={labelClass}>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Black, Heather Grey"
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <label className={labelClass}>Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={colorHex || '#000000'}
              onChange={(e) => setColorHex(e.target.value)}
              className="h-10 w-12 rounded-lg border border-border bg-background cursor-pointer"
            />
            <input
              value={colorHex || ''}
              onChange={(e) => setColorHex(e.target.value)}
              placeholder="#000000"
              className={`${inputClass} font-mono`}
            />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className={labelClass}>Override price ($)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={priceDollars}
            onChange={(e) => setPriceDollars(e.target.value)}
            placeholder="leave blank to use product price"
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <label className={labelClass}>Display order</label>
          <input
            type="number"
            value={order}
            onChange={(e) => setOrder(parseInt(e.target.value, 10) || 0)}
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <label className={labelClass}>Active</label>
          <div className="flex items-center gap-3 pt-1.5">
            <button
              type="button"
              onClick={() => setActive(!active)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                active ? 'bg-primary' : 'bg-border'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  active ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-sm text-muted-foreground">{active ? 'Yes' : 'No'}</span>
          </div>
        </div>
      </div>
      <div className="space-y-1">
        <label className={labelClass}>Thumbnail</label>
        {thumbnailUrl ? (
          <div className="flex items-center gap-3">
            <img
              src={thumbnailUrl}
              alt=""
              className="w-16 h-16 rounded border border-border object-cover"
            />
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="text-xs text-primary hover:underline"
            >
              Change
            </button>
            <button
              type="button"
              onClick={() => setThumbnailUrl('')}
              className="text-xs text-red-600 hover:underline"
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-accent rounded-lg transition-colors"
            >
              <span className="material-icons text-sm">image</span>
              Pick from Media
            </button>
            <button
              type="button"
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-accent rounded-lg transition-colors"
            >
              <span className="material-icons text-sm">upload</span>
              Upload
            </button>
          </div>
        )}
      </div>

      {showUpload && (
        <MediaUploadModal
          onClose={() => setShowUpload(false)}
          onComplete={() => {
            setShowUpload(false);
            // Re-open picker so user can select the freshly uploaded image
            setShowPicker(true);
          }}
          apiEndpoint={`/api/portal/cms/websites/${siteId}/media/upload`}
        />
      )}

      {showPicker && (
        <MediaPicker
          siteId={siteId}
          onClose={() => setShowPicker(false)}
          onPick={(url) => {
            setThumbnailUrl(url);
            setShowPicker(false);
          }}
        />
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving && <span className="material-icons text-base animate-spin">refresh</span>}
          {saving ? 'Saving...' : isEdit ? 'Save Style' : 'Add Style'}
        </button>
      </div>
    </div>
  );
}

// ─── Sides panel (per style) ────────────────────────────────────────────────

function SidesPanel({
  styleId,
  sides,
  siteId,
  productBase,
  onChanged,
  flash,
}: {
  styleId: number;
  sides: ProductSide[];
  siteId: string;
  productBase: string;
  onChanged: () => Promise<void> | void;
  flash: (m: string, ok?: boolean) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editingSide, setEditingSide] = useState<number | null>(null);

  const handleDelete = async (s: ProductSide) => {
    if (!confirm(`Delete side "${s.label || s.side}"?`)) return;
    const r = await fetch(`${productBase}/styles/${styleId}/sides/${s.id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const d = await r.json();
    if (d.success) {
      flash('Side deleted.');
      await onChanged();
    } else {
      flash(d.message || 'Failed to delete side.', false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-base text-muted-foreground">view_in_ar</span>
          Sides
        </h3>
        <button
          type="button"
          onClick={() => setAdding(!adding)}
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-primary hover:bg-accent rounded-lg transition-colors"
        >
          <span className="material-icons text-sm">{adding ? 'close' : 'add'}</span>
          {adding ? 'Cancel' : 'Add Side'}
        </button>
      </div>

      {adding && (
        <SideForm
          styleId={styleId}
          siteId={siteId}
          productBase={productBase}
          onCancel={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await onChanged();
            flash('Side added.');
          }}
          flash={flash}
        />
      )}

      {sides.length === 0 && !adding && (
        <div className="text-xs text-muted-foreground italic px-2 py-3">
          No sides yet. Add at least a front side so the designer has a canvas.
        </div>
      )}

      {sides.map((s) => {
        const isEditing = editingSide === s.id;
        return (
          <div key={s.id} className="border border-border rounded-lg bg-background">
            <div className="flex items-center gap-2 px-2 py-2">
              {s.imageUrl ? (
                <img
                  src={s.imageUrl}
                  alt=""
                  className="w-12 h-12 rounded object-cover border border-border"
                />
              ) : (
                <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
                  <span className="material-icons text-muted-foreground text-base">image</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">
                  {s.label || s.side}
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                  side: {s.side} · printable {s.printableX},{s.printableY}
                  {' '}
                  {s.printableWidth ?? '?'}×{s.printableHeight ?? '?'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingSide(isEditing ? null : s.id)}
                className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                title="Edit"
              >
                <span className="material-icons text-base">edit</span>
              </button>
              <button
                type="button"
                onClick={() => handleDelete(s)}
                className="p-1.5 text-muted-foreground hover:text-red-600 transition-colors"
                title="Delete"
              >
                <span className="material-icons text-base">delete</span>
              </button>
            </div>
            {isEditing && (
              <div className="px-2 pb-2 border-t border-border">
                <SideForm
                  styleId={styleId}
                  siteId={siteId}
                  productBase={productBase}
                  side={s}
                  onCancel={() => setEditingSide(null)}
                  onSaved={async () => {
                    setEditingSide(null);
                    await onChanged();
                    flash('Side saved.');
                  }}
                  flash={flash}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Side form (add or edit) ────────────────────────────────────────────────

function SideForm({
  styleId,
  siteId,
  productBase,
  side,
  onCancel,
  onSaved,
  flash,
}: {
  styleId: number;
  siteId: string;
  productBase: string;
  side?: ProductSide;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
  flash: (m: string, ok?: boolean) => void;
}) {
  const isEdit = !!side;
  const [sideKey, setSideKey] = useState(side?.side ?? 'front');
  const [label, setLabel] = useState(side?.label ?? '');
  const [imageUrl, setImageUrl] = useState(side?.imageUrl ?? '');
  const [printableX, setPrintableX] = useState<number>(side?.printableX ?? 0);
  const [printableY, setPrintableY] = useState<number>(side?.printableY ?? 0);
  const [printableWidth, setPrintableWidth] = useState<string>(
    side?.printableWidth != null ? String(side.printableWidth) : '',
  );
  const [printableHeight, setPrintableHeight] = useState<string>(
    side?.printableHeight != null ? String(side.printableHeight) : '',
  );
  const [order, setOrder] = useState<number>(side?.order ?? 0);
  const [showUpload, setShowUpload] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const inputClass =
    'w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';
  const labelClass = 'text-xs font-medium text-muted-foreground';

  const save = async () => {
    if (!sideKey.trim()) {
      flash('Side key is required.', false);
      return;
    }
    if (!imageUrl.trim()) {
      flash('Mockup image is required.', false);
      return;
    }
    setSaving(true);
    const payload = {
      side: sideKey,
      label: label.trim() || null,
      imageUrl: imageUrl.trim(),
      printableX,
      printableY,
      printableWidth: printableWidth === '' ? null : parseInt(printableWidth, 10),
      printableHeight: printableHeight === '' ? null : parseInt(printableHeight, 10),
      order,
    };
    const url = isEdit
      ? `${productBase}/styles/${styleId}/sides/${side!.id}`
      : `${productBase}/styles/${styleId}/sides`;
    const method = isEdit ? 'PUT' : 'POST';
    try {
      const r = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (d.success) {
        await onSaved();
      } else {
        flash(d.message || 'Failed to save side.', false);
      }
    } catch {
      flash('Network error.', false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-muted/20 border border-border rounded-lg p-4 space-y-3 mt-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className={labelClass}>Side</label>
          <select
            value={sideKey}
            onChange={(e) => setSideKey(e.target.value)}
            className={inputClass}
          >
            {SIDE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className={labelClass}>Label (optional)</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Front of shirt"
            className={inputClass}
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className={labelClass}>Mockup image</label>
        {imageUrl ? (
          <div className="flex items-center gap-3">
            <img
              src={imageUrl}
              alt=""
              className="w-20 h-20 rounded border border-border object-cover"
            />
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="text-xs text-primary hover:underline"
            >
              Change
            </button>
            <button
              type="button"
              onClick={() => setImageUrl('')}
              className="text-xs text-red-600 hover:underline"
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-accent rounded-lg transition-colors"
            >
              <span className="material-icons text-sm">image</span>
              Pick from Media
            </button>
            <button
              type="button"
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-accent rounded-lg transition-colors"
            >
              <span className="material-icons text-sm">upload</span>
              Upload
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="space-y-1">
          <label className={labelClass}>Printable X</label>
          <input
            type="number"
            value={printableX}
            onChange={(e) => setPrintableX(parseInt(e.target.value, 10) || 0)}
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <label className={labelClass}>Printable Y</label>
          <input
            type="number"
            value={printableY}
            onChange={(e) => setPrintableY(parseInt(e.target.value, 10) || 0)}
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <label className={labelClass}>Width (px)</label>
          <input
            type="number"
            value={printableWidth}
            onChange={(e) => setPrintableWidth(e.target.value)}
            placeholder="auto"
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <label className={labelClass}>Height (px)</label>
          <input
            type="number"
            value={printableHeight}
            onChange={(e) => setPrintableHeight(e.target.value)}
            placeholder="auto"
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className={labelClass}>Display order</label>
          <input
            type="number"
            value={order}
            onChange={(e) => setOrder(parseInt(e.target.value, 10) || 0)}
            className={inputClass}
          />
        </div>
      </div>

      {showUpload && (
        <MediaUploadModal
          onClose={() => setShowUpload(false)}
          onComplete={() => {
            setShowUpload(false);
            setShowPicker(true);
          }}
          apiEndpoint={`/api/portal/cms/websites/${siteId}/media/upload`}
        />
      )}

      {showPicker && (
        <MediaPicker
          siteId={siteId}
          onClose={() => setShowPicker(false)}
          onPick={(url) => {
            setImageUrl(url);
            setShowPicker(false);
          }}
        />
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving && <span className="material-icons text-base animate-spin">refresh</span>}
          {saving ? 'Saving...' : isEdit ? 'Save Side' : 'Add Side'}
        </button>
      </div>
    </div>
  );
}

// ─── Asset library section ──────────────────────────────────────────────────

function AssetSection({
  type,
  assets,
  base,
  siteId,
  onChanged,
  flash,
}: {
  type: 'icon' | 'art';
  assets: DesignAsset[];
  base: string;
  siteId?: string;
  onChanged: () => Promise<void> | void;
  flash: (m: string, ok?: boolean) => void;
}) {
  const [adding, setAdding] = useState(false);
  const isIcon = type === 'icon';

  const handleDelete = async (a: DesignAsset) => {
    if (!confirm(`Delete asset "${a.name}"?`)) return;
    const r = await fetch(`${base}/design-assets/${a.id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const d = await r.json();
    if (d.success) {
      flash('Asset deleted.');
      await onChanged();
    } else {
      flash(d.message || 'Failed to delete.', false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-base text-muted-foreground">
            {isIcon ? 'star' : 'image'}
          </span>
          {isIcon ? 'Icons' : 'Clipart'}
          <span className="text-xs font-normal text-muted-foreground">({assets.length})</span>
        </h3>
        <button
          type="button"
          onClick={() => setAdding(!adding)}
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-primary hover:bg-accent rounded-lg transition-colors"
        >
          <span className="material-icons text-sm">{adding ? 'close' : 'add'}</span>
          {adding ? 'Cancel' : isIcon ? 'Add Icon' : 'Add Clipart'}
        </button>
      </div>

      {adding && (
        <AssetForm
          type={type}
          base={base}
          siteId={siteId}
          onCancel={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await onChanged();
            flash(isIcon ? 'Icon added.' : 'Clipart added.');
          }}
          flash={flash}
        />
      )}

      {assets.length === 0 && !adding ? (
        <div className="text-xs text-muted-foreground italic px-2 py-3 border border-dashed border-border rounded-lg">
          No {isIcon ? 'icons' : 'clipart'} yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {assets.map((a) => (
            <div
              key={a.id}
              className="relative group border border-border rounded-lg overflow-hidden bg-background"
            >
              <div className="aspect-square flex items-center justify-center bg-muted/20 p-3">
                {isIcon ? (
                  <div className="text-center">
                    <div className="text-xs font-mono text-foreground">{a.iconName}</div>
                    <div className="text-[10px] text-muted-foreground">{a.iconPack}</div>
                  </div>
                ) : a.imageUrl ? (
                  <img src={a.imageUrl} alt={a.name} className="w-full h-full object-contain" />
                ) : (
                  <span className="material-icons text-muted-foreground">image</span>
                )}
              </div>
              <div className="px-2 py-1.5 border-t border-border">
                <div className="text-xs font-medium text-foreground truncate">{a.name}</div>
                {a.category && (
                  <div className="text-[10px] text-muted-foreground truncate">{a.category}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleDelete(a)}
                className="absolute top-1 right-1 p-1 bg-white/90 rounded-full text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete"
              >
                <span className="material-icons text-sm">close</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Asset form (icon or art) ───────────────────────────────────────────────

function AssetForm({
  type,
  base,
  siteId,
  onCancel,
  onSaved,
  flash,
}: {
  type: 'icon' | 'art';
  base: string;
  siteId?: string;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
  flash: (m: string, ok?: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [iconPack, setIconPack] = useState('fa6');
  const [iconName, setIconName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const inputClass =
    'w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';
  const labelClass = 'text-xs font-medium text-muted-foreground';

  const save = async () => {
    if (!name.trim()) {
      flash('Name is required.', false);
      return;
    }
    if (type === 'icon' && (!iconName.trim() || !iconPack.trim())) {
      flash('Icon pack and name are required.', false);
      return;
    }
    if (type === 'art' && !imageUrl.trim()) {
      flash('Image is required.', false);
      return;
    }
    setSaving(true);
    const payload = {
      type,
      name: name.trim(),
      category: category.trim() || null,
      iconName: type === 'icon' ? iconName.trim() : null,
      iconPack: type === 'icon' ? iconPack.trim() : null,
      imageUrl: type === 'art' ? imageUrl.trim() : null,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };
    try {
      const r = await fetch(`${base}/design-assets`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (d.success) {
        await onSaved();
      } else {
        flash(d.message || 'Failed to save asset.', false);
      }
    } catch {
      flash('Network error.', false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-muted/20 border border-border rounded-lg p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className={labelClass}>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Star, Heart"
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <label className={labelClass}>Category (optional)</label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Sports, Holiday"
            className={inputClass}
          />
        </div>
      </div>

      {type === 'icon' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelClass}>Icon pack</label>
            <select
              value={iconPack}
              onChange={(e) => setIconPack(e.target.value)}
              className={inputClass}
            >
              {ICON_PACKS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Icon name</label>
            <input
              value={iconName}
              onChange={(e) => setIconName(e.target.value)}
              placeholder="e.g. FaStar, BsHeart"
              className={`${inputClass} font-mono`}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <label className={labelClass}>Image</label>
          {imageUrl ? (
            <div className="flex items-center gap-3">
              <img
                src={imageUrl}
                alt=""
                className="w-20 h-20 rounded border border-border object-contain bg-white"
              />
              <button
                type="button"
                onClick={() => setShowPicker(true)}
                className="text-xs text-primary hover:underline"
              >
                Change
              </button>
              <button
                type="button"
                onClick={() => setImageUrl('')}
                className="text-xs text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowPicker(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-accent rounded-lg transition-colors"
              >
                <span className="material-icons text-sm">image</span>
                Pick from Media
              </button>
              <button
                type="button"
                onClick={() => setShowUpload(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-accent rounded-lg transition-colors"
              >
                <span className="material-icons text-sm">upload</span>
                Upload
              </button>
            </div>
          )}
        </div>
      )}

      <div className="space-y-1">
        <label className={labelClass}>Tags</label>
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="comma, separated, tags"
          className={inputClass}
        />
      </div>

      {showUpload && siteId && (
        <MediaUploadModal
          onClose={() => setShowUpload(false)}
          onComplete={() => {
            setShowUpload(false);
            setShowPicker(true);
          }}
          apiEndpoint={`/api/portal/cms/websites/${siteId}/media/upload`}
        />
      )}

      {showPicker && siteId && (
        <MediaPicker
          siteId={siteId}
          onClose={() => setShowPicker(false)}
          onPick={(url) => {
            setImageUrl(url);
            setShowPicker(false);
          }}
        />
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving && <span className="material-icons text-base animate-spin">refresh</span>}
          {saving ? 'Saving...' : 'Add'}
        </button>
      </div>
    </div>
  );
}

// ─── Media picker (small inline modal) ──────────────────────────────────────

interface MediaItem {
  id: number;
  filename: string;
  url: string;
  mimeType: string;
  alt?: string | null;
}

function MediaPicker({
  siteId,
  onClose,
  onPick,
}: {
  siteId: string;
  onClose: () => void;
  onPick: (url: string) => void;
}) {
  const endpoint = `/api/portal/cms/websites/${siteId}/media`;
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '50', mimeType: 'image' });
    if (search) params.append('search', search);
    fetch(`${endpoint}?${params}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setItems(d.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [endpoint, search]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl shadow-xl max-w-4xl w-full mx-4 max-h-[85vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">Select Image</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg transition-colors">
            <span className="material-icons text-muted-foreground">close</span>
          </button>
        </div>
        <div className="p-3 border-b border-border">
          <div className="relative">
            <span className="material-icons text-muted-foreground text-lg absolute left-3 top-1/2 -translate-y-1/2">
              search
            </span>
            <input
              type="text"
              placeholder="Search media..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No images found.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => onPick(it.url)}
                  className="relative rounded-lg border border-border overflow-hidden text-left hover:border-primary/50 transition-colors"
                >
                  {it.mimeType.startsWith('image/') ? (
                    <img
                      src={it.url}
                      alt={it.alt || it.filename}
                      className="w-full aspect-square object-cover"
                    />
                  ) : (
                    <div className="w-full aspect-square flex items-center justify-center bg-muted">
                      <span className="material-icons text-3xl text-muted-foreground">description</span>
                    </div>
                  )}
                  <div className="p-2">
                    <p className="text-xs text-muted-foreground truncate">{it.filename}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
