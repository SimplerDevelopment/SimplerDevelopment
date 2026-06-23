// Taxonomy section: categories + tags pickers with search + create-on-the-fly.
'use client';

import { useRef, useState } from 'react';
import { createCategory, createTag } from '../_lib/api';
import type { Post, TaxonomyItem } from '../_lib/types';

interface TaxonomySectionProps {
  siteId: number;
  formData: Post;
  setFormData: React.Dispatch<React.SetStateAction<Post>>;
  availableCategories: TaxonomyItem[];
  setAvailableCategories: React.Dispatch<React.SetStateAction<TaxonomyItem[]>>;
  availableTags: TaxonomyItem[];
  setAvailableTags: React.Dispatch<React.SetStateAction<TaxonomyItem[]>>;
}

export function TaxonomySection({
  siteId,
  formData,
  setFormData,
  availableCategories,
  setAvailableCategories,
  availableTags,
  setAvailableTags,
}: TaxonomySectionProps) {
  return (
    <div className="space-y-6">
      <TaxonomySearchSelect
        label="Categories"
        items={availableCategories}
        selectedIds={formData.categoryIds || []}
        onToggle={(id) => setFormData(prev => ({
          ...prev,
          categoryIds: (prev.categoryIds || []).includes(id)
            ? (prev.categoryIds || []).filter(i => i !== id)
            : [...(prev.categoryIds || []), id],
        }))}
        onCreate={async (name) => {
          const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          const created = await createCategory(siteId, name, slug);
          if (created) {
            setAvailableCategories(prev => [...prev, created]);
            setFormData(prev => ({ ...prev, categoryIds: [...(prev.categoryIds || []), created.id] }));
          }
        }}
      />
      <TaxonomySearchSelect
        label="Tags"
        items={availableTags}
        selectedIds={formData.tagIds || []}
        onToggle={(id) => setFormData(prev => ({
          ...prev,
          tagIds: (prev.tagIds || []).includes(id)
            ? (prev.tagIds || []).filter(i => i !== id)
            : [...(prev.tagIds || []), id],
        }))}
        onCreate={async (name) => {
          const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          const created = await createTag(siteId, name, slug);
          if (created) {
            setAvailableTags(prev => [...prev, created]);
            setFormData(prev => ({ ...prev, tagIds: [...(prev.tagIds || []), created.id] }));
          }
        }}
      />
    </div>
  );
}

/** Combobox for searching & creating taxonomy items inline. */
function TaxonomySearchSelect({
  label,
  items,
  selectedIds,
  onToggle,
  onCreate,
}: {
  label: string;
  items: TaxonomyItem[];
  selectedIds: number[];
  onToggle: (id: number) => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedItems = items.filter(i => selectedIds.includes(i.id));
  const lowerQuery = query.toLowerCase().trim();
  const filtered = lowerQuery
    ? items.filter(i => i.name.toLowerCase().includes(lowerQuery))
    : items;
  const exactMatch = items.some(i => i.name.toLowerCase() === lowerQuery);
  const showCreateOption = lowerQuery && !exactMatch;

  const handleCreate = async () => {
    if (!lowerQuery || creating) return;
    setCreating(true);
    await onCreate(query.trim());
    setQuery('');
    setCreating(false);
  };

  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-2">{label}</label>

      {/* Selected chips */}
      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedItems.map(item => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary text-primary-foreground"
            >
              {item.name}
              <button
                type="button"
                onClick={() => onToggle(item.id)}
                className="hover:bg-primary-foreground/20 rounded-full p-0.5"
              >
                <span className="material-icons text-xs">close</span>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <div className="relative">
          <span className="material-icons text-base text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2">search</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (showCreateOption) handleCreate();
                else if (filtered.length === 1) { onToggle(filtered[0].id); setQuery(''); }
              }
              if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
            }}
            placeholder={`Search or add ${label.toLowerCase()}...`}
            className="w-full pl-8 pr-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary"
          />
        </div>

        {/* Dropdown */}
        {open && (filtered.length > 0 || showCreateOption) && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {filtered.map(item => {
                const isSelected = selectedIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => { onToggle(item.id); setQuery(''); setOpen(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent transition-colors ${
                      isSelected ? 'text-primary font-medium' : 'text-foreground'
                    }`}
                  >
                    <span className="material-icons text-base">
                      {isSelected ? 'check_box' : 'check_box_outline_blank'}
                    </span>
                    {item.name}
                  </button>
                );
              })}
              {showCreateOption && (
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-primary hover:bg-accent transition-colors border-t border-border"
                >
                  <span className="material-icons text-base">add_circle_outline</span>
                  {creating ? 'Creating...' : `Add "${query.trim()}"`}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
