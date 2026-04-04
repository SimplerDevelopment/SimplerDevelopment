'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function WebsiteSettingsForm({
  siteId,
  initialName,
  initialDescription,
  subdomain,
  initialPublicAccess = false,
  isAdmin = false,
}: {
  siteId: number;
  initialName: string;
  initialDescription: string;
  subdomain?: string;
  initialPublicAccess?: boolean;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [sub, setSub] = useState(subdomain || '');
  const [publicAccess, setPublicAccess] = useState(initialPublicAccess);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const dirty = name !== initialName || description !== initialDescription || sub !== (subdomain || '') || publicAccess !== initialPublicAccess;

  const handleSubChange = (val: string) => {
    setSub(val.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 63));
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`/api/portal/cms/websites/${siteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), subdomain: sub.trim() || null, publicAccess }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage('Settings saved.');
        router.refresh();
      } else {
        setMessage(json.message || 'Failed to save.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-3">
        <span className="material-icons text-muted-foreground text-lg">tune</span>
        <h3 className="font-semibold text-sm text-foreground">General</h3>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Website name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-foreground outline-none focus:border-primary text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-foreground outline-none focus:border-primary text-sm resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Subdomain</label>
          <div className="flex items-center gap-0">
            <div className="flex items-center px-3 py-2.5 bg-background border border-border rounded-l-lg flex-1 focus-within:border-primary transition-colors">
              <input
                value={sub}
                onChange={e => handleSubChange(e.target.value)}
                placeholder="my-site"
                className="bg-transparent outline-none flex-1 text-sm text-foreground font-mono"
              />
            </div>
            <div className="px-3 py-2.5 bg-muted/50 border border-l-0 border-border rounded-r-lg text-sm text-muted-foreground font-mono shrink-0">
              .simplerdevelopment.com
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Lowercase letters, numbers, and hyphens only. 3-63 characters.</p>
        </div>
      </div>

      {/* Public Access Toggle */}
      <div className="flex items-center justify-between py-3 border-t border-border">
        <div>
          <label className="block text-sm font-medium text-foreground">Public access</label>
          <p className="text-xs text-muted-foreground mt-0.5">
            {publicAccess
              ? 'Site is publicly accessible and indexable by search engines.'
              : 'Site is gated. Public visitors see a "coming soon" page. Search engines are blocked.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPublicAccess(!publicAccess)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${publicAccess ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
        >
          <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${publicAccess ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !dirty || !name.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving && <span className="material-icons text-base animate-spin">refresh</span>}
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        {message && (
          <p className={`text-sm ${message.includes('saved') ? 'text-green-600' : 'text-red-600'}`}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
