'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { slugify } from '@/lib/publishing/slug';

interface ProductCategory {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  parentId?: number | null;
  parentName?: string | null;
  productCount?: number;
}

export default function StoreCategoriesPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const base = `/api/portal/websites/${siteId}/store/categories`;

  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ProductCategory | null>(null);
  const [form, setForm] = useState({ name: '', slug: '', description: '', imageUrl: '', parentId: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(base);
      const data = await res.json();
      if (data.success) setCategories(data.data || []);
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', slug: '', description: '', imageUrl: '', parentId: '' });
    setShowForm(true);
    setError('');
    setSuccess('');
  };

  const openEdit = (cat: ProductCategory) => {
    setEditing(cat);
    setForm({
      name: cat.name,
      slug: cat.slug,
      description: cat.description || '',
      imageUrl: cat.imageUrl || '',
      parentId: cat.parentId ? String(cat.parentId) : '',
    });
    setShowForm(true);
    setError('');
    setSuccess('');
  };

  const handleNameChange = (name: string) => {
    setForm((prev) => ({
      ...prev,
      name,
      slug: !editing ? slugify(name) : prev.slug,
    }));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        name: form.name,
        slug: form.slug,
        description: form.description || null,
        imageUrl: form.imageUrl || null,
        parentId: form.parentId ? parseInt(form.parentId) : null,
      };
      const url = editing ? `${base}/${editing.id}` : base;
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setShowForm(false);
        setEditing(null);
        setSuccess(editing ? 'Category updated.' : 'Category created.');
        load();
      } else {
        setError(data.message || 'Failed to save.');
      }
    } catch {
      setError('Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this category? Products will be uncategorized, not deleted.')) return;
    setSuccess('');
    try {
      await fetch(`${base}/${id}`, { method: 'DELETE' });
      setSuccess('Category deleted.');
      load();
    } catch {
      setError('Failed to delete.');
    }
  };

  const inputClass =
    'w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    );
  }

  // Build parent options (exclude current editing category)
  const parentOptions = categories.filter((c) => !editing || c.id !== editing.id);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Product Categories</h1>
          <p className="text-muted-foreground text-sm mt-1">Organize products into categories.</p>
        </div>
        <button
          onClick={showForm ? () => setShowForm(false) : openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <span className="material-icons text-base">{showForm ? 'close' : 'add'}</span>
          {showForm ? 'Cancel' : 'Add Category'}
        </button>
      </div>

      {/* Messages */}
      {error && !showForm && (
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

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-foreground">{editing ? 'Edit Category' : 'New Category'}</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Name</label>
              <input
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                required
                placeholder="e.g. T-Shirts"
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Slug</label>
              <input
                value={form.slug}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, slug: e.target.value }));
                  setError('');
                }}
                required
                placeholder="t-shirts"
                className={`${inputClass} font-mono`}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Optional description"
              rows={2}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Image URL</label>
              <input
                value={form.imageUrl}
                onChange={(e) => setForm((prev) => ({ ...prev, imageUrl: e.target.value }))}
                placeholder="https://..."
                className={inputClass}
              />
              {form.imageUrl && (
                <div className="mt-2">
                  <img
                    src={form.imageUrl}
                    alt="Category preview"
                    className="w-16 h-16 rounded-lg object-cover border border-border"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Parent Category</label>
              <select
                value={form.parentId}
                onChange={(e) => setForm((prev) => ({ ...prev, parentId: e.target.value }))}
                className={inputClass}
              >
                <option value="">None (top-level)</option>
                {parentOptions.map((cat) => (
                  <option key={cat.id} value={String(cat.id)}>
                    {cat.parentName ? `${cat.parentName} > ${cat.name}` : cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && showForm && (
            <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5">
              <span className="material-icons text-base">error</span>
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving && <span className="material-icons text-base animate-spin">refresh</span>}
              {editing ? 'Update' : 'Create'} Category
            </button>
          </div>
        </form>
      )}

      {/* Categories List */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {categories.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <span className="material-icons text-4xl text-muted-foreground/40">category</span>
            <p className="text-sm text-muted-foreground mt-2">No categories yet. Create your first one above.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {categories.map((cat) => (
              <li key={cat.id} className="flex items-center gap-4 px-6 py-4 group">
                {/* Image */}
                {cat.imageUrl ? (
                  <img src={cat.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover border border-border shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-muted/30 border border-border flex items-center justify-center shrink-0">
                    <span className="material-icons text-muted-foreground text-lg">category</span>
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{cat.name}</p>
                    {cat.parentName && (
                      <span className="text-xs text-muted-foreground bg-accent/50 px-1.5 py-0.5 rounded">
                        in {cat.parentName}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">/{cat.slug}</p>
                </div>

                {cat.description && (
                  <p className="hidden sm:block text-xs text-muted-foreground max-w-[200px] truncate">{cat.description}</p>
                )}

                {cat.productCount != null && (
                  <span className="text-xs text-muted-foreground">{cat.productCount} products</span>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => openEdit(cat)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    title="Edit"
                  >
                    <span className="material-icons text-base">edit</span>
                  </button>
                  <button
                    onClick={() => handleDelete(cat.id)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title="Delete"
                  >
                    <span className="material-icons text-base">delete</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
