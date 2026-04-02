'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import MediaPicker from '@/components/admin/MediaPicker';
import { GoogleFontPicker } from '@/components/blocks/visual/GoogleFontPicker';

interface ElementTypography {
  font?: string;
  size?: string;
  weight?: string;
  lineHeight?: string;
  letterSpacing?: string;
}

interface DarkModeOverrides {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  navBackground?: string;
  navTextColor?: string;
  logoUrl?: string;
  logoSquareUrl?: string;
  logoRectUrl?: string;
  logoIconUrl?: string;
}

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
  typography: Record<string, ElementTypography>;
  darkMode: DarkModeOverrides;
  navTemplate: string;
  navPosition: string;
  navBackground: string;
  navTextColor: string;
}

const DEFAULT_TYPOGRAPHY: Record<string, ElementTypography> = {
  h1: { size: '2.5rem', weight: '700', lineHeight: '1.2', letterSpacing: '-0.02em' },
  h2: { size: '2rem', weight: '600', lineHeight: '1.25', letterSpacing: '-0.01em' },
  h3: { size: '1.5rem', weight: '600', lineHeight: '1.3', letterSpacing: '0' },
  h4: { size: '1.25rem', weight: '600', lineHeight: '1.35', letterSpacing: '0' },
  h5: { size: '1.125rem', weight: '600', lineHeight: '1.4', letterSpacing: '0' },
  h6: { size: '1rem', weight: '600', lineHeight: '1.4', letterSpacing: '0.01em' },
  p: { size: '1rem', weight: '400', lineHeight: '1.6', letterSpacing: '0' },
  blockquote: { size: '1.125rem', weight: '400', lineHeight: '1.6', letterSpacing: '0' },
  button: { size: '0.875rem', weight: '500', lineHeight: '1.25', letterSpacing: '0.02em' },
  nav: { size: '0.875rem', weight: '500', lineHeight: '1.5', letterSpacing: '0.01em' },
  small: { size: '0.75rem', weight: '400', lineHeight: '1.5', letterSpacing: '0.01em' },
  caption: { size: '0.875rem', weight: '400', lineHeight: '1.4', letterSpacing: '0.01em' },
};

const ELEMENT_LABELS: Record<string, { label: string; desc: string; category: 'heading' | 'body' | 'ui' }> = {
  h1: { label: 'H1', desc: 'Main page title', category: 'heading' },
  h2: { label: 'H2', desc: 'Section heading', category: 'heading' },
  h3: { label: 'H3', desc: 'Sub-section heading', category: 'heading' },
  h4: { label: 'H4', desc: 'Card / block title', category: 'heading' },
  h5: { label: 'H5', desc: 'Small heading', category: 'heading' },
  h6: { label: 'H6', desc: 'Label heading', category: 'heading' },
  p: { label: 'Paragraph', desc: 'Body text', category: 'body' },
  blockquote: { label: 'Blockquote', desc: 'Quoted text', category: 'body' },
  small: { label: 'Small', desc: 'Fine print, captions', category: 'body' },
  caption: { label: 'Caption', desc: 'Image / table captions', category: 'body' },
  button: { label: 'Button', desc: 'Buttons and CTAs', category: 'ui' },
  nav: { label: 'Nav Link', desc: 'Navigation items', category: 'ui' },
};

const WEIGHT_OPTIONS = [
  { value: '300', label: 'Light' },
  { value: '400', label: 'Regular' },
  { value: '500', label: 'Medium' },
  { value: '600', label: 'Semibold' },
  { value: '700', label: 'Bold' },
  { value: '800', label: 'Extra Bold' },
];

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
  typography: {},
  darkMode: {},
  navTemplate: 'classic',
  navPosition: 'top',
  navBackground: '#ffffff',
  navTextColor: '#111827',
};

