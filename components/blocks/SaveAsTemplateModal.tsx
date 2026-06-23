'use client';

import { useState } from 'react';
import { Block } from '@/types/blocks';
import { BaseBlock } from '@/types/blocks/base';
import { slugify } from '@/lib/publishing/slug';

interface SaveAsTemplateModalProps {
  blocks: Block[];
  onClose: () => void;
  onSaved?: () => void;
  /** Override the default `/api/block-templates` POST target. Portal callers
   *  pass the tenant-scoped `/api/portal/cms/websites/[siteId]/block-templates`
   *  endpoint so the new row gets stamped with their client_id. */
  endpoint?: string;
}

export function SaveAsTemplateModal({ blocks, onClose, onSaved, endpoint = '/api/block-templates' }: SaveAsTemplateModalProps) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState<'block' | 'section' | 'global'>( blocks.length > 1 ? 'section' : 'block');
  const [category, setCategory] = useState('custom');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const generateSlug = (value: string) => slugify(value);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    // Strip IDs from blocks so they get new ones when inserted
    const sanitizedBlocks = blocks.map((block) => {
      const { id: _id, order: _order, ...rest } = block as BaseBlock & Record<string, unknown>;
      return rest;
    });

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          slug,
          description: description || undefined,
          scope,
          category,
          blocks: sanitizedBlocks,
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.message || 'Failed to save template');
        setSaving(false);
        return;
      }

      onSaved?.();
      onClose();
    } catch {
      setError('Network error. Please try again.');
      setSaving(false);
    }
  };

  const blockSummary = blocks.length === 1
    ? `1 ${blocks[0].type} block`
    : `${blocks.length} blocks`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 border border-border rounded-lg max-w-lg w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Save as Template</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Saving {blockSummary} as a reusable template
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-muted-foreground hover:text-foreground rounded-full hover:bg-accent"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Template Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSlug(generateSlug(e.target.value));
              }}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g., Hero with gradient background"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Slug</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-muted-foreground text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm"
              rows={2}
              placeholder="What is this template for?"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Type</label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as 'block' | 'section' | 'global')}
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm"
              >
                <option value="block">Block - Single block</option>
                <option value="section">Section - Block group</option>
                <option value="global">Global - Synced everywhere</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Category</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm"
                placeholder="e.g., marketing"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Tags (comma-separated)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm"
              placeholder="e.g., hero, landing, dark-theme"
            />
          </div>

          {scope === 'global' && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md text-sm text-amber-700 dark:text-amber-300">
              <strong>Global templates</strong> sync across all pages that use them. When you edit a global template, changes apply everywhere.
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={saving || !name}
              className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Template'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-border text-foreground rounded-md hover:bg-accent text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
