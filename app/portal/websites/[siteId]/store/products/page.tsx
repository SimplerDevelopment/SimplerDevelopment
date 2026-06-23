'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface Product {
  id: number;
  name: string;
  slug: string;
  status: string;
  priceCents: number;
  compareAtPriceCents?: number | null;
  quantity: number;
  trackInventory: boolean;
  category?: { id: number; name: string } | null;
  images: { id: number; url: string; position: number }[];
  createdAt: string;
}

interface Category {
  id: number;
  name: string;
}

const statusBadge: Record<string, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  archived: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

function formatMoney(cents: number) {
  return '$' + (cents / 100).toFixed(2);
}

export default function ProductsListPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const router = useRouter();
  const base = `/api/portal/websites/${siteId}/store`;

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (categoryFilter) params.set('categoryId', categoryFilter);
      if (search) params.set('search', search);

      const res = await fetch(`${base}/products?${params}`);
      const data = await res.json();
      if (data.success) {
        setProducts(data.data || []);
        setTotalPages(data.pagination?.totalPages || 1);
      }
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  }, [base, page, statusFilter, categoryFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch(`${base}/categories`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setCategories(data.data || []);
      })
      .catch(() => {});
  }, [base]);

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === products.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(products.map((p) => p.id)));
    }
  };

  const bulkDelete = async () => {
    if (!confirm(`Delete ${selected.size} product(s)? This cannot be undone.`)) return;
    setBulkLoading(true);
    try {
      await fetch(`${base}/products/bulk`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      setSelected(new Set());
      load();
    } catch {
      // fail silently
    } finally {
      setBulkLoading(false);
    }
  };

  const bulkChangeStatus = async (status: string) => {
    setBulkLoading(true);
    try {
      await fetch(`${base}/products/bulk`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected), status }),
      });
      setSelected(new Set());
      load();
    } catch {
      // fail silently
    } finally {
      setBulkLoading(false);
    }
  };

  const tabs = [
    { label: 'All', value: 'all' },
    { label: 'Active', value: 'active' },
    { label: 'Draft', value: 'draft' },
    { label: 'Archived', value: 'archived' },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Products</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your store products and inventory.</p>
        </div>
        <Link
          href={`/portal/websites/${siteId}/store/products/new`}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors shrink-0"
        >
          <span className="material-icons text-base">add</span>
          Add Product
        </Link>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => { setStatusFilter(tab.value); setPage(1); }}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                statusFilter === tab.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search + Category filter */}
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <span className="material-icons text-muted-foreground text-lg absolute left-3 top-1/2 -translate-y-1/2">
              search
            </span>
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search products..."
              className="w-full pl-10 pr-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={String(cat.id)}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-accent/50 border border-border rounded-xl">
          <span className="text-sm text-foreground font-medium">{selected.size} selected</span>
          <button
            onClick={() => bulkChangeStatus('active')}
            disabled={bulkLoading}
            className="px-3 py-1 text-xs font-medium rounded-md bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 transition-colors disabled:opacity-50"
          >
            Set Active
          </button>
          <button
            onClick={() => bulkChangeStatus('draft')}
            disabled={bulkLoading}
            className="px-3 py-1 text-xs font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 transition-colors disabled:opacity-50"
          >
            Set Draft
          </button>
          <button
            onClick={() => bulkChangeStatus('archived')}
            disabled={bulkLoading}
            className="px-3 py-1 text-xs font-medium rounded-md bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400 transition-colors disabled:opacity-50"
          >
            Archive
          </button>
          <button
            onClick={bulkDelete}
            disabled={bulkLoading}
            className="px-3 py-1 text-xs font-medium rounded-md bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 transition-colors disabled:opacity-50"
          >
            Delete
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* Products table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
        </div>
      ) : products.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 flex flex-col items-center text-center">
          <span className="material-icons text-4xl text-muted-foreground/40 mb-2">inventory_2</span>
          <h2 className="font-semibold text-foreground mb-1">No products found</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {search || statusFilter !== 'all' || categoryFilter
              ? 'Try adjusting your filters.'
              : 'Add your first product to start selling.'}
          </p>
          {!search && statusFilter === 'all' && !categoryFilter && (
            <Link
              href={`/portal/websites/${siteId}/store/products/new`}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <span className="material-icons text-base">add</span>
              Add Product
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selected.size === products.length && products.length > 0}
                      onChange={toggleAll}
                      className="rounded border-border"
                    />
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground w-14">Image</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Price</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Inventory</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {products.map((product) => (
                  <tr
                    key={product.id}
                    onClick={() => router.push(`/portal/websites/${siteId}/store/products/${product.id}`)}
                    className="hover:bg-muted/20 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(product.id)}
                        onChange={() => toggleSelect(product.id)}
                        className="rounded border-border"
                      />
                    </td>
                    <td className="px-4 py-3">
                      {product.images && product.images.length > 0 ? (
                        <img
                          src={product.images[0].url}
                          alt=""
                          className="w-10 h-10 rounded-lg object-cover border border-border"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-muted/30 border border-border flex items-center justify-center">
                          <span className="material-icons text-muted-foreground text-lg">image</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{product.name}</p>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">/{product.slug}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          statusBadge[product.status] || 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {product.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {formatMoney(product.priceCents)}
                      {product.compareAtPriceCents && (
                        <span className="text-xs text-muted-foreground line-through ml-1.5">
                          {formatMoney(product.compareAtPriceCents)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {product.trackInventory ? product.quantity : <span className="text-xs">Not tracked</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {product.category?.name || <span className="text-muted-foreground/50">--</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-30"
          >
            <span className="material-icons text-lg">chevron_left</span>
          </button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-30"
          >
            <span className="material-icons text-lg">chevron_right</span>
          </button>
        </div>
      )}
    </div>
  );
}
