'use client';

import { useState, useEffect } from 'react';
import { slugify } from '@/lib/publishing/slug';

interface BlockTemplate {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  category: string;
  scope: string;
  blocks: Record<string, unknown>[];
  thumbnail?: string | null;
  tags: string[];
  lockedFields: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  draft?: BlockTemplateDraft | null;
}

interface BlockTemplateDraft {
  name?: string;
  description?: string | null;
  category?: string;
  scope?: string;
  blocks?: unknown;
  thumbnail?: string | null;
  tags?: string[];
  lockedFields?: string[];
  pendingDelete?: boolean;
  pendingCreate?: boolean;
  updatedAt?: string;
  updatedBy?: number;
}

const SCOPE_LABELS: Record<string, { label: string; color: string }> = {
  block: { label: 'Block', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  section: { label: 'Section', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  global: { label: 'Global', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<BlockTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<BlockTemplate | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    category: 'custom',
    scope: 'block' as 'block' | 'section' | 'global',
    tags: '',
  });

  const fetchTemplates = async () => {
    const params = new URLSearchParams();
    if (filter !== 'all') params.set('scope', filter);
    if (search) params.set('search', search);

    const response = await fetch(`/api/block-templates?${params.toString()}`);
    const data = await response.json();
    if (data.success) {
      setTemplates(data.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    async function load() {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('scope', filter);
      if (search) params.set('search', search);
      const response = await fetch(`/api/block-templates?${params.toString()}`);
      const data = await response.json();
      if (data.success) {
        setTemplates(data.data);
      }
      setLoading(false);
    }
    void load();
  }, [filter, search]);

  const handleDelete = async (id: number) => {
    if (!confirm('Stage this template for deletion? It stays live until you click Publish.')) return;

    const response = await fetch(`/api/block-templates/${id}`, { method: 'DELETE' });
    const data = await response.json();

    if (!data.success) {
      alert(data.message);
      return;
    }

    fetchTemplates();
  };

  const handlePublish = async (id: number) => {
    const response = await fetch(`/api/block-templates/${id}/publish`, {
      method: 'POST',
    });
    const data = await response.json();
    if (!data.success) {
      alert(data.message);
      return;
    }
    fetchTemplates();
  };

  const handleCancelDelete = async (id: number) => {
    const response = await fetch(`/api/block-templates/${id}/cancel-delete`, {
      method: 'POST',
    });
    const data = await response.json();
    if (!data.success) {
      alert(data.message);
      return;
    }
    fetchTemplates();
  };

  const formatDraftTooltip = (template: BlockTemplate): string => {
    const updatedAt = template.draft?.updatedAt;
    const updatedBy = template.draft?.updatedBy;
    const parts: string[] = [];
    if (updatedAt) {
      try {
        parts.push(`Updated ${new Date(updatedAt).toLocaleString()}`);
      } catch {
        parts.push(`Updated ${updatedAt}`);
      }
    }
    if (updatedBy != null) parts.push(`by user ${updatedBy}`);
    return parts.length > 0 ? parts.join(' ') : 'Unpublished draft';
  };

  const handleEdit = (template: BlockTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      slug: template.slug,
      description: template.description || '',
      category: template.category,
      scope: template.scope as 'block' | 'section' | 'global',
      tags: template.tags?.join(', ') || '',
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      name: formData.name,
      slug: formData.slug,
      description: formData.description || undefined,
      category: formData.category,
      scope: formData.scope,
      tags: formData.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };

    const url = editingTemplate
      ? `/api/block-templates/${editingTemplate.id}`
      : '/api/block-templates';
    const method = editingTemplate ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        editingTemplate ? payload : { ...payload, blocks: [{ type: 'text', content: 'Template content', id: `block-${Date.now()}`, order: 0, alignment: 'left', size: 'base' }] }
      ),
    });

    if (response.ok) {
      setShowForm(false);
      setEditingTemplate(null);
      setFormData({ name: '', slug: '', description: '', category: 'custom', scope: 'block', tags: '' });
      fetchTemplates();
    }
  };


  const getBlockSummary = (blocks: Record<string, unknown>[]) => {
    if (!blocks || blocks.length === 0) return 'Empty';
    if (blocks.length === 1) {
      const block = blocks[0];
      const type = (typeof block.type === 'string' ? block.type : null) ?? 'unknown';
      return type.charAt(0).toUpperCase() + type.slice(1).replace(/-/g, ' ');
    }
    return `${blocks.length} blocks`;
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Block Templates</h1>
            <p className="text-muted-foreground mt-1">
              Reusable block configurations for your content
            </p>
          </div>
          <button
            onClick={() => {
              setShowForm(!showForm);
              setEditingTemplate(null);
              setFormData({ name: '', slug: '', description: '', category: 'custom', scope: 'block', tags: '' });
            }}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 text-sm font-medium"
          >
            + New Template
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            {['all', 'block', 'section', 'global'].map((scope) => (
              <button
                key={scope}
                onClick={() => setFilter(scope)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  filter === scope
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {scope === 'all' ? 'All' : scope.charAt(0).toUpperCase() + scope.slice(1)}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 max-w-sm px-3 py-1.5 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Create/Edit Form */}
        {showForm && (
          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">
              {editingTemplate ? 'Edit Template' : 'New Template'}
            </h2>
            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({
                      ...formData,
                      name: e.target.value,
                      ...(!editingTemplate ? { slug: slugify(e.target.value) } : {}),
                    });
                  }}
                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Slug</label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm"
                  required
                  disabled={!!editingTemplate}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-foreground mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Scope</label>
                <select
                  value={formData.scope}
                  onChange={(e) => setFormData({ ...formData, scope: e.target.value as 'block' | 'section' | 'global' })}
                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm"
                >
                  <option value="block">Block - Single reusable block</option>
                  <option value="section">Section - Multi-block group</option>
                  <option value="global">Global - Synced across pages</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Category</label>
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm"
                  placeholder="e.g., marketing, layout, custom"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-foreground mb-1">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm"
                  placeholder="e.g., hero, landing, pricing"
                />
              </div>
              <div className="col-span-2 flex gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 text-sm font-medium"
                >
                  {editingTemplate ? 'Update' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingTemplate(null);
                  }}
                  className="px-4 py-2 border border-border text-foreground rounded-md hover:bg-accent text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Template Grid */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading templates...</div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12 bg-card border border-border rounded-lg">
            <div className="text-4xl mb-4">
              <svg className="w-12 h-12 mx-auto text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No templates yet</h3>
            <p className="text-muted-foreground mb-4">
              Save blocks as templates from the post editor, or create one here.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 text-sm font-medium"
            >
              Create your first template
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => {
              const hasDraft = template.draft != null;
              const pendingDelete = template.draft?.pendingDelete === true;
              const draftTooltip = formatDraftTooltip(template);
              return (
              <div
                key={template.id}
                className={`bg-card border rounded-lg overflow-hidden transition-colors group ${
                  pendingDelete
                    ? 'border-destructive/40 hover:border-destructive/60'
                    : hasDraft
                      ? 'border-amber-400 hover:border-amber-500 dark:border-amber-700'
                      : 'border-border hover:border-primary/50'
                }`}
              >
                {/* Preview area */}
                <div className="h-32 bg-muted/30 flex items-center justify-center border-b border-border">
                  {template.thumbnail ? (
                    <img
                      src={template.thumbnail}
                      alt={template.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center">
                      <div className="text-2xl text-muted-foreground mb-1">
                        {template.scope === 'global' ? (
                          <svg className="w-8 h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        ) : template.scope === 'section' ? (
                          <svg className="w-8 h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                          </svg>
                        ) : (
                          <svg className="w-8 h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                          </svg>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">{getBlockSummary(template.blocks)}</span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2 gap-2">
                    <h3
                      className={`font-semibold text-sm ${
                        pendingDelete ? 'line-through text-muted-foreground' : 'text-foreground'
                      }`}
                    >
                      {template.name}
                    </h3>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {hasDraft && !pendingDelete && (
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 leading-none flex items-center gap-0.5"
                          title={draftTooltip}
                        >
                          <span className="material-icons text-[12px]">edit_note</span>
                          Draft
                        </span>
                      )}
                      {pendingDelete && (
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-destructive/10 text-destructive leading-none flex items-center gap-0.5"
                          title={draftTooltip}
                        >
                          <span className="material-icons text-[12px]">delete</span>
                          Pending delete
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${SCOPE_LABELS[template.scope]?.color || 'bg-gray-100 text-gray-700'}`}>
                        {SCOPE_LABELS[template.scope]?.label || template.scope}
                      </span>
                    </div>
                  </div>
                  {template.description && (
                    <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                      {template.description}
                    </p>
                  )}
                  {template.tags && template.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {template.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-1.5 py-0.5 bg-muted rounded text-xs text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>v{template.version}</span>
                    <div className="flex gap-2 items-center">
                      {hasDraft && (
                        <button
                          onClick={() => handlePublish(template.id)}
                          className="inline-flex items-center gap-0.5 text-amber-700 dark:text-amber-300 hover:underline font-medium"
                          title={`Publish this template — ${draftTooltip}`}
                        >
                          <span className="material-icons text-sm">publish</span>
                          Publish
                        </button>
                      )}
                      {pendingDelete && (
                        <button
                          onClick={() => handleCancelDelete(template.id)}
                          className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground"
                          title="Cancel staged deletion"
                        >
                          <span className="material-icons text-sm">undo</span>
                          Cancel deletion
                        </button>
                      )}
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleEdit(template)}
                          className="text-primary hover:text-primary/80"
                        >
                          Edit
                        </button>
                        {!pendingDelete && (
                          <button
                            onClick={() => handleDelete(template.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
