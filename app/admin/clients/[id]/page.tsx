'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';

interface Client {
  id: number; userId: number; company: string | null; phone: string | null;
  website: string | null; notes: string | null; createdAt: string;
  userName: string; userEmail: string; userActive: boolean;
}
interface EmailList { id: number; name: string; description: string | null; subscriberCount: number; }
interface Campaign {
  id: number; name: string; subject: string; status: string;
  totalSent: number; totalOpened: number; sentAt: string | null; listName: string | null;
}
interface Subscriber { id: number; email: string; name: string | null; status: string; }

const statusColor: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700', scheduled: 'bg-blue-100 text-blue-700',
  sending: 'bg-yellow-100 text-yellow-700', sent: 'bg-green-100 text-green-700',
};

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const clientId = parseInt(id);
  const [client, setClient] = useState<Client | null>(null);
  const [tab, setTab] = useState<'overview' | 'email'>('overview');
  const [lists, setLists] = useState<EmailList[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [emailLoaded, setEmailLoaded] = useState(false);

  // List management
  const [selectedList, setSelectedList] = useState<EmailList | null>(null);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [showListForm, setShowListForm] = useState(false);
  const [listForm, setListForm] = useState({ name: '', description: '' });
  const [subForm, setSubForm] = useState({ email: '', name: '' });
  const [subSaving, setSubSaving] = useState(false);

  // Campaign form
  const [showCampForm, setShowCampForm] = useState(false);
  const [campForm, setCampForm] = useState({ name: '', subject: '', fromName: '', fromEmail: '', listId: '', htmlContent: '' });
  const [campSaving, setCampSaving] = useState(false);
  const [campError, setCampError] = useState('');

  useEffect(() => {
    fetch('/api/admin/portal/clients')
      .then(r => r.json())
      .then(d => {
        const found = (d.data ?? []).find((c: Client) => c.id === clientId);
        setClient(found ?? null);
        setLoading(false);
      });
  }, [clientId]);

  useEffect(() => {
    if (tab === 'email' && !emailLoaded) {
      Promise.all([
        fetch(`/api/admin/email/lists?clientId=${clientId}`).then(r => r.json()),
        fetch(`/api/admin/email/campaigns?clientId=${clientId}`).then(r => r.json()),
      ]).then(([l, c]) => { setLists(l.data ?? []); setCampaigns(c.data ?? []); setEmailLoaded(true); });
    }
  }, [tab, emailLoaded, clientId]);

  async function openList(list: EmailList) {
    setSelectedList(list);
    const data = await fetch(`/api/admin/email/lists/${list.id}`).then(r => r.json());
    setSubscribers(data.data ?? []);
  }

  async function createList(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/admin/email/lists', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...listForm, clientId }),
    });
    const data = await res.json();
    if (!data.success) return;
    setLists(prev => [{ ...data.data, subscriberCount: 0 }, ...prev]);
    setShowListForm(false); setListForm({ name: '', description: '' });
  }

  async function addSubscriber(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedList) return;
    setSubSaving(true);
    const res = await fetch('/api/admin/email/subscribers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listId: selectedList.id, ...subForm }),
    });
    const data = await res.json();
    setSubSaving(false);
    if (!data.success) return;
    setSubscribers(prev => [...prev, data.data]);
    setLists(prev => prev.map(l => l.id === selectedList.id ? { ...l, subscriberCount: l.subscriberCount + 1 } : l));
    setSubForm({ email: '', name: '' });
  }

  async function removeSubscriber(subId: number) {
    if (!confirm('Remove subscriber?')) return;
    await fetch(`/api/admin/email/subscribers?id=${subId}`, { method: 'DELETE' });
    setSubscribers(prev => prev.filter(s => s.id !== subId));
  }

  async function deleteList(listId: number) {
    if (!confirm('Delete this list and all subscribers?')) return;
    await fetch(`/api/admin/email/lists/${listId}`, { method: 'DELETE' });
    setLists(prev => prev.filter(l => l.id !== listId));
    if (selectedList?.id === listId) setSelectedList(null);
  }

  async function createCampaign(e: React.FormEvent) {
    e.preventDefault();
    setCampSaving(true); setCampError('');
    const res = await fetch('/api/admin/email/campaigns', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...campForm, clientId }),
    });
    const data = await res.json();
    setCampSaving(false);
    if (!data.success) { setCampError(data.message ?? 'Failed'); return; }
    setCampaigns(prev => [{ ...data.data, listName: lists.find(l => l.id === parseInt(campForm.listId))?.name ?? null }, ...prev]);
    setShowCampForm(false);
    setCampForm({ name: '', subject: '', fromName: '', fromEmail: '', listId: '', htmlContent: '' });
  }

  async function deleteCampaign(campId: number, status: string) {
    if (status === 'sending') { alert('Cannot delete a sending campaign.'); return; }
    if (!confirm('Delete campaign?')) return;
    await fetch(`/api/admin/email/campaigns/${campId}`, { method: 'DELETE' });
    setCampaigns(prev => prev.filter(c => c.id !== campId));
  }

  const ic = 'w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary';

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!client) return <div className="p-6 text-sm text-muted-foreground">Client not found.</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link href="/admin/clients" className="text-muted-foreground hover:text-foreground">
          <span className="material-icons text-base">arrow_back</span>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{client.company ?? client.userName}</h1>
          <p className="text-sm text-muted-foreground">{client.userEmail}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border flex gap-1">
        {(['overview', 'email'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {t === 'email' ? 'Email Marketing' : 'Overview'}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="bg-card border border-border rounded-lg divide-y divide-border">
          {[
            { label: 'Name', value: client.userName },
            { label: 'Email', value: client.userEmail },
            { label: 'Company', value: client.company ?? '—' },
            { label: 'Phone', value: client.phone ?? '—' },
            { label: 'Website', value: client.website ?? '—' },
            { label: 'Status', value: client.userActive ? 'Active' : 'Inactive' },
            { label: 'Notes', value: client.notes ?? '—' },
          ].map(row => (
            <div key={row.label} className="flex px-5 py-3 gap-4">
              <span className="text-sm text-muted-foreground w-24 shrink-0">{row.label}</span>
              <span className="text-sm text-foreground">{row.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Email Marketing */}
      {tab === 'email' && (
        <div className="space-y-6">
          {/* Lists + Subscribers */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Subscriber Lists</h2>
              <button onClick={() => setShowListForm(!showListForm)}
                className="flex items-center gap-1 text-sm text-primary hover:underline">
                <span className="material-icons text-sm">add</span> New List
              </button>
            </div>

            {showListForm && (
              <form onSubmit={createList} className="flex gap-3 p-4 border-b border-border">
                <input required value={listForm.name} onChange={e => setListForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="List name" className={ic} />
                <input value={listForm.description} onChange={e => setListForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Description (optional)" className={ic} />
                <button type="submit" className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90">Create</button>
                <button type="button" onClick={() => setShowListForm(false)} className="px-3 py-2 border border-border rounded-md text-sm text-muted-foreground hover:bg-accent">Cancel</button>
              </form>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">
              {/* List column */}
              <div className="divide-y divide-border">
                {!emailLoaded ? (
                  <p className="p-6 text-sm text-muted-foreground">Loading…</p>
                ) : lists.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">No lists yet.</p>
                ) : lists.map(list => (
                  <div key={list.id} onClick={() => openList(list)}
                    className={`flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-accent transition-colors ${selectedList?.id === list.id ? 'bg-accent' : ''}`}>
                    <div>
                      <p className="text-sm font-medium text-foreground">{list.name}</p>
                      <p className="text-xs text-muted-foreground">{list.subscriberCount} subscriber{list.subscriberCount !== 1 ? 's' : ''}</p>
                    </div>
                    <button onClick={e => { e.stopPropagation(); deleteList(list.id); }}
                      className="p-1 text-muted-foreground hover:text-red-500 transition-colors">
                      <span className="material-icons text-base">delete</span>
                    </button>
                  </div>
                ))}
              </div>

              {/* Subscribers column */}
              <div>
                {!selectedList ? (
                  <p className="p-6 text-sm text-muted-foreground">Select a list to manage subscribers.</p>
                ) : (
                  <>
                    <form onSubmit={addSubscriber} className="flex gap-2 p-4 border-b border-border">
                      <input required type="email" value={subForm.email} onChange={e => setSubForm(p => ({ ...p, email: e.target.value }))}
                        placeholder="Email" className={`${ic} flex-1`} />
                      <input value={subForm.name} onChange={e => setSubForm(p => ({ ...p, name: e.target.value }))}
                        placeholder="Name" className={`${ic} w-28`} />
                      <button type="submit" disabled={subSaving} className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 disabled:opacity-50">
                        <span className="material-icons text-base">add</span>
                      </button>
                    </form>
                    <div className="divide-y divide-border max-h-64 overflow-y-auto">
                      {subscribers.length === 0 ? (
                        <p className="p-4 text-sm text-muted-foreground">No subscribers yet.</p>
                      ) : subscribers.map(s => (
                        <div key={s.id} className="flex items-center justify-between px-4 py-2.5">
                          <div>
                            <p className="text-sm text-foreground">{s.email}</p>
                            {s.name && <p className="text-xs text-muted-foreground">{s.name}</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${s.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{s.status}</span>
                            <button onClick={() => removeSubscriber(s.id)} className="p-0.5 text-muted-foreground hover:text-red-500">
                              <span className="material-icons text-sm">close</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Campaigns */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Campaigns</h2>
              <button onClick={() => setShowCampForm(!showCampForm)}
                className="flex items-center gap-1 text-sm text-primary hover:underline">
                <span className="material-icons text-sm">add</span> New Campaign
              </button>
            </div>

            {showCampForm && (
              <form onSubmit={createCampaign} className="p-5 space-y-4 border-b border-border">
                {campError && <p className="text-sm text-red-600">{campError}</p>}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className="block text-xs font-medium text-foreground mb-1">Internal Name *</label>
                    <input required value={campForm.name} onChange={e => setCampForm(p => ({ ...p, name: e.target.value }))} className={ic} /></div>
                  <div><label className="block text-xs font-medium text-foreground mb-1">Subject *</label>
                    <input required value={campForm.subject} onChange={e => setCampForm(p => ({ ...p, subject: e.target.value }))} className={ic} /></div>
                  <div><label className="block text-xs font-medium text-foreground mb-1">From Name *</label>
                    <input required value={campForm.fromName} onChange={e => setCampForm(p => ({ ...p, fromName: e.target.value }))} className={ic} /></div>
                  <div><label className="block text-xs font-medium text-foreground mb-1">From Email *</label>
                    <input required type="email" value={campForm.fromEmail} onChange={e => setCampForm(p => ({ ...p, fromEmail: e.target.value }))} className={ic} /></div>
                  <div><label className="block text-xs font-medium text-foreground mb-1">List *</label>
                    <select required value={campForm.listId} onChange={e => setCampForm(p => ({ ...p, listId: e.target.value }))} className={ic}>
                      <option value="">Select a list…</option>
                      {lists.map(l => <option key={l.id} value={l.id}>{l.name} ({l.subscriberCount})</option>)}
                    </select></div>
                  <div className="sm:col-span-2"><label className="block text-xs font-medium text-foreground mb-1">HTML Content *</label>
                    <textarea required value={campForm.htmlContent} onChange={e => setCampForm(p => ({ ...p, htmlContent: e.target.value }))}
                      rows={6} className={`${ic} font-mono text-xs`} placeholder="<h1>Hello</h1><p>Your message here...</p>" /></div>
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={campSaving} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                    {campSaving ? 'Saving…' : 'Create Campaign'}
                  </button>
                  <button type="button" onClick={() => setShowCampForm(false)} className="px-4 py-2 border border-border rounded-md text-sm text-muted-foreground hover:bg-accent">Cancel</button>
                </div>
              </form>
            )}

            {!emailLoaded ? (
              <p className="p-6 text-sm text-muted-foreground">Loading…</p>
            ) : campaigns.length === 0 ? (
              <p className="p-8 text-sm text-muted-foreground text-center">No campaigns yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-5 py-2.5 font-medium text-muted-foreground">Campaign</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">List</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Open Rate</th>
                  <th className="px-4 py-2.5"></th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {campaigns.map(c => (
                    <tr key={c.id} className="hover:bg-accent transition-colors">
                      <td className="px-5 py-3">
                        <Link href={`/admin/email/campaigns/${c.id}`} className="font-medium text-foreground hover:text-primary">{c.name}</Link>
                        <p className="text-xs text-muted-foreground truncate max-w-xs">{c.subject}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{c.listName ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[c.status] ?? 'bg-gray-100 text-gray-700'}`}>{c.status}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground hidden md:table-cell">
                        {c.status === 'sent' && c.totalSent > 0 ? `${Math.round(c.totalOpened / c.totalSent * 100)}%` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/admin/email/campaigns/${c.id}`} className="p-1 text-muted-foreground hover:text-foreground">
                            <span className="material-icons text-base">open_in_new</span>
                          </Link>
                          <button onClick={() => deleteCampaign(c.id, c.status)} className="p-1 text-muted-foreground hover:text-red-500">
                            <span className="material-icons text-base">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
