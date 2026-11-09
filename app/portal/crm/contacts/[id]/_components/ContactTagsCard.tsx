'use client';

// Extracted verbatim from app/portal/crm/contacts/[id]/page.tsx (PUX-170) — the page is pinned at 636 code lines.

import { useState } from 'react';
import { pBtnPrimary, pCard, pInput, pSectionTitle } from '@/components/portal/portal-ui';

export interface Tag {
  id: number;
  name: string;
  color: string | null;
}

export default function ContactTagsCard({ contactId, tags, onChanged }: {
  contactId: string;
  tags: Tag[];
  onChanged: () => void;
}) {
  const [newTag, setNewTag] = useState('');

  async function addTag() {
    const name = newTag.trim();
    if (!name) return;

    // If the tag (by name) is already on this contact, just clear the input.
    const existing = (tags ?? []).find(t => t.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      setNewTag('');
      return;
    }

    // Create-or-get a tag in the client's tag library, then link it to this contact.
    const createRes = await fetch('/api/portal/crm/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!createRes.ok) return;
    const { data: newTagRow } = await createRes.json();
    if (!newTagRow?.id) return;

    const nextTags: Tag[] = [...(tags ?? []), {
      id: newTagRow.id, name: newTagRow.name, color: newTagRow.color ?? null,
    }];
    await fetch(`/api/portal/crm/contacts/${contactId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagIds: nextTags.map(t => t.id) }),
    });
    onChanged();
    setNewTag('');
  }

  async function removeTag(tagId: number) {
    const nextTags = (tags ?? []).filter(t => t.id !== tagId);
    await fetch(`/api/portal/crm/contacts/${contactId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagIds: nextTags.map(t => t.id) }),
    });
    onChanged();
  }

  return (
    <div className={`${pCard} p-6 space-y-3`}>
      <h2 className={pSectionTitle}>Tags</h2>
      <div className="flex flex-wrap gap-2">
        {(tags ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">No tags yet.</p>
        )}
        {(tags ?? []).map(tag => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
            style={tag.color ? { backgroundColor: `${tag.color}1a`, color: tag.color } : undefined}
          >
            {tag.name}
            <button onClick={() => removeTag(tag.id)} className="opacity-70 hover:opacity-100 ml-0.5">
              <span className="material-icons text-xs">close</span>
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={newTag}
          onChange={e => setNewTag(e.target.value)}
          placeholder="Add tag..."
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
          className={`${pInput} py-1.5`}
        />
        <button
          onClick={addTag}
          disabled={!newTag.trim()}
          className={`${pBtnPrimary} py-1.5 px-3`}
        >
          Add
        </button>
      </div>
    </div>
  );
}
