'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

interface Category {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  color?: string | null;
}

function generateSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function PortalCategoriesPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const base = `/api/portal/cms/websites/${siteId}/categories`;

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: '', slug: '', description: '', color: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    fetch(base)
      .then(r => r.json())
      .then(res => { if (res.success) setCategories(res.data); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', slug: '', description: '', color: '' });
    setShowForm(true);
    setError('');
  };

  const openEdit = (cat: Category) => {
    setEditing(cat);
    setForm({
      name: cat.name,
      slug: cat.slug,
      description: cat.description || '',
      color: cat.color || '',
    });
    setShowForm(true);
    setError('');
  };

  const handleNameChange = (name: string) => {
    setForm(prev => ({
      ...prev,
      name,
      slug: !editing ? generateSlug(name) : prev.slug,
    }));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const url = editing ? `${base}/${editing.id}` : base;
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        setShowForm(false);
        setEditing(null);
        load();
      } else {
        setError(data.message);
      }
    } catch {
      setError('Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this category? Posts will be unlinked, not deleted.')) return;
    await fetch(`${base}/${id}`, { method: 'DELETE' });
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Categories</h1>
          <p className="text-muted-foreground text-sm mt-1">Organise your posts into categories.</p>
        </div>
        <button
          onClick={showForm ? () => setShowForm(false) : openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <span className="material-icons text-base">{showForm ? 'close' : 'add'}</span>
          {showForm ? 'Cancel' : 'Add Category'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-foreground">{editing ? 'Edit Category' : 'New Category'}</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Name</label>
              <input
                value={form.name}
                onChange={e => handleNameChange(e.target.value)}
                required
                placeholder="e.g. News"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Slug</label>
              <input
                value={form.slug}
                onChange={e => { setForm(prev => ({ ...prev, slug: e.target.value })); setError(''); }}
                required
                placeholder="news"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Description</label>
              <input
                value={form.description}
                onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Color</label>
              <input
                type="color"
                value={form.color || '#6366f1'}
                onChange={e => setForm(prev => ({ ...prev, color: e.target.value }))}
                className="w-full h-[38px] rounded-lg border border-border bg-background cursor-pointer"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5">
              <span className="material-icons text-base">error</span>{error}
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

      {/* Categories list */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {categories.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <span className="material-icons text-4xl text-muted-foreground/40">folder</span>
            <p className="text-sm text-muted-foreground mt-2">No categories yet. Create your first one above.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {categories.map(cat => (
              <li key={cat.id} className="flex items-center gap-4 px-6 py-4 group">
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: cat.color || '#94a3b8' }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{cat.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">/{cat.slug}</p>
                </div>
                {cat.description && (
                  <p className="hidden sm:block text-xs text-muted-foreground max-w-[200px] truncate">{cat.description}</p>
                )}
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
