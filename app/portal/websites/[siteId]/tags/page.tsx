'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

interface Tag {
  id: number;
  name: string;
  slug: string;
}

function generateSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function PortalTagsPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const base = `/api/portal/cms/websites/${siteId}/tags`;

  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Tag | null>(null);
  const [form, setForm] = useState({ name: '', slug: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    fetch(base)
      .then(r => r.json())
      .then(res => { if (res.success) setTags(res.data); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', slug: '' });
    setShowForm(true);
    setError('');
  };

  const openEdit = (tag: Tag) => {
    setEditing(tag);
    setForm({ name: tag.name, slug: tag.slug });
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
    if (!confirm('Delete this tag? Posts will be unlinked, not deleted.')) return;
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
          <h1 className="text-2xl font-bold text-foreground">Tags</h1>
          <p className="text-muted-foreground text-sm mt-1">Label your posts with tags for filtering and discovery.</p>
        </div>
        <button
          onClick={showForm ? () => setShowForm(false) : openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <span className="material-icons text-base">{showForm ? 'close' : 'add'}</span>
          {showForm ? 'Cancel' : 'Add Tag'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-foreground">{editing ? 'Edit Tag' : 'New Tag'}</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Name</label>
              <input
                value={form.name}
                onChange={e => handleNameChange(e.target.value)}
                required
                placeholder="e.g. Featured"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Slug</label>
              <input
                value={form.slug}
                onChange={e => { setForm(prev => ({ ...prev, slug: e.target.value })); setError(''); }}
                required
                placeholder="featured"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
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
              {editing ? 'Update' : 'Create'} Tag
            </button>
          </div>
        </form>
      )}

      {/* Tags list */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {tags.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <span className="material-icons text-4xl text-muted-foreground/40">label</span>
            <p className="text-sm text-muted-foreground mt-2">No tags yet. Create your first one above.</p>
          </div>
        ) : (
          <div className="p-4 flex flex-wrap gap-2">
            {tags.map(tag => (
              <div
                key={tag.id}
                className="group flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-accent/30 text-sm text-foreground hover:bg-accent transition-colors"
              >
                <span className="material-icons text-sm text-muted-foreground">label</span>
                <span>{tag.name}</span>
                <span className="text-xs text-muted-foreground font-mono hidden sm:inline">({tag.slug})</span>
                <button
                  onClick={() => openEdit(tag)}
                  className="ml-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-all"
                  title="Edit"
                >
                  <span className="material-icons text-sm">edit</span>
                </button>
                <button
                  onClick={() => handleDelete(tag.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-600 transition-all"
                  title="Delete"
                >
                  <span className="material-icons text-sm">close</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
