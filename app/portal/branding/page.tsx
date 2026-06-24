'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost, pInput } from '@/components/portal/portal-ui';

interface Profile {
  id: number;
  name: string;
  isDefault: boolean;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  logoUrl: string | null;
  headingFont: string | null;
  bodyFont: string | null;
}

interface WebsiteBranding {
  id: number;
  name: string;
  domain: string | null;
  brandingProfileId: number | null;
}

type Tab = 'profiles' | 'assignments';

export default function PortalBrandingPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [websites, setWebsites] = useState<WebsiteBranding[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('profiles');

  const fetchData = useCallback(async () => {
    const safeJson = async (url: string) => {
      try {
        const r = await fetch(url);
        const text = await r.text();
        if (!text) return { success: false, data: [] };
        const parsed = JSON.parse(text);
        if (!r.ok) return { success: false, data: [], message: parsed?.message };
        return parsed;
      } catch (err) {
        console.error(`Failed to load ${url}:`, err);
        return { success: false, data: [] };
      }
    };
    const [profileRes, siteRes] = await Promise.all([
      safeJson('/api/portal/branding/profiles'),
      safeJson('/api/portal/branding'),
    ]);
    if (profileRes.success) setProfiles(profileRes.data);
    if (siteRes.success) setWebsites(siteRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const createProfile = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const res = await fetch('/api/portal/branding/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), isDefault: profiles.length === 0 }),
    });
    if (res.ok) {
      setNewName('');
      setShowCreate(false);
      await fetchData();
    }
    setCreating(false);
  };

  const deleteProfile = async (id: number) => {
    await fetch(`/api/portal/branding/profiles/${id}`, { method: 'DELETE' });
    await fetchData();
  };

  const setDefault = async (id: number) => {
    await fetch(`/api/portal/branding/profiles/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDefault: true }),
    });
    await fetchData();
  };

  const assignProfile = async (websiteId: number, profileId: number | null) => {
    await fetch(`/api/portal/websites/${websiteId}/branding-profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandingProfileId: profileId }),
    });
    await fetchData();
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto flex items-center justify-center py-16 text-muted-foreground">
        <span className="material-icons animate-spin mr-2">progress_activity</span>
        Loading...
      </div>
    );
  }

  const tabs = [
    { id: 'profiles' as const, label: 'Branding & Messaging Profiles', icon: 'palette' },
    { id: 'assignments' as const, label: 'Website Assignments', icon: 'language' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PortalPageHeader
        eyebrow="Brand"
        title="Branding & Messaging"
        subtitle="Create and manage brand profiles with visual identity and company messaging. Assign them to websites, pitch decks, and proposals."
        actions={
          <button
            onClick={() => setShowCreate(!showCreate)}
            className={pBtnPrimary}
          >
            <span className="material-icons text-base">add</span>
            New Profile
          </button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="material-icons text-base">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Profiles Tab */}
      {activeTab === 'profiles' && (
        <section className="space-y-4">
          {showCreate && (
            <div className="bg-card border border-border rounded-2xl p-4 flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Profile Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Main Brand, Dark Variant, Event Theme"
                  className={pInput}
                  onKeyDown={(e) => e.key === 'Enter' && createProfile()}
                />
              </div>
              <button
                onClick={createProfile}
                disabled={creating || !newName.trim()}
                className={pBtnPrimary}
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
              <button
                onClick={() => { setShowCreate(false); setNewName(''); }}
                className={pBtnGhost}
              >
                Cancel
              </button>
            </div>
          )}

          {profiles.length === 0 ? (
            <div className="text-center py-12 bg-card border border-border rounded-2xl">
              <span className="material-icons text-4xl text-muted-foreground mb-2 block">palette</span>
              <p className="text-muted-foreground text-sm">No brand profiles yet.</p>
              <p className="text-muted-foreground text-xs mt-1">Create your first profile to get started.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {profiles.map((profile) => {
                const primary = profile.primaryColor || '#2563eb';
                const accent = profile.accentColor || '#f59e0b';

                return (
                  <div
                    key={profile.id}
                    className="bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/50 transition-colors"
                  >
                    <div className="h-2 flex">
                      <div className="flex-1" style={{ backgroundColor: primary }} />
                      <div className="flex-1" style={{ backgroundColor: accent }} />
                    </div>

                    <div className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0">
                          <h3 className="font-display font-extrabold tracking-[-0.01em] text-foreground truncate">{profile.name}</h3>
                          {(profile.headingFont || profile.bodyFont) && (
                            <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                              {[profile.headingFont, profile.bodyFont].filter(Boolean).join(' / ')}
                            </p>
                          )}
                        </div>
                        {profile.isDefault && (
                          <span className="shrink-0 ml-2 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-primary/10 text-primary">
                            Default
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        {profile.logoUrl ? (
                          <img src={profile.logoUrl} alt={profile.name} className="w-8 h-8 object-contain rounded" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-muted flex items-center justify-center">
                            <span className="material-icons text-sm text-muted-foreground">image</span>
                          </div>
                        )}
                        <div className="flex gap-1.5">
                          <div className="w-6 h-6 rounded-full border border-border" style={{ backgroundColor: primary }} title={`Primary: ${primary}`} />
                          <div className="w-6 h-6 rounded-full border border-border" style={{ backgroundColor: accent }} title={`Accent: ${accent}`} />
                          {profile.secondaryColor && (
                            <div className="w-6 h-6 rounded-full border border-border" style={{ backgroundColor: profile.secondaryColor }} title={`Secondary: ${profile.secondaryColor}`} />
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Link
                          href={`/portal/branding/profiles/${profile.id}`}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-border text-foreground hover:bg-accent transition-colors"
                        >
                          <span className="material-icons text-sm">edit</span>
                          Edit
                        </Link>
                        <Link
                          href={`/portal/branding/profiles/${profile.id}?tab=messaging`}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-border text-foreground hover:bg-accent transition-colors"
                        >
                          <span className="material-icons text-sm">chat</span>
                          Messaging
                        </Link>
                        {!profile.isDefault && (
                          <button
                            onClick={() => setDefault(profile.id)}
                            className="px-3 py-2 text-xs font-medium rounded-md border border-border text-foreground hover:bg-accent transition-colors"
                            title="Set as default"
                          >
                            <span className="material-icons text-sm">star_outline</span>
                          </button>
                        )}
                        <button
                          onClick={() => deleteProfile(profile.id)}
                          className="px-3 py-2 text-xs font-medium rounded-md border border-border text-destructive hover:bg-destructive/10 transition-colors"
                          title="Delete"
                        >
                          <span className="material-icons text-sm">delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Website Assignments Tab */}
      {activeTab === 'assignments' && (
        <section className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Assign a brand profile to each website. This determines the default styling for CMS blocks.
          </p>
          {websites.length === 0 || profiles.length === 0 ? (
            <div className="text-center py-12 bg-card border border-border rounded-2xl">
              <span className="material-icons text-4xl text-muted-foreground mb-2 block">language</span>
              <p className="text-muted-foreground text-sm">
                {profiles.length === 0
                  ? 'Create a brand profile first before assigning to websites.'
                  : 'No websites found.'}
              </p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-2xl divide-y divide-border">
              {websites.map((site) => (
                <div key={site.id} className="flex flex-wrap items-center justify-between px-4 py-3 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{site.name}</p>
                    {site.domain && <p className="text-xs text-muted-foreground truncate">{site.domain}</p>}
                  </div>
                  <select
                    value={site.brandingProfileId ?? ''}
                    onChange={(e) => assignProfile(site.id, e.target.value ? parseInt(e.target.value) : null)}
                    className="px-3 py-1.5 text-sm rounded-md border border-border bg-background text-foreground min-w-[180px]"
                  >
                    <option value="">No profile assigned</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.isDefault ? ' (Default)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
