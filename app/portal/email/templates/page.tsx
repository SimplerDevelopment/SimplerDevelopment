'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import type { Block } from '@/types/blocks';

const EmailBlockEditor = dynamic(() => import('@/components/email/EmailBlockEditor').then(m => ({ default: m.EmailBlockEditor })), { ssr: false });

interface Template {
  id: number;
  name: string;
  description: string | null;
  category: string;
  subject: string | null;
  htmlContent: string;
  isGlobal: boolean;
  usageCount: number;
  createdAt: string;
}

const CATEGORIES = [
  { value: 'all', label: 'All Templates' },
  { value: 'welcome', label: 'Welcome' },
  { value: 'newsletter', label: 'Newsletter' },
  { value: 'promotion', label: 'Promotion' },
  { value: 'transactional', label: 'Transactional' },
  { value: 'custom', label: 'Custom' },
];

const CATEGORY_ICONS: Record<string, string> = {
  welcome: 'waving_hand',
  newsletter: 'newspaper',
  promotion: 'sell',
  transactional: 'receipt',
  custom: 'palette',
};

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  // Create form
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCategory, setNewCategory] = useState('custom');
  const [newSubject, setNewSubject] = useState('');
  const [newHtml, setNewHtml] = useState('');
  const [newBlocks, setNewBlocks] = useState<Block[]>([]);
  const [createMode, setCreateMode] = useState<'visual' | 'html'>('visual');

  useEffect(() => {
    fetch('/api/portal/email/templates')
      .then(r => r.json())
      .then(res => { if (res.success) setTemplates(res.data); })
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'all' ? templates : templates.filter(t => t.category === filter);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    if (createMode === 'html' && !newHtml.trim()) return;
    if (createMode === 'visual' && newBlocks.length === 0) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: newName, description: newDesc, category: newCategory, subject: newSubject,
      };
      if (createMode === 'visual') {
        payload.blockContent = { blocks: newBlocks, version: '1' };
      } else {
        payload.htmlContent = newHtml;
      }
      const res = await fetch('/api/portal/email/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setTemplates(prev => [data.data, ...prev]);
        setShowCreate(false);
        setNewName(''); setNewDesc(''); setNewCategory('custom'); setNewSubject(''); setNewHtml(''); setNewBlocks([]);
      }
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this template?')) return;
    const res = await fetch(`/api/portal/email/templates/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) setTemplates(prev => prev.filter(t => t.id !== id));
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><span className="material-icons animate-spin text-3xl text-muted-foreground">autorenew</span></div>;
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Email Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">Reusable email designs for your campaigns</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium">
          <span className="material-icons text-lg">add</span>
          New Template
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="bg-card border border-border rounded-xl p-6 mb-6 space-y-4">
          <h3 className="font-semibold">Create Template</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="My Newsletter Template" className="w-full mt-1 text-sm bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50" required />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Category</label>
              <select value={newCategory} onChange={e => setNewCategory(e.target.value)} className="w-full mt-1 text-sm bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50">
                {CATEGORIES.filter(c => c.value !== 'all').map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Default Subject Line</label>
            <input value={newSubject} onChange={e => setNewSubject(e.target.value)} placeholder="Optional default subject" className="w-full mt-1 text-sm bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="What this template is for" className="w-full mt-1 text-sm bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted-foreground">Content</label>
              <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
                <button type="button" onClick={() => setCreateMode('visual')}
                  className={`px-2 py-0.5 text-xs rounded-md ${createMode === 'visual' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}>
                  Visual
                </button>
                <button type="button" onClick={() => setCreateMode('html')}
                  className={`px-2 py-0.5 text-xs rounded-md ${createMode === 'html' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}>
                  HTML
                </button>
              </div>
            </div>
            {createMode === 'visual' ? (
              <div className="border border-border rounded-lg overflow-hidden">
                <EmailBlockEditor blocks={newBlocks} onChange={setNewBlocks} />
              </div>
            ) : (
              <textarea value={newHtml} onChange={e => setNewHtml(e.target.value)} placeholder="<html>...</html>" rows={8} className="w-full text-sm bg-background border border-border rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
            )}
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              {saving ? 'Saving...' : 'Create Template'}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
        </form>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-border mb-6">
        {CATEGORIES.map(cat => (
          <button key={cat.value} onClick={() => setFilter(cat.value)} className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${filter === cat.value ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {cat.label}
          </button>
        ))}
      </div>

      {/* Template grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-muted/30 rounded-xl border border-border">
          <span className="material-icons text-5xl text-muted-foreground">dynamic_feed</span>
          <h3 className="mt-3 font-semibold text-lg">No templates yet</h3>
          <p className="text-sm text-muted-foreground mt-1">Create reusable email designs to speed up campaign creation</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(t => (
            <div key={t.id} className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/30 transition-colors group">
              <div className="h-32 bg-muted/30 flex items-center justify-center border-b border-border">
                <span className="material-icons text-4xl text-muted-foreground/40">{CATEGORY_ICONS[t.category] || 'palette'}</span>
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm truncate">{t.name}</h3>
                    {t.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.description}</p>}
                  </div>
                  {t.isGlobal && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 shrink-0">Global</span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-[10px] text-muted-foreground px-2 py-0.5 bg-muted rounded-full">{t.category}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">{t.usageCount} uses</span>
                    {!t.isGlobal && (
                      <button onClick={() => handleDelete(t.id)} className="p-1 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                        <span className="material-icons text-base">delete_outline</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
