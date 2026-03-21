'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface EmailList {
  id: number;
  name: string;
  subscriberCount: number;
}

export default function NewCampaignPage() {
  const router = useRouter();
  const [lists, setLists] = useState<EmailList[]>([]);
  const [form, setForm] = useState({
    name: '',
    subject: '',
    previewText: '',
    fromName: '',
    fromEmail: '',
    replyTo: '',
    listId: '',
    htmlContent: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    fetch('/api/admin/email/lists')
      .then(r => r.json())
      .then(d => setLists(d.data ?? []));
  }, []);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [field]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const res = await fetch('/api/admin/email/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (!data.success) { setError(data.message ?? 'Failed to create campaign'); return; }
    router.push(`/admin/email/campaigns/${data.data.id}`);
  }

  const inputClass = 'w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary';
  const labelClass = 'block text-sm font-medium text-foreground mb-1';

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/admin/email/campaigns" className="text-muted-foreground hover:text-foreground">
          <span className="material-icons text-base">arrow_back</span>
        </Link>
        <h1 className="text-2xl font-bold text-foreground">New Campaign</h1>
      </div>

      <form onSubmit={save} className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
        )}

        {/* Basics */}
        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
          <h2 className="font-semibold text-foreground">Campaign Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelClass}>Internal Name *</label>
              <input required value={form.name} onChange={set('name')} className={inputClass} placeholder="e.g. March Newsletter 2026" />
              <p className="text-xs text-muted-foreground mt-1">Only visible to you, not to recipients.</p>
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Subject Line *</label>
              <input required value={form.subject} onChange={set('subject')} className={inputClass} placeholder="What's your email about?" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Preview Text</label>
              <input value={form.previewText} onChange={set('previewText')} className={inputClass} placeholder="Short summary shown in email clients after subject" />
            </div>
          </div>
        </div>

        {/* Sender */}
        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
          <h2 className="font-semibold text-foreground">Sender</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>From Name *</label>
              <input required value={form.fromName} onChange={set('fromName')} className={inputClass} placeholder="e.g. Simpler Development" />
            </div>
            <div>
              <label className={labelClass}>From Email *</label>
              <input required type="email" value={form.fromEmail} onChange={set('fromEmail')} className={inputClass} placeholder="hello@yourdomain.com" />
              <p className="text-xs text-muted-foreground mt-1">Must be a verified Resend domain.</p>
            </div>
            <div>
              <label className={labelClass}>Reply-To</label>
              <input type="email" value={form.replyTo} onChange={set('replyTo')} className={inputClass} placeholder="Optional" />
            </div>
          </div>
        </div>

        {/* List */}
        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
          <h2 className="font-semibold text-foreground">Recipients</h2>
          <div>
            <label className={labelClass}>Subscriber List *</label>
            <select required value={form.listId} onChange={set('listId')} className={inputClass}>
              <option value="">Select a list…</option>
              {lists.map(l => (
                <option key={l.id} value={l.id}>{l.name} ({l.subscriberCount} subscribers)</option>
              ))}
            </select>
            {lists.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                No lists found. <Link href="/admin/email/lists" className="text-primary hover:underline">Create one first.</Link>
              </p>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Email Content (HTML)</h2>
            <button
              type="button"
              onClick={() => setPreview(!preview)}
              className="flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <span className="material-icons text-sm">{preview ? 'code' : 'preview'}</span>
              {preview ? 'Edit' : 'Preview'}
            </button>
          </div>
          {preview ? (
            <div
              className="border border-border rounded-md p-4 min-h-64 bg-white text-sm overflow-auto"
              dangerouslySetInnerHTML={{ __html: form.htmlContent }}
            />
          ) : (
            <textarea
              required
              value={form.htmlContent}
              onChange={set('htmlContent')}
              rows={16}
              className={`${inputClass} font-mono text-xs`}
              placeholder={`<h1>Hello {{name}},</h1>\n<p>Your email content here...</p>`}
            />
          )}
          <p className="text-xs text-muted-foreground">
            Write HTML directly. An unsubscribe footer and wrapper are added automatically.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Campaign'}
          </button>
          <Link href="/admin/email/campaigns" className="px-5 py-2.5 border border-border rounded-lg text-sm text-muted-foreground hover:bg-accent">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
