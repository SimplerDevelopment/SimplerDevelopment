'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface ProfileData {
  id: number;
  name: string;
  isDefault: boolean;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  navTemplate: string;
  navPosition: string;
  navBackground: string;
  navTextColor: string;
  headingFont: string;
  bodyFont: string;
  logoUrl: string;
  logoAlt: string;
  logoSquareUrl: string;
  logoRectUrl: string;
  logoText: string;
  logoIconUrl: string;
}

const COLOR_FIELDS: Array<{ key: keyof ProfileData; label: string }> = [
  { key: 'primaryColor', label: 'Primary' },
  { key: 'secondaryColor', label: 'Secondary' },
  { key: 'accentColor', label: 'Accent' },
  { key: 'backgroundColor', label: 'Background' },
  { key: 'textColor', label: 'Text' },
  { key: 'navBackground', label: 'Nav Background' },
  { key: 'navTextColor', label: 'Nav Text' },
];

export default function BrandingProfileEditorPage() {
  const { profileId } = useParams<{ profileId: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/portal/branding/profiles/${profileId}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setProfile(res.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [profileId]);

  const save = useCallback(async () => {
    if (!profile) return;
    setSaving(true);
    await fetch(`/api/portal/branding/profiles/${profileId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [profile, profileId]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto flex items-center justify-center py-16 text-muted-foreground">
        <span className="material-icons animate-spin mr-2">progress_activity</span>
        Loading...
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-3xl mx-auto text-center py-16">
        <p className="text-muted-foreground">Profile not found.</p>
        <Link href="/portal/branding" className="text-primary text-sm mt-2 inline-block">Back to Branding</Link>
      </div>
    );
  }

  const update = (key: keyof ProfileData, value: string | boolean) => {
    setProfile((prev) => prev ? { ...prev, [key]: value } : prev);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/portal/branding" className="hover:text-foreground transition-colors">Branding</Link>
        <span className="material-icons text-xs">chevron_right</span>
        <span className="text-foreground">{profile.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={profile.name}
            onChange={(e) => update('name', e.target.value)}
            className="text-2xl font-bold text-foreground bg-transparent border-none outline-none w-full focus:ring-0"
            placeholder="Profile name"
          />
          <label className="flex items-center gap-2 mt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={profile.isDefault}
              onChange={(e) => update('isDefault', e.target.checked)}
              className="rounded border-border"
            />
            <span className="text-xs text-muted-foreground">Default profile</span>
          </label>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save'}
        </button>
      </div>

      {/* Color preview bar */}
      <div className="h-3 rounded-full overflow-hidden flex">
        <div className="flex-1" style={{ backgroundColor: profile.primaryColor }} />
        <div className="flex-1" style={{ backgroundColor: profile.secondaryColor }} />
        <div className="flex-1" style={{ backgroundColor: profile.accentColor }} />
        <div className="flex-1" style={{ backgroundColor: profile.backgroundColor }} />
        <div className="flex-1" style={{ backgroundColor: profile.textColor }} />
      </div>

      {/* Colors */}
      <section className="bg-card border border-border rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-base">palette</span>
          Colors
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {COLOR_FIELDS.map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs text-muted-foreground mb-1">{label}</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={profile[key] as string}
                  onChange={(e) => update(key, e.target.value)}
                  className="w-8 h-8 rounded border border-border cursor-pointer"
                />
                <input
                  type="text"
                  value={profile[key] as string}
                  onChange={(e) => update(key, e.target.value)}
                  className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded text-foreground font-mono"
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Typography */}
      <section className="bg-card border border-border rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-base">text_fields</span>
          Typography
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Heading Font</label>
            <input
              type="text"
              value={profile.headingFont || ''}
              onChange={(e) => update('headingFont', e.target.value)}
              placeholder="e.g. Inter, Playfair Display"
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Body Font</label>
            <input
              type="text"
              value={profile.bodyFont || ''}
              onChange={(e) => update('bodyFont', e.target.value)}
              placeholder="e.g. Inter, Open Sans"
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground"
            />
          </div>
        </div>
      </section>

      {/* Logos */}
      <section className="bg-card border border-border rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-base">image</span>
          Logos
        </h3>
        <div className="grid grid-cols-2 gap-4">
          {[
            { key: 'logoUrl' as keyof ProfileData, label: 'Primary Logo' },
            { key: 'logoSquareUrl' as keyof ProfileData, label: 'Square Logo' },
            { key: 'logoRectUrl' as keyof ProfileData, label: 'Rectangle Logo' },
            { key: 'logoIconUrl' as keyof ProfileData, label: 'Icon/Favicon' },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs text-muted-foreground mb-1">{label}</label>
              <input
                type="text"
                value={(profile[key] as string) || ''}
                onChange={(e) => update(key, e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground"
              />
              {profile[key] && (
                <img src={profile[key] as string} alt={label} className="mt-2 h-10 object-contain rounded" />
              )}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Logo Text</label>
            <input
              type="text"
              value={profile.logoText || ''}
              onChange={(e) => update('logoText', e.target.value)}
              placeholder="Company Name"
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Logo Alt Text</label>
            <input
              type="text"
              value={profile.logoAlt || ''}
              onChange={(e) => update('logoAlt', e.target.value)}
              placeholder="Logo description"
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