export default function BrandingPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const [branding, setBranding] = useState<Branding>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [activeTab, setActiveTab] = useState<'logos' | 'colors' | 'typography'>('logos');

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

  const updateDark = (updates: Partial<DarkModeOverrides>) => {
    update({ darkMode: { ...(branding.darkMode || {}), ...updates } });
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

  const getTypo = (el: string): ElementTypography => ({
    ...DEFAULT_TYPOGRAPHY[el],
    ...(branding.typography?.[el] || {}),
  });

  const updateTypo = (el: string, updates: Partial<ElementTypography>) => {
    const current = getTypo(el);
    update({
      typography: {
        ...(branding.typography || {}),
        [el]: { ...current, ...updates },
      },
    });
  };

  // Resolve font for an element: element-specific -> headingFont/bodyFont -> system
  const resolveFont = (el: string): string => {
    const t = getTypo(el);
    if (t.font) return t.font;
    const info = ELEMENT_LABELS[el];
    if (info?.category === 'heading') return branding.headingFont || '';
    return branding.bodyFont || '';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-icons animate-spin text-muted-foreground">refresh</span>
      </div>
    );
  }

  const inputClass = 'w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none';
  const labelClass = 'block text-xs font-medium text-muted-foreground mb-1.5';

  const tabs = [
    { id: 'logos' as const, label: 'Logos', icon: 'image' },
    { id: 'colors' as const, label: 'Colors', icon: 'palette' },
    { id: 'typography' as const, label: 'Typography', icon: 'text_fields' },
  ];

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

      {/* ── Logos ────────────────────────────────── */}
      {activeTab === 'logos' && (
      <div>
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

        {/* Dark mode logos */}
        <div className="mt-6 pt-6 border-t border-border">
          <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
            <span className="material-icons text-base">dark_mode</span>
            Dark Mode Logo Overrides
          </h3>
          <p className="text-xs text-muted-foreground mb-4">Upload alternate logos for dark backgrounds. Falls back to light versions if not set.</p>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className={labelClass}>Dark Square Logo</label>
              <MediaPicker
                value={branding.darkMode?.logoSquareUrl || ''}
                onChange={(url) => updateDark({ logoSquareUrl: url })}
                label="Dark Square Logo"
                mimeTypeFilter="image"
                apiEndpoint={`/api/portal/cms/websites/${siteId}/media`}
              />
            </div>
            <div>
              <label className={labelClass}>Dark Rectangle Logo</label>
              <MediaPicker
                value={branding.darkMode?.logoRectUrl || ''}
                onChange={(url) => updateDark({ logoRectUrl: url })}
                label="Dark Rectangle Logo"
                mimeTypeFilter="image"
                apiEndpoint={`/api/portal/cms/websites/${siteId}/media`}
              />
            </div>
            <div>
              <label className={labelClass}>Dark Logo Icon</label>
              <MediaPicker
                value={branding.darkMode?.logoIconUrl || ''}
                onChange={(url) => updateDark({ logoIconUrl: url })}
                label="Dark Logo Icon"
                mimeTypeFilter="image"
                apiEndpoint={`/api/portal/cms/websites/${siteId}/media`}
              />
            </div>
            <div>
              <label className={labelClass}>Dark Primary Logo (legacy)</label>
              <MediaPicker
                value={branding.darkMode?.logoUrl || ''}
                onChange={(url) => updateDark({ logoUrl: url })}
                label="Dark Primary Logo"
                mimeTypeFilter="image"
                apiEndpoint={`/api/portal/cms/websites/${siteId}/media`}
              />
            </div>
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
      )}

      {/* ── Colors ───────────────────────────────── */}
      {activeTab === 'colors' && (
      <div>
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

        {/* Dark mode colors */}
        <div className="mt-6 pt-6 border-t border-border">
          <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
            <span className="material-icons text-base">dark_mode</span>
            Dark Mode Color Overrides
          </h3>
          <p className="text-xs text-muted-foreground mb-4">Colors used when the site is in dark mode. Falls back to light values if not set.</p>
          <div className="grid grid-cols-3 gap-4">
            {([
              { key: 'primaryColor' as const, label: 'Primary' },
              { key: 'secondaryColor' as const, label: 'Secondary' },
              { key: 'accentColor' as const, label: 'Accent' },
              { key: 'backgroundColor' as const, label: 'Background' },
              { key: 'textColor' as const, label: 'Text' },
              { key: 'navBackground' as const, label: 'Nav Background' },
            ]).map(({ key, label }) => (
              <div key={key}>
                <label className={labelClass}>{label}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={branding.darkMode?.[key] || branding[key]}
                    onChange={(e) => updateDark({ [key]: e.target.value })}
                    className="h-9 w-9 cursor-pointer rounded border border-border shrink-0"
                  />
                  <input
                    type="text"
                    value={branding.darkMode?.[key] || ''}
                    onChange={(e) => updateDark({ [key]: e.target.value })}
                    className={`${inputClass} font-mono`}
                    placeholder={branding[key]}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Color previews: Light + Dark side by side */}
        <div className="mt-6 pt-6 border-t border-border">
          <label className={labelClass}>Preview</label>
          <div className="grid grid-cols-2 gap-4">
            {/* Light mode preview */}
            <div>
              <span className="text-[11px] text-muted-foreground mb-1 block">Light Mode</span>
              <div className="rounded-lg overflow-hidden border border-border">
                <div className="h-10 flex items-center px-4 gap-4" style={{ backgroundColor: branding.navBackground, color: branding.navTextColor }}>
                  <span className="text-sm font-semibold">{branding.logoText || 'Brand'}</span>
                  <div className="flex-1" />
                  <span className="text-xs">Link</span>
                  <span className="text-xs px-2 py-0.5 rounded text-white" style={{ backgroundColor: branding.primaryColor }}>Button</span>
                </div>
                <div className="p-4" style={{ backgroundColor: branding.backgroundColor, color: branding.textColor }}>
                  <h3 className="text-base font-bold mb-1">Heading</h3>
                  <p className="text-xs mb-2">Body text preview with brand colors.</p>
                  <div className="flex gap-1.5">
                    <span className="px-2 py-0.5 rounded text-xs text-white" style={{ backgroundColor: branding.primaryColor }}>Primary</span>
                    <span className="px-2 py-0.5 rounded text-xs text-white" style={{ backgroundColor: branding.secondaryColor }}>Secondary</span>
                    <span className="px-2 py-0.5 rounded text-xs text-white" style={{ backgroundColor: branding.accentColor }}>Accent</span>
                  </div>
                </div>
              </div>
            </div>
            {/* Dark mode preview */}
            <div>
              <span className="text-[11px] text-muted-foreground mb-1 block">Dark Mode</span>
              <div className="rounded-lg overflow-hidden border border-border">
                <div className="h-10 flex items-center px-4 gap-4" style={{ backgroundColor: branding.darkMode?.navBackground || branding.navBackground, color: branding.darkMode?.textColor || branding.navTextColor }}>
                  <span className="text-sm font-semibold">{branding.logoText || 'Brand'}</span>
                  <div className="flex-1" />
                  <span className="text-xs">Link</span>
                  <span className="text-xs px-2 py-0.5 rounded text-white" style={{ backgroundColor: branding.darkMode?.primaryColor || branding.primaryColor }}>Button</span>
                </div>
                <div className="p-4" style={{ backgroundColor: branding.darkMode?.backgroundColor || '#111827', color: branding.darkMode?.textColor || '#f3f4f6' }}>
                  <h3 className="text-base font-bold mb-1">Heading</h3>
                  <p className="text-xs mb-2">Body text preview with dark mode colors.</p>
                  <div className="flex gap-1.5">
                    <span className="px-2 py-0.5 rounded text-xs text-white" style={{ backgroundColor: branding.darkMode?.primaryColor || branding.primaryColor }}>Primary</span>
                    <span className="px-2 py-0.5 rounded text-xs text-white" style={{ backgroundColor: branding.darkMode?.secondaryColor || branding.secondaryColor }}>Secondary</span>
                    <span className="px-2 py-0.5 rounded text-xs text-white" style={{ backgroundColor: branding.darkMode?.accentColor || branding.accentColor }}>Accent</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* ── Typography ───────────────────────────── */}
      {activeTab === 'typography' && (
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
          <span className="material-icons text-base">text_fields</span>
          Typography
        </h2>
        <p className="text-sm text-muted-foreground mb-5">Set default fonts for headings and body, then fine-tune each element.</p>

        {/* Global font defaults */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          <div>
            <label className={labelClass}>Default Heading Font</label>
            <p className="text-[11px] text-muted-foreground mb-2">Applied to H1-H6 unless overridden below.</p>
            <GoogleFontPicker
              value={branding.headingFont}
              onChange={(font) => update({ headingFont: font })}
            />
          </div>
          <div>
            <label className={labelClass}>Default Body Font</label>
            <p className="text-[11px] text-muted-foreground mb-2">Applied to paragraphs, blockquotes, captions.</p>
            <GoogleFontPicker
              value={branding.bodyFont}
              onChange={(font) => update({ bodyFont: font })}
            />
          </div>
        </div>

        {/* Per-element typography */}
        {(['heading', 'body', 'ui'] as const).map(category => (
          <div key={category} className="mb-6">
            <h3 className="text-sm font-semibold text-foreground mb-3 capitalize flex items-center gap-2">
              <span className="material-icons text-sm">
                {category === 'heading' ? 'title' : category === 'body' ? 'notes' : 'smart_button'}
              </span>
              {category === 'heading' ? 'Headings' : category === 'body' ? 'Body Text' : 'UI Elements'}
            </h3>
            <div className="space-y-3">
              {Object.entries(ELEMENT_LABELS)
                .filter(([, info]) => info.category === category)
                .map(([el, info]) => {
                  const t = getTypo(el);
                  const font = resolveFont(el);
                  return (
                    <div key={el} className="rounded-lg border border-border p-4">
                      <div className="flex items-start gap-4">
                        {/* Preview */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">{info.label}</span>
                            <span className="text-[11px] text-muted-foreground">{info.desc}</span>
                          </div>
                          {font && (
                            <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@300;400;500;600;700;800&display=swap`} />
                          )}
                          <p
                            className="truncate"
                            style={{
                              fontFamily: font ? `"${font}", sans-serif` : undefined,
                              fontSize: t.size,
                              fontWeight: t.weight,
                              lineHeight: t.lineHeight,
                              letterSpacing: t.letterSpacing,
                            }}
                          >
                            The quick brown fox jumps over the lazy dog
                          </p>
                        </div>
                      </div>

                      {/* Controls */}
                      <div className="grid grid-cols-5 gap-3 mt-3 pt-3 border-t border-border/50">
                        <div>
                          <label className="block text-[11px] text-muted-foreground mb-1">Font Family</label>
                          <GoogleFontPicker
                            value={t.font || ''}
                            onChange={(font) => updateTypo(el, { font: font || undefined })}
                          />
                          {!t.font && font && (
                            <span className="text-[10px] text-muted-foreground mt-0.5 block">Inherited: {font}</span>
                          )}
                        </div>
                        <div>
                          <label className="block text-[11px] text-muted-foreground mb-1">Size</label>
                          <input
                            type="text"
                            value={t.size || ''}
                            onChange={(e) => updateTypo(el, { size: e.target.value })}
                            className={`${inputClass} text-xs`}
                            placeholder="1rem"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-muted-foreground mb-1">Weight</label>
                          <select
                            value={t.weight || '400'}
                            onChange={(e) => updateTypo(el, { weight: e.target.value })}
                            className={`${inputClass} text-xs`}
                          >
                            {WEIGHT_OPTIONS.map(w => (
                              <option key={w.value} value={w.value}>{w.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] text-muted-foreground mb-1">Line Height</label>
                          <input
                            type="text"
                            value={t.lineHeight || ''}
                            onChange={(e) => updateTypo(el, { lineHeight: e.target.value })}
                            className={`${inputClass} text-xs`}
                            placeholder="1.5"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-muted-foreground mb-1">Char Spacing</label>
                          <input
                            type="text"
                            value={t.letterSpacing || ''}
                            onChange={(e) => updateTypo(el, { letterSpacing: e.target.value })}
                            className={`${inputClass} text-xs`}
                            placeholder="-0.02em"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}
