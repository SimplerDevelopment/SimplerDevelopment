'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface EmailList {
  id: number;
  name: string;
  description: string | null;
  subscriberCount: number;
  createdAt: string;
}

interface Subscriber {
  id: number;
  email: string;
  name: string | null;
  status: string;
  subscribedAt: string;
}

export default function EmailListsPage() {
  const [lists, setLists] = useState<EmailList[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Subscriber panel
  const [selectedList, setSelectedList] = useState<EmailList | null>(null);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [subLoading, setSubLoading] = useState(false);
  const [subForm, setSubForm] = useState({ email: '', name: '' });
  const [subSaving, setSubSaving] = useState(false);
  const [subError, setSubError] = useState('');

  useEffect(() => {
    fetch('/api/admin/email/lists')
      .then(r => r.json())
      .then(d => { setLists(d.data ?? []); setLoading(false); });
  }, []);

  async function openList(list: EmailList) {
    setSelectedList(list);
    setSubLoading(true);
    const data = await fetch(`/api/admin/email/lists/${list.id}`).then(r => r.json());
    setSubscribers(data.data ?? []);
    setSubLoading(false);
  }

  async function createList(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const res = await fetch('/api/admin/email/lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (!data.success) { setError(data.message ?? 'Failed'); return; }
    setLists(prev => [{ ...data.data, subscriberCount: 0 }, ...prev]);
    setShowForm(false);
    setForm({ name: '', description: '' });
  }

  async function addSubscriber(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedList) return;
    setSubSaving(true);
    setSubError('');
    const res = await fetch('/api/admin/email/subscribers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listId: selectedList.id, ...subForm }),
    });
    const data = await res.json();
    setSubSaving(false);
    if (!data.success) { setSubError(data.message ?? 'Failed'); return; }
    setSubscribers(prev => [...prev, data.data]);
    setLists(prev => prev.map(l => l.id === selectedList.id ? { ...l, subscriberCount: l.subscriberCount + 1 } : l));
    setSubForm({ email: '', name: '' });
  }

  async function removeSubscriber(id: number) {
    if (!confirm('Remove this subscriber?')) return;
    await fetch(`/api/admin/email/subscribers?id=${id}`, { method: 'DELETE' });
    setSubscribers(prev => prev.filter(s => s.id !== id));
    if (selectedList) setLists(prev => prev.map(l => l.id === selectedList.id ? { ...l, subscriberCount: Math.max(0, l.subscriberCount - 1) } : l));
  }

  async function deleteList(id: number) {
    if (!confirm('Delete this list and all its subscribers?')) return;
    await fetch(`/api/admin/email/lists/${id}`, { method: 'DELETE' });
    setLists(prev => prev.filter(l => l.id !== id));
    if (selectedList?.id === id) setSelectedList(null);
  }

  const statusColor: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    unsubscribed: 'bg-gray-100 text-gray-500',
    bounced: 'bg-red-100 text-red-700',
    complained: 'bg-orange-100 text-orange-700',
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/admin/email" className="text-muted-foreground hover:text-foreground">
            <span className="material-icons text-base">arrow_back</span>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Subscriber Lists</h1>
            <p className="text-muted-foreground mt-0.5 text-sm">Manage email lists and subscribers.</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <span className="material-icons text-base">add</span>
          New List
        </button>
      </div>

      {showForm && (
        <form onSubmit={createList} className="bg-card border border-border rounded-lg p-5 space-y-4">
          <h3 className="font-semibold text-foreground">Create List</h3>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Name *</label>
              <input
                required
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="e.g. Newsletter"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Description</label>
              <input
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              {saving ? 'Creating…' : 'Create List'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-border rounded-md text-sm text-muted-foreground hover:bg-accent">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lists */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Lists</h2>
          </div>
          {loading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : lists.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No lists yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {lists.map(list => (
                <div
                  key={list.id}
                  className={`flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-accent transition-colors ${selectedList?.id === list.id ? 'bg-accent' : ''}`}
                  onClick={() => openList(list)}
                >
                  <div>
                    <p className="font-medium text-sm text-foreground">{list.name}</p>
                    <p className="text-xs text-muted-foreground">{list.subscriberCount} subscriber{list.subscriberCount !== 1 ? 's' : ''}</p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); deleteList(list.id); }}
                    className="p-1 rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <span className="material-icons text-base">delete</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Subscribers panel */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">
              {selectedList ? `${selectedList.name} — Subscribers` : 'Select a list'}
            </h2>
          </div>
          {!selectedList ? (
            <p className="p-6 text-sm text-muted-foreground">Click a list to view subscribers.</p>
          ) : (
            <div>
              <form onSubmit={addSubscriber} className="flex gap-2 p-4 border-b border-border">
                <input
                  required
                  type="email"
                  value={subForm.email}
                  onChange={e => setSubForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="Email address"
                  className="flex-1 border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <input
                  value={subForm.name}
                  onChange={e => setSubForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Name (optional)"
                  className="w-32 border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button type="submit" disabled={subSaving} className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 disabled:opacity-50">
                  <span className="material-icons text-base">add</span>
                </button>
              </form>
              {subError && <p className="px-4 py-2 text-sm text-red-600">{subError}</p>}
              {subLoading ? (
                <p className="p-6 text-sm text-muted-foreground">Loading…</p>
              ) : subscribers.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No subscribers yet.</p>
              ) : (
                <div className="divide-y divide-border max-h-96 overflow-y-auto">
                  {subscribers.map(s => (
                    <div key={s.id} className="flex items-center justify-between px-4 py-2.5">
                      <div>
                        <p className="text-sm text-foreground">{s.email}</p>
                        {s.name && <p className="text-xs text-muted-foreground">{s.name}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor[s.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {s.status}
                        </span>
                        <button
                          onClick={() => removeSubscriber(s.id)}
                          className="p-1 rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <span className="material-icons text-sm">close</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
