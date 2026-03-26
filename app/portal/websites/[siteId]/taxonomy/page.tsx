'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Taxonomy {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  icon: string;
  hierarchical: boolean;
  builtIn: boolean;
  websiteId: number | null;
}

interface Term {
  id: number;
  taxonomyId: number;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  parentId: number | null;
  sortOrder: number;
}

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

const ICONS = ['label', 'folder', 'category', 'tag', 'bookmark', 'star', 'flag', 'location_on', 'person', 'work', 'school', 'local_offer'];
const CONTENT_ICONS = ['article', 'rss_feed', 'web', 'description', 'event', 'photo_library', 'video_library', 'library_books', 'feed', 'campaign'];

// ─── Main Component ──────────────────────────────────────────────────────────

export default function TaxonomyPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const base = `/api/portal/cms/websites/${siteId}`;

  const [activeTab, setActiveTab] = useState<'taxonomies' | 'content-types'>('taxonomies');

  // Taxonomy state
  const [taxonomies, setTaxonomies] = useState<Taxonomy[]>([]);
  const [selectedTaxonomy, setSelectedTaxonomy] = useState<Taxonomy | null>(null);
  const [terms, setTerms] = useState<Term[]>([]);
  const [loading, setLoading] = useState(true);
  const [termsLoading, setTermsLoading] = useState(false);

  // Content types state
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [typesLoading, setTypesLoading] = useState(true);

  // Forms
  const [showTaxForm, setShowTaxForm] = useState(false);
  const [showTermForm, setShowTermForm] = useState(false);
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [editingTerm, setEditingTerm] = useState<Term | null>(null);
  const [editingType, setEditingType] = useState<ContentType | null>(null);
  const [taxForm, setTaxForm] = useState({ name: '', slug: '', description: '', icon: 'label', hierarchical: false });
  const [termForm, setTermForm] = useState({ name: '', slug: '', description: '', color: '', parentId: '' });
  const [typeForm, setTypeForm] = useState({ name: '', slug: '', description: '', icon: 'article' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Load taxonomies
  const loadTaxonomies = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`${base}/taxonomies`).then(r => r.json());
    if (res.success) setTaxonomies(res.data);
    setLoading(false);
  }, [base]);

  // Load terms for selected taxonomy
  const loadTerms = useCallback(async (taxonomyId: number) => {
    setTermsLoading(true);
    const res = await fetch(`${base}/taxonomies/${taxonomyId}/terms`).then(r => r.json());
    if (res.success) setTerms(res.data);
    setTermsLoading(false);
  }, [base]);

  // Load content types
  const loadContentTypes = useCallback(async () => {
    setTypesLoading(true);
    const res = await fetch(`${base}/content-types`).then(r => r.json());
    if (res.success) setContentTypes(res.data);
    setTypesLoading(false);
  }, [base]);

  useEffect(() => { loadTaxonomies(); loadContentTypes(); }, [loadTaxonomies, loadContentTypes]);

  useEffect(() => {
    if (selectedTaxonomy) loadTerms(selectedTaxonomy.id);
  }, [selectedTaxonomy, loadTerms]);

  // Auto-select first taxonomy
  useEffect(() => {
    if (taxonomies.length > 0 && !selectedTaxonomy) {
      setSelectedTaxonomy(taxonomies[0]);
    }
  }, [taxonomies, selectedTaxonomy]);

  // ── Taxonomy CRUD ──────────────────────────────────────────────────────────

  const handleCreateTaxonomy = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${base}/taxonomies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taxForm),
      }).then(r => r.json());
      if (res.success) {
        setShowTaxForm(false);
        setTaxForm({ name: '', slug: '', description: '', icon: 'label', hierarchical: false });
        await loadTaxonomies();
        setSelectedTaxonomy(res.data);
      } else {
        setError(res.message);
      }
    } finally {
      setSaving(false);
    }
  };

  // ── Term CRUD ──────────────────────────────────────────────────────────────

  const openCreateTerm = () => {
    setEditingTerm(null);
    setTermForm({ name: '', slug: '', description: '', color: '', parentId: '' });
    setShowTermForm(true);
    setError('');
  };

  const openEditTerm = (term: Term) => {
    setEditingTerm(term);
    setTermForm({
      name: term.name,
      slug: term.slug,
      description: term.description || '',
      color: term.color || '',
      parentId: term.parentId?.toString() || '',
    });
    setShowTermForm(true);
    setError('');
  };

  const handleSubmitTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaxonomy) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: termForm.name,
        slug: termForm.slug,
        description: termForm.description || null,
        color: termForm.color || null,
        parentId: termForm.parentId ? parseInt(termForm.parentId) : null,
      };
      const url = editingTerm
        ? `${base}/taxonomies/${selectedTaxonomy.id}/terms/${editingTerm.id}`
        : `${base}/taxonomies/${selectedTaxonomy.id}/terms`;
      const method = editingTerm ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(r => r.json());
      if (res.success) {
        setShowTermForm(false);
        setEditingTerm(null);
        loadTerms(selectedTaxonomy.id);
      } else {
        setError(res.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTerm = async (termId: number) => {
    if (!selectedTaxonomy || !confirm('Delete this term? Content will be unlinked.')) return;
    await fetch(`${base}/taxonomies/${selectedTaxonomy.id}/terms/${termId}`, { method: 'DELETE' });
    loadTerms(selectedTaxonomy.id);
  };

  // ── Content Type CRUD ──────────────────────────────────────────────────────

  const openCreateType = () => {
    setEditingType(null);
    setTypeForm({ name: '', slug: '', description: '', icon: 'article' });
    setShowTypeForm(true);
    setError('');
  };

  const openEditType = (type: ContentType) => {
    if (!type.websiteId) return; // Can't edit global types
    setEditingType(type);
    setTypeForm({ name: type.name, slug: type.slug, description: type.description || '', icon: type.icon });
    setShowTypeForm(true);
    setError('');
  };

  const handleSubmitType = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const url = editingType
        ? `${base}/content-types/${editingType.id}`
        : `${base}/content-types`;
      const method = editingType ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(typeForm),
      }).then(r => r.json());
      if (res.success) {
        setShowTypeForm(false);
        setEditingType(null);
        loadContentTypes();
      } else {
        setError(res.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteType = async (typeId: number) => {
    if (!confirm('Delete this content type?')) return;
    await fetch(`${base}/content-types/${typeId}`, { method: 'DELETE' });
    loadContentTypes();
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  const topLevelTerms = terms.filter(t => !t.parentId);
  const childTermsOf = (parentId: number) => terms.filter(t => t.parentId === parentId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header with tabs */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Taxonomy & Content Types</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage how your content is organized and classified.</p>
      </div>

      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setActiveTab('taxonomies')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'taxonomies'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <span className="material-icons text-base mr-1.5 align-middle">account_tree</span>
          Taxonomies
        </button>
        <button
          onClick={() => setActiveTab('content-types')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'content-types'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <span className="material-icons text-base mr-1.5 align-middle">description</span>
          Content Types
        </button>
      </div>

      {/* ═══ TAXONOMIES TAB ═══ */}
      {activeTab === 'taxonomies' && (
        <div className="flex gap-6">
          {/* Left: taxonomy list */}
          <div className="w-64 flex-shrink-0 space-y-2">
            {taxonomies.map(tax => (
              <button
                key={tax.id}
                onClick={() => { setSelectedTaxonomy(tax); setShowTermForm(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-colors ${
                  selectedTaxonomy?.id === tax.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground hover:bg-accent'
                }`}
              >
                <span className="material-icons text-lg">{tax.icon}</span>
                <div className="flex-1 min-w-0">
                  <span className="font-medium block truncate">{tax.name}</span>
                  <span className={`text-xs ${selectedTaxonomy?.id === tax.id ? 'opacity-70' : 'text-muted-foreground'}`}>
                    {tax.hierarchical ? 'Hierarchical' : 'Flat'}
                    {tax.builtIn && ' (built-in)'}
                  </span>
                </div>
              </button>
            ))}

            {/* New taxonomy button */}
            <button
              onClick={() => { setShowTaxForm(!showTaxForm); setError(''); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-primary hover:bg-accent/50 transition-colors border-2 border-dashed border-border"
            >
              <span className="material-icons text-base">{showTaxForm ? 'close' : 'add'}</span>
              {showTaxForm ? 'Cancel' : 'New Taxonomy'}
            </button>

            {/* New taxonomy form */}
            {showTaxForm && (
              <form onSubmit={handleCreateTaxonomy} className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Name</label>
                  <input
                    value={taxForm.name}
                    onChange={e => setTaxForm(prev => ({ ...prev, name: e.target.value, slug: generateSlug(e.target.value) }))}
                    required
                    placeholder="e.g. Genre"
                    className="w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Slug</label>
                  <input
                    value={taxForm.slug}
                    onChange={e => setTaxForm(prev => ({ ...prev, slug: e.target.value }))}
                    required
                    className="w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-sm font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Icon</label>
                  <div className="flex flex-wrap gap-1">
                    {ICONS.map(icon => (
                      <button
                        key={icon}
                        type="button"
                        onClick={() => setTaxForm(prev => ({ ...prev, icon }))}
                        className={`p-1.5 rounded-md border transition-colors ${
                          taxForm.icon === icon ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/30'
                        }`}
                      >
                        <span className="material-icons text-base">{icon}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={taxForm.hierarchical}
                    onChange={e => setTaxForm(prev => ({ ...prev, hierarchical: e.target.checked }))}
                    className="rounded border-border"
                  />
                  Hierarchical (parent/child)
                </label>
                {error && <p className="text-xs text-destructive">{error}</p>}
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  {saving ? 'Creating...' : 'Create Taxonomy'}
                </button>
              </form>
            )}
          </div>

          {/* Right: terms for selected taxonomy */}
          <div className="flex-1 min-w-0">
            {selectedTaxonomy ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-icons text-xl text-muted-foreground">{selectedTaxonomy.icon}</span>
                    <h2 className="text-lg font-semibold text-foreground">{selectedTaxonomy.name}</h2>
                    {selectedTaxonomy.builtIn && (
                      <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">built-in</span>
                    )}
                  </div>
                  <button
                    onClick={showTermForm && !editingTerm ? () => setShowTermForm(false) : openCreateTerm}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    <span className="material-icons text-base">{showTermForm && !editingTerm ? 'close' : 'add'}</span>
                    {showTermForm && !editingTerm ? 'Cancel' : `Add ${selectedTaxonomy.name.replace(/s$/, '')}`}
                  </button>
                </div>

                {/* Term form */}
                {showTermForm && (
                  <form onSubmit={handleSubmitTerm} className="bg-card border border-border rounded-xl p-5 space-y-4">
                    <h3 className="font-medium text-foreground text-sm">
                      {editingTerm ? 'Edit' : 'New'} {selectedTaxonomy.name.replace(/s$/, '')}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-foreground">Name</label>
                        <input
                          value={termForm.name}
                          onChange={e => setTermForm(prev => ({
                            ...prev,
                            name: e.target.value,
                            slug: !editingTerm ? generateSlug(e.target.value) : prev.slug,
                          }))}
                          required
                          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-foreground">Slug</label>
                        <input
                          value={termForm.slug}
                          onChange={e => setTermForm(prev => ({ ...prev, slug: e.target.value }))}
                          required
                          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-4">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-foreground">Description</label>
                        <input
                          value={termForm.description}
                          onChange={e => setTermForm(prev => ({ ...prev, description: e.target.value }))}
                          placeholder="Optional"
                          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-foreground">Color</label>
                        <input
                          type="color"
                          value={termForm.color || '#6366f1'}
                          onChange={e => setTermForm(prev => ({ ...prev, color: e.target.value }))}
                          className="w-full h-[38px] rounded-lg border border-border bg-background cursor-pointer"
                        />
                      </div>
                    </div>
                    {selectedTaxonomy.hierarchical && (
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-foreground">Parent</label>
                        <select
                          value={termForm.parentId}
                          onChange={e => setTermForm(prev => ({ ...prev, parentId: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                        >
                          <option value="">None (top-level)</option>
                          {topLevelTerms
                            .filter(t => t.id !== editingTerm?.id)
                            .map(t => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </select>
                      </div>
                    )}
                    {error && (
                      <p className="text-sm text-destructive flex items-center gap-1">
                        <span className="material-icons text-base">error</span>{error}
                      </p>
                    )}
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => { setShowTermForm(false); setEditingTerm(null); }}
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
                        {editingTerm ? 'Update' : 'Create'}
                      </button>
                    </div>
                  </form>
                )}

                {/* Terms list */}
                {termsLoading ? (
                  <div className="flex justify-center py-8">
                    <span className="material-icons animate-spin text-primary">refresh</span>
                  </div>
                ) : terms.length === 0 ? (
                  <div className="bg-card border border-border rounded-xl p-10 text-center">
                    <span className="material-icons text-4xl text-muted-foreground/40">{selectedTaxonomy.icon}</span>
                    <p className="text-sm text-muted-foreground mt-2">
                      No {selectedTaxonomy.name.toLowerCase()} yet. Create your first one above.
                    </p>
                  </div>
                ) : selectedTaxonomy.hierarchical ? (
                  /* Hierarchical list */
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <ul className="divide-y divide-border">
                      {topLevelTerms.map(term => (
                        <li key={term.id}>
                          <TermRow term={term} onEdit={openEditTerm} onDelete={handleDeleteTerm} />
                          {childTermsOf(term.id).map(child => (
                            <TermRow key={child.id} term={child} onEdit={openEditTerm} onDelete={handleDeleteTerm} indent />
                          ))}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  /* Flat tag-style list */
                  <div className="bg-card border border-border rounded-xl p-4">
                    <div className="flex flex-wrap gap-2">
                      {terms.map(term => (
                        <div
                          key={term.id}
                          className="group flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-accent/30 text-sm text-foreground hover:bg-accent transition-colors"
                        >
                          {term.color && (
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: term.color }} />
                          )}
                          <span>{term.name}</span>
                          <span className="text-xs text-muted-foreground font-mono hidden sm:inline">({term.slug})</span>
                          <button onClick={() => openEditTerm(term)} className="ml-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-all">
                            <span className="material-icons text-sm">edit</span>
                          </button>
                          <button onClick={() => handleDeleteTerm(term.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all">
                            <span className="material-icons text-sm">close</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <p className="text-sm">Select a taxonomy or create a new one</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ CONTENT TYPES TAB ═══ */}
      {activeTab === 'content-types' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Content types define the structure of your content. Built-in types (Blog, Page) are always available.
            </p>
            <button
              onClick={showTypeForm && !editingType ? () => setShowTypeForm(false) : openCreateType}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <span className="material-icons text-base">{showTypeForm && !editingType ? 'close' : 'add'}</span>
              {showTypeForm && !editingType ? 'Cancel' : 'Add Content Type'}
            </button>
          </div>

          {/* Content type form */}
          {showTypeForm && (
            <form onSubmit={handleSubmitType} className="bg-card border border-border rounded-xl p-5 space-y-4">
              <h3 className="font-medium text-foreground text-sm">{editingType ? 'Edit' : 'New'} Content Type</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Name</label>
                  <input
                    value={typeForm.name}
                    onChange={e => setTypeForm(prev => ({
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
                    value={typeForm.slug}
                    onChange={e => setTypeForm(prev => ({ ...prev, slug: e.target.value }))}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Description</label>
                <input
                  value={typeForm.description}
                  onChange={e => setTypeForm(prev => ({ ...prev, description: e.target.value }))}
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
                      onClick={() => setTypeForm(prev => ({ ...prev, icon }))}
                      className={`p-2 rounded-lg border transition-colors ${
                        typeForm.icon === icon ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/30'
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
                  onClick={() => { setShowTypeForm(false); setEditingType(null); }}
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

          {/* Content types grid */}
          {typesLoading ? (
            <div className="flex justify-center py-8">
              <span className="material-icons animate-spin text-primary">refresh</span>
            </div>
          ) : (
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
                        <button onClick={() => openEditType(type)} className="p-1 rounded hover:bg-accent" title="Edit">
                          <span className="material-icons text-sm text-muted-foreground">edit</span>
                        </button>
                        <button onClick={() => handleDeleteType(type.id)} className="p-1 rounded hover:bg-destructive/10" title="Delete">
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
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Term Row (hierarchical) ─────────────────────────────────────────────────

function TermRow({
  term,
  onEdit,
  onDelete,
  indent = false,
}: {
  term: Term;
  onEdit: (term: Term) => void;
  onDelete: (id: number) => void;
  indent?: boolean;
}) {
  return (
    <div className={`flex items-center gap-4 px-6 py-3 group ${indent ? 'pl-12' : ''}`}>
      {term.color && (
        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: term.color }} />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{term.name}</p>
        <p className="text-xs text-muted-foreground font-mono">/{term.slug}</p>
      </div>
      {term.description && (
        <p className="hidden sm:block text-xs text-muted-foreground max-w-[200px] truncate">{term.description}</p>
      )}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => onEdit(term)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
          <span className="material-icons text-base">edit</span>
        </button>
        <button onClick={() => onDelete(term.id)} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
          <span className="material-icons text-base">delete</span>
        </button>
      </div>
    </div>
  );
}
