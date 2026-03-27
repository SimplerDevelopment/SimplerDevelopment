'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import MediaPicker from '@/components/admin/MediaPicker';

interface Branding {
  logoUrl: string;
  logoAlt: string;
  logoSquareUrl: string;
  logoRectUrl: string;
  logoText: string;
  logoIconUrl: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  headingFont: string;
  bodyFont: string;
  navTemplate: string;
  navPosition: string;
  navBackground: string;
  navTextColor: string;
}

const DEFAULTS: Branding = {
  logoUrl: '',
  logoAlt: '',
  logoSquareUrl: '',
  logoRectUrl: '',
  logoText: '',
  logoIconUrl: '',
  primaryColor: '#2563eb',
  secondaryColor: '#1e40af',
  accentColor: '#f59e0b',
  backgroundColor: '#ffffff',
  textColor: '#111827',
  headingFont: '',
  bodyFont: '',
  navTemplate: 'classic',
  navPosition: 'top',
  navBackground: '#ffffff',
  navTextColor: '#111827',
};

const FONT_OPTIONS = [
  { value: '', label: 'System Default' },
  { value: 'Inter', label: 'Inter' },
  { value: 'Playfair Display', label: 'Playfair Display' },
  { value: 'Roboto', label: 'Roboto' },
  { value: 'Open Sans', label: 'Open Sans' },
  { value: 'Montserrat', label: 'Montserrat' },
  { value: 'Lato', label: 'Lato' },
  { value: 'Poppins', label: 'Poppins' },
  { value: 'Raleway', label: 'Raleway' },
  { value: 'Merriweather', label: 'Merriweather' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Oswald', label: 'Oswald' },
  { value: 'DM Sans', label: 'DM Sans' },
  { value: 'Source Serif 4', label: 'Source Serif 4' },
  { value: 'Space Grotesk', label: 'Space Grotesk' },
];

export default function BrandingPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const [branding, setBranding] = useState<Branding>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch(`/api/portal/websites/${siteId}/branding`)
      .then(r => r.json())
      .then(res => {
        if (res.success) setBranding({ ...DEFAULTS, ...res.data });
      })
      .finally(() => setLoading(false));
  }, [siteId]);

  const update = (updates: Partial<Branding>) => {
    setBranding(prev => ({ ...prev, ...updates }));
    setDirty(true);
  };

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await fetch(`/api/portal/websites/${siteId}/branding`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(branding),
      });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, [siteId, branding]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-icons animate-spin text-muted-foreground">refresh</span>
      </div>
    );
  }

  const inputClass = 'w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none';
  const labelClass = 'block text-xs font-medium text-muted-foreground mb-1.5';
  const sectionClass = 'bg-card border border-border rounded-xl p-6';

  return (
    <div className="max-w-4xl mx-auto py-6 px-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/portal/websites/${siteId}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <span className="material-icons text-base">arrow_back</span>
            Back to Content
          </Link>
          <h1 className="text-2xl font-bold text-foreground">Brand Guidelines</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Set your brand identity. These styles apply as defaults across your site.
          </p>
        </div>
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          <span className="material-icons text-base">{saving ? 'refresh' : 'save'}</span>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* ── Logos ────────────────────────────────── */}
      <div className={sectionClass}>
        <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
          <span className="material-icons text-base">image</span>
          Logos
        </h2>
        <p className="text-sm text-muted-foreground mb-5">Upload different logo formats for various use cases across your site.</p>

        <div className="grid grid-cols-2 gap-6">
          {/* Square Logo */}
          <div>
            <label className={labelClass}>Square Logo</label>
            <p className="text-xs text-muted-foreground mb-2">Used for favicons, social media, and small displays.</p>
            <MediaPicker
              value={branding.logoSquareUrl}
              onChange={(url) => update({ logoSquareUrl: url })}
              label="Square Logo"
              mimeTypeFilter="image"
              apiEndpoint={`/api/portal/cms/websites/${siteId}/media`}
            />
          </div>

          {/* Rectangle Logo */}
          <div>
            <label className={labelClass}>Rectangle Logo</label>
            <p className="text-xs text-muted-foreground mb-2">Used in the navigation bar and headers.</p>
            <MediaPicker
              value={branding.logoRectUrl}
              onChange={(url) => update({ logoRectUrl: url })}
              label="Rectangle Logo"
              mimeTypeFilter="image"
              apiEndpoint={`/api/portal/cms/websites/${siteId}/media`}
            />
          </div>

          {/* Icon + Text Logo */}
          <div>
            <label className={labelClass}>Logo Icon</label>
            <p className="text-xs text-muted-foreground mb-2">Small icon that appears alongside your brand name.</p>
            <MediaPicker
              value={branding.logoIconUrl}
              onChange={(url) => update({ logoIconUrl: url })}
              label="Logo Icon"
              mimeTypeFilter="image"
              apiEndpoint={`/api/portal/cms/websites/${siteId}/media`}
            />
          </div>

          {/* Text Logo */}
          <div>
            <label className={labelClass}>Brand Name / Text Logo</label>
            <p className="text-xs text-muted-foreground mb-2">Text displayed when no image logo is available.</p>
            <input
              type="text"
              value={branding.logoText}
              onChange={(e) => update({ logoText: e.target.value })}
              className={inputClass}
              placeholder="Your Brand Name"
            />
            {branding.logoText && (
              <div className="mt-3 p-4 rounded-lg bg-muted/30 border border-border">
                <span className="text-xl font-bold" style={{ fontFamily: branding.headingFont ? `"${branding.headingFont}", sans-serif` : undefined }}>
                  {branding.logoText}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Legacy logo field */}
        <div className="mt-6 pt-6 border-t border-border">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className={labelClass}>Primary Logo (legacy)</label>
              <MediaPicker
                value={branding.logoUrl}
                onChange={(url) => update({ logoUrl: url })}
                label="Primary Logo"
                mimeTypeFilter="image"
                apiEndpoint={`/api/portal/cms/websites/${siteId}/media`}
              />
            </div>
            <div>
              <label className={labelClass}>Logo Alt Text</label>
              <input
                type="text"
                value={branding.logoAlt}
                onChange={(e) => update({ logoAlt: e.target.value })}
                className={inputClass}
                placeholder="Company name"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Colors ───────────────────────────────── */}
      <div className={sectionClass}>
        <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
          <span className="material-icons text-base">palette</span>
          Colors
        </h2>
        <p className="text-sm text-muted-foreground mb-5">Define your brand color palette. These are used as defaults in blocks and navigation.</p>

        <div className="grid grid-cols-3 gap-4">
          {([
            { key: 'primaryColor', label: 'Primary', desc: 'Buttons, links, accents' },
            { key: 'secondaryColor', label: 'Secondary', desc: 'Supporting elements' },
            { key: 'accentColor', label: 'Accent', desc: 'Highlights, badges' },
            { key: 'backgroundColor', label: 'Background', desc: 'Page background' },
            { key: 'textColor', label: 'Text', desc: 'Body text color' },
            { key: 'navBackground', label: 'Nav Background', desc: 'Navigation bar' },
          ] as const).map(({ key, label, desc }) => (
            <div key={key}>
              <label className={labelClass}>{label}</label>
              <p className="text-[11px] text-muted-foreground mb-2">{desc}</p>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={branding[key]}
                  onChange={(e) => update({ [key]: e.target.value })}
                  className="h-9 w-9 cursor-pointer rounded border border-border shrink-0"
                />
                <input
                  type="text"
                  value={branding[key]}
                  onChange={(e) => update({ [key]: e.target.value })}
                  className={`${inputClass} font-mono`}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Color preview */}
        <div className="mt-6 pt-6 border-t border-border">
          <label className={labelClass}>Preview</label>
          <div className="rounded-lg overflow-hidden border border-border">
            <div className="h-10 flex items-center px-4 gap-4" style={{ backgroundColor: branding.navBackground, color: branding.navTextColor }}>
              <span className="text-sm font-semibold">{branding.logoText || 'Brand'}</span>
              <div className="flex-1" />
              <span className="text-xs">Link</span>
              <span className="text-xs">Link</span>
              <span className="text-xs px-2 py-0.5 rounded text-white" style={{ backgroundColor: branding.primaryColor }}>Button</span>
            </div>
            <div className="p-6" style={{ backgroundColor: branding.backgroundColor, color: branding.textColor }}>
              <h3 className="text-lg font-bold mb-2" style={{ fontFamily: branding.headingFont ? `"${branding.headingFont}", sans-serif` : undefined }}>
                Heading Text Preview
              </h3>
              <p className="text-sm mb-3" style={{ fontFamily: branding.bodyFont ? `"${branding.bodyFont}", sans-serif` : undefined }}>
                Body text preview showing your selected fonts and colors. This is how your content will look with these brand settings applied.
              </p>
              <div className="flex gap-2">
                <span className="px-3 py-1 rounded text-sm text-white" style={{ backgroundColor: branding.primaryColor }}>Primary</span>
                <span className="px-3 py-1 rounded text-sm text-white" style={{ backgroundColor: branding.secondaryColor }}>Secondary</span>
                <span className="px-3 py-1 rounded text-sm text-white" style={{ backgroundColor: branding.accentColor }}>Accent</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Typography ───────────────────────────── */}
      <div className={sectionClass}>
        <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
          <span className="material-icons text-base">text_fields</span>
          Typography
        </h2>
        <p className="text-sm text-muted-foreground mb-5">Choose fonts for headings and body text. These are loaded from Google Fonts.</p>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className={labelClass}>Heading Font</label>
            <select
              value={branding.headingFont}
              onChange={(e) => update({ headingFont: e.target.value })}
              className={inputClass}
            >
              {FONT_OPTIONS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            {branding.headingFont && (
              <>
                <link
                  rel="stylesheet"
                  href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(branding.headingFont)}:wght@400;500;600;700&display=swap`}
                />
                <div className="mt-3 p-3 rounded-lg bg-muted/30 border border-border">
                  <p className="text-2xl font-bold" style={{ fontFamily: `"${branding.headingFont}", sans-serif` }}>
                    The quick brown fox
                  </p>
                  <p className="text-lg font-medium mt-1" style={{ fontFamily: `"${branding.headingFont}", sans-serif` }}>
                    jumps over the lazy dog
                  </p>
                </div>
              </>
            )}
          </div>

          <div>
            <label className={labelClass}>Body Font</label>
            <select
              value={branding.bodyFont}
              onChange={(e) => update({ bodyFont: e.target.value })}
              className={inputClass}
            >
              {FONT_OPTIONS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            {branding.bodyFont && (
              <>
                <link
                  rel="stylesheet"
                  href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(branding.bodyFont)}:wght@300;400;500;600&display=swap`}
                />
                <div className="mt-3 p-3 rounded-lg bg-muted/30 border border-border">
                  <p className="text-sm leading-relaxed" style={{ fontFamily: `"${branding.bodyFont}", sans-serif` }}>
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
