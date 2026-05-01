'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface ContentType {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  icon: string;
  active: boolean;
  websiteId: number | null;
}

function generateSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const CONTENT_ICONS = ['article', 'rss_feed', 'web', 'description', 'event', 'photo_library', 'video_library', 'library_books', 'feed', 'campaign'];

export default function ContentTypesPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const base = `/api/portal/cms/websites/${siteId}`;

  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingType, setEditingType] = useState<ContentType | null>(null);
  const [form, setForm] = useState({ name: '', slug: '', description: '', icon: 'article' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadContentTypes = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`${base}/content-types`).then(r => r.json());
    if (res.success) setContentTypes(res.data);
    setLoading(false);
  }, [base]);

  useEffect(() => { loadContentTypes(); }, [loadContentTypes]);

  const openCreate = () => {
    setEditingType(null);
    setForm({ name: '', slug: '', description: '', icon: 'article' });
    setShowForm(true);
    setError('');
  };

  const openEdit = (type: ContentType) => {
    if (!type.websiteId) return;
    setEditingType(type);
    setForm({ name: type.name, slug: type.slug, description: type.description || '', icon: type.icon });
    setShowForm(true);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const url = editingType ? `${base}/content-types/${editingType.id}` : `${base}/content-types`;
      const method = editingType ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      }).then(r => r.json());
      if (res.success) {
        setShowForm(false);
        setEditingType(null);
        loadContentTypes();
      } else {
        setError(res.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (typeId: number) => {
    if (!confirm('Delete this content type?')) return;
    await fetch(`${base}/content-types/${typeId}`, { method: 'DELETE' });
    loadContentTypes();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Content Types</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Define the structure of your content. Built-in types are always available.
          </p>
        </div>
        <button
          onClick={showForm && !editingType ? () => setShowForm(false) : openCreate}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <span className="material-icons text-base">{showForm && !editingType ? 'close' : 'add'}</span>
          {showForm && !editingType ? 'Cancel' : 'Add Content Type'}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="font-medium text-foreground text-sm">{editingType ? 'Edit' : 'New'} Content Type</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Name</label>
              <input
                value={form.name}
                onChange={e => setForm(prev => ({
                  ...prev,
                  name: e.target.value,
                  slug: !editingType ? generateSlug(e.target.value) : prev.slug,
                }))}
                required
                placeholder="e.g. Case Study"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Slug</label>
              <input
                value={form.slug}
                onChange={e => setForm(prev => ({ ...prev, slug: e.target.value }))}
                required
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Description</label>
            <input
              value={form.description}
              onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Optional description"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Icon</label>
            <div className="flex flex-wrap gap-1.5">
              {CONTENT_ICONS.map(icon => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, icon }))}
                  className={`p-2 rounded-lg border transition-colors ${
                    form.icon === icon ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/30'
                  }`}
                >
                  <span className="material-icons text-lg">{icon}</span>
                </button>
              ))}
            </div>
          </div>
          {error && (
            <p className="text-sm text-destructive flex items-center gap-1">
              <span className="material-icons text-base">error</span>{error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setShowForm(false); setEditingType(null); }}
              className="px-4 py-2 text-sm font-medium bg-card border border-border rounded-lg hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {saving && <span className="material-icons text-base animate-spin">refresh</span>}
              {editingType ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {contentTypes.map(type => (
          <div
            key={type.id}
            className="bg-card border border-border rounded-xl p-4 group hover:border-primary/30 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <span className="material-icons text-primary">{type.icon}</span>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{type.name}</h3>
                  <p className="text-xs text-muted-foreground font-mono">/{type.slug}</p>
                </div>
              </div>
              {type.websiteId ? (
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(type)} className="p-1 rounded hover:bg-accent" title="Edit">
                    <span className="material-icons text-sm text-muted-foreground">edit</span>
                  </button>
                  <button onClick={() => handleDelete(type.id)} className="p-1 rounded hover:bg-destructive/10" title="Delete">
                    <span className="material-icons text-sm text-destructive">delete</span>
                  </button>
                </div>
              ) : (
                <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">built-in</span>
              )}
            </div>
            {type.description && (
              <p className="text-xs text-muted-foreground mt-2">{type.description}</p>
            )}
            {type.websiteId ? (
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                <Link
                  href={`/portal/websites/${siteId}/content-types/${type.id}/fields`}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <span className="material-icons text-sm">input</span>
                  Custom fields
                </Link>
                <Link
                  href={`/portal/websites/${siteId}/content-types/${type.id}/template`}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <span className="material-icons text-sm">view_quilt</span>
                  Template &amp; code
                </Link>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
