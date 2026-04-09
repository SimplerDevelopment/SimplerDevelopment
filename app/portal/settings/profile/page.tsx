'use client';

import { useEffect, useState } from 'react';

interface ProfileData {
  name: string;
  email: string;
  company: string;
  phone: string;
  website: string;
  address: string;
  emailPrefix: string;
}

export default function ProfileSettingsPage() {
  const [form, setForm] = useState<ProfileData>({ name: '', email: '', company: '', phone: '', website: '', address: '', emailPrefix: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/portal/settings/profile')
      .then(r => r.json())
      .then(res => { if (res.success) setForm(res.data); })
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/portal/settings/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      setMessage({ type: data.success ? 'success' : 'error', text: data.message });
    } catch {
      setMessage({ type: 'error', text: 'Something went wrong. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Account info */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-5">
          <h2 className="text-base font-semibold text-foreground">Account Information</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Full Name</label>
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Email</label>
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>
        </div>

        {/* Company info */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-5">
          <h2 className="text-base font-semibold text-foreground">Company Information</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Company Name</label>
              <input
                name="company"
                value={form.company}
                onChange={handleChange}
                placeholder="Acme Inc."
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Phone</label>
              <input
                name="phone"
                value={form.phone}
                onChange={handleChange}
                placeholder="+1 (555) 000-0000"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Website</label>
            <input
              name="website"
              value={form.website}
              onChange={handleChange}
              placeholder="https://acmeinc.com"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Address</label>
            <textarea
              name="address"
              value={form.address}
              onChange={handleChange}
              rows={2}
              placeholder="123 Main St, Springfield, IL 62701"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            />
          </div>
        </div>

        {message && (
          <div className={`flex items-center gap-3 p-4 rounded-xl border text-sm ${
            message.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300'
              : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300'
          }`}>
            <span className="material-icons text-base">
              {message.type === 'success' ? 'check_circle' : 'error'}
            </span>
            {message.text}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving && <span className="material-icons text-base animate-spin">refresh</span>}
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>

      <ChangePasswordSection />
      <DefaultPortalSection />
    </div>
  );
}

function ChangePasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'New password must be at least 8 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/portal/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setMessage({ type: 'error', text: data.error || 'Something went wrong.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Something went wrong. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Change Password</h2>
          <button
            type="button"
            onClick={() => setShowPasswords(!showPasswords)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <span className="material-icons text-sm">{showPasswords ? 'visibility_off' : 'visibility'}</span>
            {showPasswords ? 'Hide' : 'Show'}
          </button>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Current Password</label>
          <input
            type={showPasswords ? 'text' : 'password'}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">New Password</label>
            <input
              type={showPasswords ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Confirm New Password</label>
            <input
              type={showPasswords ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Confirm password"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>
      </div>

      {message && (
        <div className={`flex items-center gap-3 p-4 rounded-xl border text-sm ${
          message.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300'
            : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300'
        }`}>
          <span className="material-icons text-base">
            {message.type === 'success' ? 'check_circle' : 'error'}
          </span>
          {message.text}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving && <span className="material-icons text-base animate-spin">refresh</span>}
          {saving ? 'Updating…' : 'Update Password'}
        </button>
      </div>
    </form>
  );
}

function DefaultPortalSection() {
  const [portals, setPortals] = useState<{ clientId: number; company: string; subdomain: string | null }[]>([]);
  const [defaultClientId, setDefaultClientId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/portal/my-subdomain')
      .then(r => r.json())
      .then(data => {
        if (data.portals) setPortals(data.portals);
        if (data.defaultClientId) setDefaultClientId(data.defaultClientId);
      })
      .finally(() => setLoading(false));
  }, []);

  // Don't show section if user only has one portal
  if (loading || portals.length <= 1) return null;

  const handleChange = async (clientId: number) => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/portal/default-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json();
      if (data.success) {
        setDefaultClientId(clientId);
        setMessage({ type: 'success', text: 'Default portal updated.' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Something went wrong.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Something went wrong.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-foreground">Default Portal</h2>
          <p className="text-sm text-muted-foreground mt-1">Choose which portal you sign in to by default.</p>
        </div>

        <div className="space-y-2">
          {portals.map((portal) => (
            <button
              key={portal.clientId}
              onClick={() => handleChange(portal.clientId)}
              disabled={saving}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors text-left disabled:opacity-50 ${
                defaultClientId === portal.clientId
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50 hover:bg-accent'
              }`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                defaultClientId === portal.clientId ? 'bg-primary/10' : 'bg-accent'
              }`}>
                <span className={`text-sm font-bold ${defaultClientId === portal.clientId ? 'text-primary' : 'text-muted-foreground'}`}>
                  {(portal.company || 'U').charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-foreground block truncate">{portal.company}</span>
                {portal.subdomain && (
                  <span className="text-xs text-muted-foreground">{portal.subdomain}.simplerdevelopment.com</span>
                )}
              </div>
              {defaultClientId === portal.clientId && (
                <span className="material-icons text-primary text-base shrink-0">check_circle</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {message && (
        <div className={`flex items-center gap-3 p-4 rounded-xl border text-sm ${
          message.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300'
            : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300'
        }`}>
          <span className="material-icons text-base">
            {message.type === 'success' ? 'check_circle' : 'error'}
          </span>
          {message.text}
        </div>
      )}
    </div>
  );
}
