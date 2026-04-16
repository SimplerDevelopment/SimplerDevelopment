'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import MediaPicker from '@/components/admin/MediaPicker';
import { GoogleFontPicker } from '@/components/blocks/visual/GoogleFontPicker';
import { ContrastMatrix } from '@/components/portal/ContrastMatrix';
import { BrandAuditPanel } from '@/components/portal/BrandAuditPanel';
import { PaletteFromImage } from '@/components/portal/branding/PaletteFromImage';

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

interface ButtonStyle {
  primaryBg?: string;
  primaryText?: string;
  primaryHoverBg?: string;
  secondaryBg?: string;
  secondaryText?: string;
  secondaryHoverBg?: string;
  borderRadius?: string;
  variant?: 'filled' | 'outline';
}

interface ProfileData {
  id: number;
  name: string;
  isDefault: boolean;
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
  borderRadius: string;
  linkColor: string;
  linkHoverColor: string;
  buttonStyle: ButtonStyle;
  faviconUrl: string;
  ogImageUrl: string;
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

const DEFAULTS: Omit<ProfileData, 'id' | 'name' | 'isDefault'> = {
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
  borderRadius: '8px',
  linkColor: '',
  linkHoverColor: '',
  buttonStyle: {},
  faviconUrl: '',
  ogImageUrl: '',
};

export default function BrandingProfileEditorPage() {
  const { profileId } = useParams<{ profileId: string }>();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab');
  const validTabs = ['logos', 'colors', 'typography', 'buttons', 'style', 'messaging'] as const;
  type TabId = typeof validTabs[number];
  const startTab: TabId = validTabs.includes(initialTab as TabId) ? (initialTab as TabId) : 'logos';

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>(startTab);
  const [aiDescription, setAiDescription] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiTargets, setAiTargets] = useState({ visual: true, messaging: true });

  // Messaging state
  const [messaging, setMessaging] = useState({
    companyName: '', tagline: '', missionStatement: '', visionStatement: '', valueProposition: '',
    toneOfVoice: '', brandPersonality: '', writingStyle: '',
    elevatorPitch: '', boilerplate: '', keyDifferentiators: [] as string[], targetAudience: '',
    industry: '', yearFounded: '', companySize: '', headquarters: '', websiteUrl: '',
    socialProof: '', keyClients: '', certifications: '', additionalContext: '',
    toneAxes: {} as { formal?: number; playful?: number; traditional?: number; authoritative?: number },
    voiceSamples: [] as Array<{ context: string; text: string }>,
  });
  const [newDifferentiator, setNewDifferentiator] = useState('');
  const [messagingDirty, setMessagingDirty] = useState(false);

  // Field-level AI rewrite modal
  const [rewriteModal, setRewriteModal] = useState<{ field: string; label: string } | null>(null);
  const [rewritePrompt, setRewritePrompt] = useState('');
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const [rewritePreview, setRewritePreview] = useState('');

  const openRewrite = (field: string, label: string) => {
    setRewriteModal({ field, label });
    setRewritePrompt('');
    setRewritePreview('');
  };

  const runRewrite = async () => {
    if (!rewriteModal || !rewritePrompt.trim()) return;
    setRewriteLoading(true);
    setRewritePreview('');
    try {
      const companyContext = [messaging.companyName, messaging.tagline, messaging.industry].filter(Boolean).join(' - ');
      const res = await fetch('/api/portal/branding/rewrite-field', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fieldName: rewriteModal.field,
          fieldLabel: rewriteModal.label,
          currentValue: (messaging as Record<string, unknown>)[rewriteModal.field] || '',
          prompt: rewritePrompt.trim(),
          companyContext,
        }),
      });
      const data = await res.json();
      if (data.success) setRewritePreview(data.data);
    } catch { /* ignore */ }
    setRewriteLoading(false);
  };

  const acceptRewrite = () => {
    if (!rewriteModal || !rewritePreview) return;
    updateMessaging(rewriteModal.field, rewritePreview);
    setRewriteModal(null);
  };

  useEffect(() => {
    Promise.all([
      fetch(`/api/portal/branding/profiles/${profileId}`).then(r => r.json()),
      fetch(`/api/portal/branding/messaging?profileId=${profileId}`).then(r => r.json()),
    ])
      .then(([profileRes, messagingRes]) => {
        if (profileRes.success) setProfile({ ...DEFAULTS, ...profileRes.data });
        if (messagingRes.success && messagingRes.data) {
          setMessaging(prev => ({
            ...prev,
            ...messagingRes.data,
            keyDifferentiators: messagingRes.data.keyDifferentiators ?? [],
            toneAxes: messagingRes.data.toneAxes ?? {},
            voiceSamples: messagingRes.data.voiceSamples ?? [],
          }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [profileId]);

  const update = (updates: Partial<ProfileData>) => {
    setProfile(prev => prev ? { ...prev, ...updates } : prev);
    setDirty(true);
  };

  const updateDark = (updates: Partial<DarkModeOverrides>) => {
    if (!profile) return;
    update({ darkMode: { ...(profile.darkMode || {}), ...updates } });
  };

  const updateButtonStyle = (updates: Partial<ButtonStyle>) => {
    if (!profile) return;
    update({ buttonStyle: { ...(profile.buttonStyle || {}), ...updates } });
  };

  const generateWithAI = async () => {
    if (!aiDescription.trim() || !profile) return;
    if (!aiTargets.visual && !aiTargets.messaging) return;
    setAiGenerating(true);
    try {
      const fetches: Promise<Response>[] = [];
      if (aiTargets.visual) {
        fetches.push(fetch('/api/portal/branding/generate-theme', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: aiDescription.trim() }),
        }));
      }
      if (aiTargets.messaging) {
        fetches.push(fetch('/api/portal/branding/generate-messaging', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: aiDescription.trim() }),
        }));
      }
      const results = await Promise.all(fetches);
      let idx = 0;
      if (aiTargets.visual) {
        const data = await results[idx++].json();
        if (data.success) {
          const t = data.data;
          update({
            primaryColor: t.primaryColor || profile.primaryColor,
            secondaryColor: t.secondaryColor || profile.secondaryColor,
            accentColor: t.accentColor || profile.accentColor,
            backgroundColor: t.backgroundColor || profile.backgroundColor,
            textColor: t.textColor || profile.textColor,
            navBackground: t.navBackground || profile.navBackground,
            navTextColor: t.navTextColor || profile.navTextColor,
            headingFont: t.headingFont || profile.headingFont,
            bodyFont: t.bodyFont || profile.bodyFont,
            borderRadius: t.borderRadius || profile.borderRadius,
            linkColor: t.linkColor || profile.linkColor,
            linkHoverColor: t.linkHoverColor || profile.linkHoverColor,
            buttonStyle: t.buttonStyle || profile.buttonStyle,
            darkMode: t.darkMode || profile.darkMode,
          });
        }
      }
      if (aiTargets.messaging) {
        const data = await results[idx++].json();
        if (data.success) {
          const m = data.data;
          setMessaging(prev => ({
            companyName: m.companyName || prev.companyName,
            tagline: m.tagline || prev.tagline,
            missionStatement: m.missionStatement || prev.missionStatement,
            visionStatement: m.visionStatement || prev.visionStatement,
            valueProposition: m.valueProposition || prev.valueProposition,
            toneOfVoice: m.toneOfVoice || prev.toneOfVoice,
            brandPersonality: m.brandPersonality || prev.brandPersonality,
            writingStyle: m.writingStyle || prev.writingStyle,
            elevatorPitch: m.elevatorPitch || prev.elevatorPitch,
            boilerplate: m.boilerplate || prev.boilerplate,
            keyDifferentiators: m.keyDifferentiators?.length ? m.keyDifferentiators : prev.keyDifferentiators,
            targetAudience: m.targetAudience || prev.targetAudience,
            industry: m.industry || prev.industry,
            yearFounded: m.yearFounded || prev.yearFounded,
            companySize: m.companySize || prev.companySize,
            headquarters: m.headquarters || prev.headquarters,
            websiteUrl: m.websiteUrl || prev.websiteUrl,
            socialProof: m.socialProof || prev.socialProof,
            keyClients: m.keyClients || prev.keyClients,
            certifications: m.certifications || prev.certifications,
            additionalContext: m.additionalContext || prev.additionalContext,
          }));
          setMessagingDirty(true);
        }
      }
      setShowAiPanel(false);
    } catch { /* ignore */ }
    finally { setAiGenerating(false); }
  };

  const save = useCallback(async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const saves = [
        fetch(`/api/portal/branding/profiles/${profileId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(profile),
        }),
      ];
      if (messagingDirty) {
        saves.push(
          fetch('/api/portal/branding/messaging', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...messaging, brandingProfileId: parseInt(profileId, 10) }),
          }),
        );
      }
      await Promise.all(saves);
      setDirty(false);
      setMessagingDirty(false);
    } finally {
      setSaving(false);
    }
  }, [profileId, profile, messaging, messagingDirty]);

  const getTypo = (el: string): ElementTypography => ({
    ...DEFAULT_TYPOGRAPHY[el],
    ...(profile?.typography?.[el] || {}),
  });

  const updateTypo = (el: string, updates: Partial<ElementTypography>) => {
    if (!profile) return;
    const current = getTypo(el);
    update({
      typography: {
        ...(profile.typography || {}),
        [el]: { ...current, ...updates },
      },
    });
  };

  const resolveFont = (el: string): string => {
    if (!profile) return '';
    const t = getTypo(el);
    if (t.font) return t.font;
    const info = ELEMENT_LABELS[el];
    if (info?.category === 'heading') return profile.headingFont || '';
    return profile.bodyFont || '';
  };

  const updateMessaging = (field: string, value: string) => {
    setMessaging(prev => ({ ...prev, [field]: value }));
    setMessagingDirty(true);
  };

  const addDifferentiator = () => {
    const val = newDifferentiator.trim();
    if (!val) return;
    setMessaging(prev => ({ ...prev, keyDifferentiators: [...prev.keyDifferentiators, val] }));
    setNewDifferentiator('');
    setMessagingDirty(true);
  };

  const removeDifferentiator = (index: number) => {
    setMessaging(prev => ({
      ...prev,
      keyDifferentiators: prev.keyDifferentiators.filter((_, i) => i !== index),
    }));
    setMessagingDirty(true);
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-icons animate-spin text-muted-foreground">refresh</span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-4xl mx-auto text-center py-16">
        <p className="text-muted-foreground">Profile not found.</p>
        <Link href="/portal/branding" className="text-primary text-sm mt-2 inline-block">Back to Branding</Link>
      </div>
    );
  }

  const inputClass = 'w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none';
  const labelClass = 'block text-xs font-medium text-muted-foreground mb-1.5';

  const tabs = [
    { id: 'logos' as const, label: 'Logos', icon: 'image' },
    { id: 'colors' as const, label: 'Colors', icon: 'palette' },
    { id: 'typography' as const, label: 'Typography', icon: 'text_fields' },
    { id: 'buttons' as const, label: 'Buttons', icon: 'smart_button' },
    { id: 'style' as const, label: 'Style', icon: 'tune' },
    { id: 'messaging' as const, label: 'Messaging', icon: 'chat' },
  ];

  return (
    <div className="max-w-4xl mx-auto py-6 px-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/portal/branding"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <span className="material-icons text-base">arrow_back</span>
            Back to Branding
          </Link>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={profile.name}
              onChange={(e) => update({ name: e.target.value })}
              className="text-2xl font-bold text-foreground bg-transparent border-none outline-none focus:ring-0"
              placeholder="Profile name"
            />
            <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={profile.isDefault}
                onChange={(e) => update({ isDefault: e.target.checked })}
                className="rounded border-border"
              />
              <span className="text-xs text-muted-foreground">Default</span>
            </label>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Set your brand identity. These styles apply as defaults across assigned sites.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/portal/branding/profiles/${profileId}/guide`}
            className="px-4 py-2 border border-border bg-background text-foreground rounded-lg text-sm font-medium hover:bg-accent transition-colors flex items-center gap-2"
          >
            <span className="material-icons text-base">menu_book</span>
            Brand Guide
          </Link>
          <button
            onClick={save}
            disabled={(!dirty && !messagingDirty) || saving}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <span className="material-icons text-base">{saving ? 'refresh' : 'save'}</span>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* AI Generator */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <button
          onClick={() => setShowAiPanel(!showAiPanel)}
          className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-foreground hover:bg-accent/50 transition-colors"
        >
          <span className="material-icons text-base text-primary">auto_awesome</span>
          Generate with AI
          <span className="material-icons text-sm text-muted-foreground ml-auto transition-transform" style={{ transform: showAiPanel ? 'rotate(180deg)' : undefined }}>
            expand_more
          </span>
        </button>
        {showAiPanel && (
          <div className="px-4 pb-4 space-y-3 border-t border-border">
            <p className="text-xs text-muted-foreground pt-3">
              Describe your brand, company, audience, and personality. AI will generate content for the selected sections.
            </p>
            <textarea
              value={aiDescription}
              onChange={(e) => setAiDescription(e.target.value)}
              placeholder={'e.g. "We\'re a boutique web development agency building custom SaaS platforms for small businesses. Modern, approachable, and professional. Founded in 2020, based in Philadelphia."'}
              className={`${inputClass} h-24 resize-none`}
              disabled={aiGenerating}
            />
            <div className="flex items-center gap-4">
              <span className="text-xs font-medium text-muted-foreground">Apply to:</span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={aiTargets.visual}
                  onChange={(e) => setAiTargets(prev => ({ ...prev, visual: e.target.checked }))}
                  className="rounded border-border text-primary focus:ring-primary"
                  disabled={aiGenerating}
                />
                <span className="text-sm text-foreground">Visual Identity</span>
                <span className="text-[10px] text-muted-foreground">(colors, fonts, buttons, style)</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={aiTargets.messaging}
                  onChange={(e) => setAiTargets(prev => ({ ...prev, messaging: e.target.checked }))}
                  className="rounded border-border text-primary focus:ring-primary"
                  disabled={aiGenerating}
                />
                <span className="text-sm text-foreground">Messaging</span>
                <span className="text-[10px] text-muted-foreground">(company info, voice, pitch)</span>
              </label>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={generateWithAI}
                disabled={aiGenerating || !aiDescription.trim() || (!aiTargets.visual && !aiTargets.messaging)}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {aiGenerating ? (
                  <><span className="material-icons animate-spin text-base">autorenew</span>Generating...</>
                ) : (
                  <><span className="material-icons text-base">auto_awesome</span>Generate</>
                )}
              </button>
              {!aiTargets.visual && !aiTargets.messaging && (
                <span className="text-xs text-destructive">Select at least one section</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Brand audit — visible above tabs so issues are always surfaced */}
      <div className="border border-border rounded-lg bg-background p-4">
        <BrandAuditPanel profileId={parseInt(profileId, 10)} />
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

      {/* Logos */}
      {activeTab === 'logos' && (
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
          <span className="material-icons text-base">image</span>
          Logos
        </h2>
        <p className="text-sm text-muted-foreground mb-5">Upload different logo formats for various use cases across your site.</p>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className={labelClass}>Square Logo</label>
            <p className="text-xs text-muted-foreground mb-2">Used for favicons, social media, and small displays.</p>
            <MediaPicker
              value={profile.logoSquareUrl}
              onChange={(url) => update({ logoSquareUrl: url })}
              label="Square Logo"
              mimeTypeFilter="image"
            />
          </div>

          <div>
            <label className={labelClass}>Rectangle Logo</label>
            <p className="text-xs text-muted-foreground mb-2">Used in the navigation bar and headers.</p>
            <MediaPicker
              value={profile.logoRectUrl}
              onChange={(url) => update({ logoRectUrl: url })}
              label="Rectangle Logo"
              mimeTypeFilter="image"
            />
          </div>

          <div>
            <label className={labelClass}>Logo Icon</label>
            <p className="text-xs text-muted-foreground mb-2">Small icon that appears alongside your brand name.</p>
            <MediaPicker
              value={profile.logoIconUrl}
              onChange={(url) => update({ logoIconUrl: url })}
              label="Logo Icon"
              mimeTypeFilter="image"
            />
          </div>

          <div>
            <label className={labelClass}>Brand Name / Text Logo</label>
            <p className="text-xs text-muted-foreground mb-2">Text displayed when no image logo is available.</p>
            <input
              type="text"
              value={profile.logoText ?? ''}
              onChange={(e) => update({ logoText: e.target.value })}
              className={inputClass}
              placeholder="Your Brand Name"
            />
            {profile.logoText && (
              <div className="mt-3 p-4 rounded-lg bg-muted/30 border border-border">
                <span className="text-xl font-bold" style={{ fontFamily: profile.headingFont ? `"${profile.headingFont}", sans-serif` : undefined }}>
                  {profile.logoText}
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
                value={profile.darkMode?.logoSquareUrl || ''}
                onChange={(url) => updateDark({ logoSquareUrl: url })}
                label="Dark Square Logo"
                mimeTypeFilter="image"
              />
            </div>
            <div>
              <label className={labelClass}>Dark Rectangle Logo</label>
              <MediaPicker
                value={profile.darkMode?.logoRectUrl || ''}
                onChange={(url) => updateDark({ logoRectUrl: url })}
                label="Dark Rectangle Logo"
                mimeTypeFilter="image"
              />
            </div>
            <div>
              <label className={labelClass}>Dark Logo Icon</label>
              <MediaPicker
                value={profile.darkMode?.logoIconUrl || ''}
                onChange={(url) => updateDark({ logoIconUrl: url })}
                label="Dark Logo Icon"
                mimeTypeFilter="image"
              />
            </div>
            <div>
              <label className={labelClass}>Dark Primary Logo (legacy)</label>
              <MediaPicker
                value={profile.darkMode?.logoUrl || ''}
                onChange={(url) => updateDark({ logoUrl: url })}
                label="Dark Primary Logo"
                mimeTypeFilter="image"
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
                value={profile.logoUrl}
                onChange={(url) => update({ logoUrl: url })}
                label="Primary Logo"
                mimeTypeFilter="image"
              />
            </div>
            <div>
              <label className={labelClass}>Logo Alt Text</label>
              <input
                type="text"
                value={profile.logoAlt ?? ''}
                onChange={(e) => update({ logoAlt: e.target.value })}
                className={inputClass}
                placeholder="Company name"
              />
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Colors */}
      {activeTab === 'colors' && (
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
          <span className="material-icons text-base">palette</span>
          Colors
        </h2>
        <p className="text-sm text-muted-foreground mb-5">Define your brand color palette. These are used as defaults in blocks and navigation.</p>

        <div className="mb-5">
          <PaletteFromImage
            onApply={(roles) => update(roles)}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          {([
            { key: 'primaryColor', label: 'Primary', desc: 'Buttons, links, accents' },
            { key: 'secondaryColor', label: 'Secondary', desc: 'Supporting elements' },
            { key: 'accentColor', label: 'Accent', desc: 'Highlights, badges' },
            { key: 'backgroundColor', label: 'Background', desc: 'Page background' },
            { key: 'textColor', label: 'Text', desc: 'Body text color' },
            { key: 'navBackground', label: 'Nav Background', desc: 'Navigation bar' },
            { key: 'navTextColor', label: 'Nav Text', desc: 'Navigation text' },
          ] as const).map(({ key, label, desc }) => (
            <div key={key}>
              <label className={labelClass}>{label}</label>
              <p className="text-[11px] text-muted-foreground mb-2">{desc}</p>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={profile[key]}
                  onChange={(e) => update({ [key]: e.target.value })}
                  className="h-9 w-9 cursor-pointer rounded border border-border shrink-0"
                />
                <input
                  type="text"
                  value={profile[key]}
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
              { key: 'navTextColor' as const, label: 'Nav Text' },
            ]).map(({ key, label }) => (
              <div key={key}>
                <label className={labelClass}>{label}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={profile.darkMode?.[key] || profile[key]}
                    onChange={(e) => updateDark({ [key]: e.target.value })}
                    className="h-9 w-9 cursor-pointer rounded border border-border shrink-0"
                  />
                  <input
                    type="text"
                    value={profile.darkMode?.[key] || ''}
                    onChange={(e) => updateDark({ [key]: e.target.value })}
                    className={`${inputClass} font-mono`}
                    placeholder={profile[key]}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Color previews */}
        <div className="mt-6 pt-6 border-t border-border">
          <label className={labelClass}>Preview</label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-[11px] text-muted-foreground mb-1 block">Light Mode</span>
              <div className="rounded-lg overflow-hidden border border-border">
                <div className="h-10 flex items-center px-4 gap-4" style={{ backgroundColor: profile.navBackground, color: profile.navTextColor }}>
                  <span className="text-sm font-semibold">{profile.logoText || 'Brand'}</span>
                  <div className="flex-1" />
                  <span className="text-xs">Link</span>
                  <span className="text-xs px-2 py-0.5 rounded text-white" style={{ backgroundColor: profile.primaryColor }}>Button</span>
                </div>
                <div className="p-4" style={{ backgroundColor: profile.backgroundColor, color: profile.textColor }}>
                  <h3 className="text-base font-bold mb-1">Heading</h3>
                  <p className="text-xs mb-2">Body text preview with brand colors.</p>
                  <div className="flex gap-1.5">
                    <span className="px-2 py-0.5 rounded text-xs text-white" style={{ backgroundColor: profile.primaryColor }}>Primary</span>
                    <span className="px-2 py-0.5 rounded text-xs text-white" style={{ backgroundColor: profile.secondaryColor }}>Secondary</span>
                    <span className="px-2 py-0.5 rounded text-xs text-white" style={{ backgroundColor: profile.accentColor }}>Accent</span>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <span className="text-[11px] text-muted-foreground mb-1 block">Dark Mode</span>
              <div className="rounded-lg overflow-hidden border border-border">
                <div className="h-10 flex items-center px-4 gap-4" style={{ backgroundColor: profile.darkMode?.navBackground || profile.navBackground, color: profile.darkMode?.textColor || profile.navTextColor }}>
                  <span className="text-sm font-semibold">{profile.logoText || 'Brand'}</span>
                  <div className="flex-1" />
                  <span className="text-xs">Link</span>
                  <span className="text-xs px-2 py-0.5 rounded text-white" style={{ backgroundColor: profile.darkMode?.primaryColor || profile.primaryColor }}>Button</span>
                </div>
                <div className="p-4" style={{ backgroundColor: profile.darkMode?.backgroundColor || '#111827', color: profile.darkMode?.textColor || '#f3f4f6' }}>
                  <h3 className="text-base font-bold mb-1">Heading</h3>
                  <p className="text-xs mb-2">Body text preview with dark mode colors.</p>
                  <div className="flex gap-1.5">
                    <span className="px-2 py-0.5 rounded text-xs text-white" style={{ backgroundColor: profile.darkMode?.primaryColor || profile.primaryColor }}>Primary</span>
                    <span className="px-2 py-0.5 rounded text-xs text-white" style={{ backgroundColor: profile.darkMode?.secondaryColor || profile.secondaryColor }}>Secondary</span>
                    <span className="px-2 py-0.5 rounded text-xs text-white" style={{ backgroundColor: profile.darkMode?.accentColor || profile.accentColor }}>Accent</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Link Colors */}
        <div className="mt-6 pt-6 border-t border-border">
          <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
            <span className="material-icons text-base">link</span>
            Link Colors
          </h3>
          <p className="text-xs text-muted-foreground mb-4">Colors for inline text links. Separate from primary color for accessibility.</p>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className={labelClass}>Link Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={profile.linkColor || profile.primaryColor}
                  onChange={(e) => update({ linkColor: e.target.value })}
                  className="h-9 w-9 cursor-pointer rounded border border-border shrink-0"
                />
                <input
                  type="text"
                  value={profile.linkColor ?? ''}
                  onChange={(e) => update({ linkColor: e.target.value })}
                  className={`${inputClass} font-mono`}
                  placeholder={profile.primaryColor}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Link Hover Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={profile.linkHoverColor || profile.primaryColor}
                  onChange={(e) => update({ linkHoverColor: e.target.value })}
                  className="h-9 w-9 cursor-pointer rounded border border-border shrink-0"
                />
                <input
                  type="text"
                  value={profile.linkHoverColor ?? ''}
                  onChange={(e) => update({ linkHoverColor: e.target.value })}
                  className={`${inputClass} font-mono`}
                  placeholder={profile.primaryColor}
                />
              </div>
            </div>
          </div>
          <div className="mt-4 p-4 rounded-lg bg-muted/30 border border-border text-sm">
            <span style={{ color: profile.linkColor || profile.primaryColor, textDecoration: 'underline', cursor: 'pointer' }}>
              This is what a link looks like
            </span>
            {' '}within body text.
          </div>
          <div className="mt-6">
            <ContrastMatrix branding={profile} />
          </div>
        </div>
      </div>
      )}

      {/* Typography */}
      {activeTab === 'typography' && (
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
          <span className="material-icons text-base">text_fields</span>
          Typography
        </h2>
        <p className="text-sm text-muted-foreground mb-5">Set default fonts for headings and body, then fine-tune each element.</p>

        <div className="grid grid-cols-2 gap-6 mb-8">
          <div>
            <label className={labelClass}>Default Heading Font</label>
            <p className="text-[11px] text-muted-foreground mb-2">Applied to H1-H6 unless overridden below.</p>
            <GoogleFontPicker
              value={profile.headingFont}
              onChange={(font) => update({ headingFont: font })}
            />
          </div>
          <div>
            <label className={labelClass}>Default Body Font</label>
            <p className="text-[11px] text-muted-foreground mb-2">Applied to paragraphs, blockquotes, captions.</p>
            <GoogleFontPicker
              value={profile.bodyFont}
              onChange={(font) => update({ bodyFont: font })}
            />
          </div>
        </div>

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

      {/* Buttons */}
      {activeTab === 'buttons' && (
      <div className="space-y-8">
        {/* Variant & Border Radius */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
            <span className="material-icons text-base">smart_button</span>
            Button Style
          </h2>
          <p className="text-sm text-muted-foreground mb-4">Default styling for buttons and CTAs across blocks.</p>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <label className={labelClass}>Default Variant</label>
              <div className="flex gap-2">
                {(['filled', 'outline'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => updateButtonStyle({ variant: v })}
                    className={`px-4 py-2 text-sm font-medium border transition-colors capitalize ${
                      (profile.buttonStyle?.variant || 'filled') === v
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground hover:border-foreground'
                    }`}
                    style={{ borderRadius: profile.buttonStyle?.borderRadius || '8px' }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelClass}>Button Border Radius</label>
              <input
                type="text"
                value={profile.buttonStyle?.borderRadius || ''}
                onChange={(e) => updateButtonStyle({ borderRadius: e.target.value })}
                className={`${inputClass} max-w-[200px]`}
                placeholder="8px"
              />
              <p className="text-[11px] text-muted-foreground mt-1">Independent from site border radius.</p>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { value: '0px', label: 'Sharp' },
              { value: '4px', label: 'Subtle' },
              { value: '8px', label: 'Rounded' },
              { value: '9999px', label: 'Pill' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => updateButtonStyle({ borderRadius: opt.value })}
                className={`p-3 border text-sm font-medium transition-colors ${
                  (profile.buttonStyle?.borderRadius || '') === opt.value
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border text-muted-foreground hover:border-foreground'
                }`}
                style={{ borderRadius: '8px' }}
              >
                <div
                  className="w-full h-8 mb-2"
                  style={{
                    borderRadius: opt.value,
                    backgroundColor: profile.buttonStyle?.primaryBg || profile.primaryColor,
                  }}
                />
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Button Colors */}
        <div className="grid grid-cols-2 gap-6">
          {/* Primary Button */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Primary Button</h3>
            <div>
              <label className={labelClass}>Background</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={profile.buttonStyle?.primaryBg || profile.primaryColor}
                  onChange={(e) => updateButtonStyle({ primaryBg: e.target.value })}
                  className="h-9 w-9 cursor-pointer rounded border border-border shrink-0"
                />
                <input
                  type="text"
                  value={profile.buttonStyle?.primaryBg || ''}
                  onChange={(e) => updateButtonStyle({ primaryBg: e.target.value })}
                  className={`${inputClass} font-mono`}
                  placeholder={profile.primaryColor}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Text Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={profile.buttonStyle?.primaryText || '#ffffff'}
                  onChange={(e) => updateButtonStyle({ primaryText: e.target.value })}
                  className="h-9 w-9 cursor-pointer rounded border border-border shrink-0"
                />
                <input
                  type="text"
                  value={profile.buttonStyle?.primaryText || ''}
                  onChange={(e) => updateButtonStyle({ primaryText: e.target.value })}
                  className={`${inputClass} font-mono`}
                  placeholder="#ffffff"
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Hover Background</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={profile.buttonStyle?.primaryHoverBg || profile.primaryColor}
                  onChange={(e) => updateButtonStyle({ primaryHoverBg: e.target.value })}
                  className="h-9 w-9 cursor-pointer rounded border border-border shrink-0"
                />
                <input
                  type="text"
                  value={profile.buttonStyle?.primaryHoverBg || ''}
                  onChange={(e) => updateButtonStyle({ primaryHoverBg: e.target.value })}
                  className={`${inputClass} font-mono`}
                  placeholder={profile.primaryColor}
                />
              </div>
            </div>
          </div>

          {/* Secondary Button */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Secondary Button</h3>
            <div>
              <label className={labelClass}>Background</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={profile.buttonStyle?.secondaryBg || profile.secondaryColor}
                  onChange={(e) => updateButtonStyle({ secondaryBg: e.target.value })}
                  className="h-9 w-9 cursor-pointer rounded border border-border shrink-0"
                />
                <input
                  type="text"
                  value={profile.buttonStyle?.secondaryBg || ''}
                  onChange={(e) => updateButtonStyle({ secondaryBg: e.target.value })}
                  className={`${inputClass} font-mono`}
                  placeholder={profile.secondaryColor}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Text Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={profile.buttonStyle?.secondaryText || '#ffffff'}
                  onChange={(e) => updateButtonStyle({ secondaryText: e.target.value })}
                  className="h-9 w-9 cursor-pointer rounded border border-border shrink-0"
                />
                <input
                  type="text"
                  value={profile.buttonStyle?.secondaryText || ''}
                  onChange={(e) => updateButtonStyle({ secondaryText: e.target.value })}
                  className={`${inputClass} font-mono`}
                  placeholder="#ffffff"
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Hover Background</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={profile.buttonStyle?.secondaryHoverBg || profile.secondaryColor}
                  onChange={(e) => updateButtonStyle({ secondaryHoverBg: e.target.value })}
                  className="h-9 w-9 cursor-pointer rounded border border-border shrink-0"
                />
                <input
                  type="text"
                  value={profile.buttonStyle?.secondaryHoverBg || ''}
                  onChange={(e) => updateButtonStyle({ secondaryHoverBg: e.target.value })}
                  className={`${inputClass} font-mono`}
                  placeholder={profile.secondaryColor}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Button Previews */}
        <div>
          <label className={labelClass}>Preview</label>
          <div className="p-6 rounded-lg bg-muted/30 border border-border flex flex-wrap gap-4 items-center">
            {/* Primary Filled */}
            <button
              className="px-5 py-2.5 text-sm font-medium transition-colors"
              style={{
                backgroundColor: (profile.buttonStyle?.variant || 'filled') === 'filled'
                  ? (profile.buttonStyle?.primaryBg || profile.primaryColor)
                  : 'transparent',
                color: (profile.buttonStyle?.variant || 'filled') === 'filled'
                  ? (profile.buttonStyle?.primaryText || '#ffffff')
                  : (profile.buttonStyle?.primaryBg || profile.primaryColor),
                borderRadius: profile.buttonStyle?.borderRadius || '8px',
                border: (profile.buttonStyle?.variant || 'filled') === 'outline'
                  ? `2px solid ${profile.buttonStyle?.primaryBg || profile.primaryColor}`
                  : '2px solid transparent',
              }}
            >
              Primary Button
            </button>
            {/* Secondary */}
            <button
              className="px-5 py-2.5 text-sm font-medium transition-colors"
              style={{
                backgroundColor: (profile.buttonStyle?.variant || 'filled') === 'filled'
                  ? (profile.buttonStyle?.secondaryBg || profile.secondaryColor)
                  : 'transparent',
                color: (profile.buttonStyle?.variant || 'filled') === 'filled'
                  ? (profile.buttonStyle?.secondaryText || '#ffffff')
                  : (profile.buttonStyle?.secondaryBg || profile.secondaryColor),
                borderRadius: profile.buttonStyle?.borderRadius || '8px',
                border: (profile.buttonStyle?.variant || 'filled') === 'outline'
                  ? `2px solid ${profile.buttonStyle?.secondaryBg || profile.secondaryColor}`
                  : '2px solid transparent',
              }}
            >
              Secondary Button
            </button>
            {/* Show opposite variant preview too */}
            <span className="text-xs text-muted-foreground mx-2">|</span>
            <span className="text-[11px] text-muted-foreground">
              {(profile.buttonStyle?.variant || 'filled') === 'filled' ? 'Outline' : 'Filled'} variant:
            </span>
            <button
              className="px-5 py-2.5 text-sm font-medium transition-colors"
              style={{
                backgroundColor: (profile.buttonStyle?.variant || 'filled') !== 'filled'
                  ? (profile.buttonStyle?.primaryBg || profile.primaryColor)
                  : 'transparent',
                color: (profile.buttonStyle?.variant || 'filled') !== 'filled'
                  ? (profile.buttonStyle?.primaryText || '#ffffff')
                  : (profile.buttonStyle?.primaryBg || profile.primaryColor),
                borderRadius: profile.buttonStyle?.borderRadius || '8px',
                border: (profile.buttonStyle?.variant || 'filled') === 'filled'
                  ? `2px solid ${profile.buttonStyle?.primaryBg || profile.primaryColor}`
                  : '2px solid transparent',
              }}
            >
              Primary Button
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Style */}
      {activeTab === 'style' && (
      <div className="space-y-8">
        {/* Border Radius */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
            <span className="material-icons text-base">rounded_corner</span>
            Border Radius
          </h2>
          <p className="text-sm text-muted-foreground mb-4">Global shape language applied to cards, inputs, and UI elements. Button radius is configured separately.</p>
          <div className="grid grid-cols-4 gap-3">
            {[
              { value: '0px', label: 'Sharp' },
              { value: '4px', label: 'Subtle' },
              { value: '8px', label: 'Rounded' },
              { value: '9999px', label: 'Pill' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => update({ borderRadius: opt.value })}
                className={`p-3 border text-sm font-medium transition-colors ${
                  profile.borderRadius === opt.value
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border text-muted-foreground hover:border-foreground'
                }`}
                style={{ borderRadius: opt.value }}
              >
                <div
                  className="w-full h-8 bg-primary/20 mb-2"
                  style={{ borderRadius: opt.value }}
                />
                {opt.label}
              </button>
            ))}
          </div>
          <div className="mt-3">
            <label className={labelClass}>Custom Value</label>
            <input
              type="text"
              value={profile.borderRadius ?? ''}
              onChange={(e) => update({ borderRadius: e.target.value })}
              className={`${inputClass} max-w-[200px]`}
              placeholder="8px"
            />
          </div>
        </div>

        {/* Favicon */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
            <span className="material-icons text-base">tab</span>
            Favicon
          </h2>
          <p className="text-sm text-muted-foreground mb-4">The small icon shown in browser tabs. Recommended: 32x32 or 48x48 PNG.</p>
          <div className="max-w-sm">
            <MediaPicker
              value={profile.faviconUrl}
              onChange={(url) => update({ faviconUrl: url })}
              label="Favicon"
              mimeTypeFilter="image"
            />
          </div>
        </div>

        {/* OG / Social Image */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
            <span className="material-icons text-base">share</span>
            Social / OG Image
          </h2>
          <p className="text-sm text-muted-foreground mb-4">Default image shown when pages are shared on social media. Recommended: 1200x630.</p>
          <div className="max-w-sm">
            <MediaPicker
              value={profile.ogImageUrl}
              onChange={(url) => update({ ogImageUrl: url })}
              label="OG Image"
              mimeTypeFilter="image"
            />
          </div>
        </div>
      </div>
      )}

      {/* Messaging */}
      {activeTab === 'messaging' && (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
            <span className="material-icons text-base">chat</span>
            Messaging
          </h2>
          <p className="text-sm text-muted-foreground">Company messaging used in proposals, pitch decks, and AI-generated content for this brand profile.</p>
        </div>

        {/* Company Identity */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="material-icons text-base text-primary">business</span>
            Company Identity
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Company Name</label>
              <input type="text" value={messaging.companyName} onChange={(e) => updateMessaging('companyName', e.target.value)} placeholder="Acme Corp" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Tagline</label>
              <input type="text" value={messaging.tagline} onChange={(e) => updateMessaging('tagline', e.target.value)} placeholder="Building the future, today" className={inputClass} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1"><label className={`${labelClass} mb-0`}>Mission Statement</label><button type="button" onClick={() => openRewrite('missionStatement', 'Mission Statement')} className="p-0.5 rounded text-muted-foreground hover:text-primary transition-colors" title="Rewrite with AI"><span className="material-icons text-sm">auto_awesome</span></button></div>
            <textarea value={messaging.missionStatement} onChange={(e) => updateMessaging('missionStatement', e.target.value)} placeholder="What is your company's mission?" className={`${inputClass} min-h-[80px] resize-y`} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1"><label className={`${labelClass} mb-0`}>Vision Statement</label><button type="button" onClick={() => openRewrite('visionStatement', 'Vision Statement')} className="p-0.5 rounded text-muted-foreground hover:text-primary transition-colors" title="Rewrite with AI"><span className="material-icons text-sm">auto_awesome</span></button></div>
            <textarea value={messaging.visionStatement} onChange={(e) => updateMessaging('visionStatement', e.target.value)} placeholder="What is your long-term vision?" className={`${inputClass} min-h-[80px] resize-y`} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1"><label className={`${labelClass} mb-0`}>Value Proposition</label><button type="button" onClick={() => openRewrite('valueProposition', 'Value Proposition')} className="p-0.5 rounded text-muted-foreground hover:text-primary transition-colors" title="Rewrite with AI"><span className="material-icons text-sm">auto_awesome</span></button></div>
            <textarea value={messaging.valueProposition} onChange={(e) => updateMessaging('valueProposition', e.target.value)} placeholder="What unique value do you provide to customers?" className={`${inputClass} min-h-[80px] resize-y`} />
          </div>
        </div>

        {/* Brand Voice */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="material-icons text-base text-primary">record_voice_over</span>
            Brand Voice
          </h3>
          <div>
            <label className={labelClass}>Tone of Voice</label>
            <input type="text" value={messaging.toneOfVoice} onChange={(e) => updateMessaging('toneOfVoice', e.target.value)} placeholder="e.g. Professional, Approachable, Innovative" className={inputClass} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1"><label className={`${labelClass} mb-0`}>Brand Personality</label><button type="button" onClick={() => openRewrite('brandPersonality', 'Brand Personality')} className="p-0.5 rounded text-muted-foreground hover:text-primary transition-colors" title="Rewrite with AI"><span className="material-icons text-sm">auto_awesome</span></button></div>
            <textarea value={messaging.brandPersonality} onChange={(e) => updateMessaging('brandPersonality', e.target.value)} placeholder="Describe how your brand should come across in communications" className={`${inputClass} min-h-[80px] resize-y`} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1"><label className={`${labelClass} mb-0`}>Writing Style Guidelines</label><button type="button" onClick={() => openRewrite('writingStyle', 'Writing Style Guidelines')} className="p-0.5 rounded text-muted-foreground hover:text-primary transition-colors" title="Rewrite with AI"><span className="material-icons text-sm">auto_awesome</span></button></div>
            <textarea value={messaging.writingStyle} onChange={(e) => updateMessaging('writingStyle', e.target.value)} placeholder="Preferred language, formatting, and communication style" className={`${inputClass} min-h-[80px] resize-y`} />
          </div>

          {/* Tone Axes — structured signal that AI can reason about */}
          <div className="pt-2 border-t border-border">
            <div className="flex items-center justify-between mb-3">
              <label className={`${labelClass} mb-0`}>Tone Axes</label>
              <span className="text-[10px] text-muted-foreground">Drag toward one side — feeds AI copy generation</span>
            </div>
            <div className="space-y-3">
              {[
                { key: 'formal' as const, low: 'Casual', high: 'Formal' },
                { key: 'playful' as const, low: 'Serious', high: 'Playful' },
                { key: 'traditional' as const, low: 'Innovative', high: 'Traditional' },
                { key: 'authoritative' as const, low: 'Friendly', high: 'Authoritative' },
              ].map(({ key, low, high }) => {
                const value = messaging.toneAxes[key] ?? 0;
                return (
                  <div key={key} data-testid={`tone-axis-${key}`}>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-muted-foreground">{low}</span>
                      <span className="text-foreground font-medium">{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                      <span className="text-muted-foreground">{high}</span>
                    </div>
                    <input
                      type="range"
                      min={-1}
                      max={1}
                      step={0.1}
                      value={value}
                      onChange={(e) => updateMessaging('toneAxes', { ...messaging.toneAxes, [key]: parseFloat(e.target.value) })}
                      className="w-full accent-primary"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground/70 font-mono">
                      <span>−1</span>
                      <span className={value === 0 ? 'text-muted-foreground' : 'text-primary'}>{value > 0 ? '+' : ''}{value.toFixed(1)}</span>
                      <span>+1</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Voice Samples — short exemplars used as style anchors for AI */}
          <div className="pt-2 border-t border-border">
            <div className="flex items-center justify-between mb-2">
              <label className={`${labelClass} mb-0`}>Voice Samples</label>
              <span className="text-[10px] text-muted-foreground">3–5 examples ground AI in your actual voice</span>
            </div>
            <div className="space-y-2" data-testid="voice-samples-list">
              {messaging.voiceSamples.map((sample, idx) => (
                <div key={idx} className="flex gap-2 items-start" data-testid={`voice-sample-${idx}`}>
                  <input
                    type="text"
                    value={sample.context}
                    onChange={(e) => {
                      const next = [...messaging.voiceSamples];
                      next[idx] = { ...next[idx], context: e.target.value };
                      updateMessaging('voiceSamples', next);
                    }}
                    placeholder="Context (e.g. tweet, email subject)"
                    className={`${inputClass} w-44 flex-shrink-0`}
                  />
                  <textarea
                    value={sample.text}
                    onChange={(e) => {
                      const next = [...messaging.voiceSamples];
                      next[idx] = { ...next[idx], text: e.target.value };
                      updateMessaging('voiceSamples', next);
                    }}
                    placeholder="Sample text written in your brand voice"
                    rows={2}
                    className={`${inputClass} flex-1 resize-y`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const next = messaging.voiceSamples.filter((_, i) => i !== idx);
                      updateMessaging('voiceSamples', next);
                    }}
                    className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors"
                    title="Remove sample"
                    data-testid={`voice-sample-remove-${idx}`}
                  >
                    <span className="material-icons text-base">close</span>
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => updateMessaging('voiceSamples', [...messaging.voiceSamples, { context: '', text: '' }])}
                className="text-xs text-primary hover:underline flex items-center gap-1"
                data-testid="voice-sample-add"
              >
                <span className="material-icons text-sm">add</span>
                Add sample
              </button>
            </div>
          </div>
        </div>

        {/* Key Messaging */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="material-icons text-base text-primary">campaign</span>
            Key Messaging
          </h3>
          <div>
            <div className="flex items-center justify-between mb-1"><label className={`${labelClass} mb-0`}>Elevator Pitch</label><button type="button" onClick={() => openRewrite('elevatorPitch', 'Elevator Pitch')} className="p-0.5 rounded text-muted-foreground hover:text-primary transition-colors" title="Rewrite with AI"><span className="material-icons text-sm">auto_awesome</span></button></div>
            <textarea value={messaging.elevatorPitch} onChange={(e) => updateMessaging('elevatorPitch', e.target.value)} placeholder="A concise 30-second pitch about your company" className={`${inputClass} min-h-[80px] resize-y`} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1"><label className={`${labelClass} mb-0`}>Boilerplate Description</label><button type="button" onClick={() => openRewrite('boilerplate', 'Boilerplate Description')} className="p-0.5 rounded text-muted-foreground hover:text-primary transition-colors" title="Rewrite with AI"><span className="material-icons text-sm">auto_awesome</span></button></div>
            <textarea value={messaging.boilerplate} onChange={(e) => updateMessaging('boilerplate', e.target.value)} placeholder="Standard company description for press releases, proposals, etc." className={`${inputClass} min-h-[80px] resize-y`} />
          </div>
          <div>
            <label className={labelClass}>Key Differentiators</label>
            <div className="space-y-2">
              {messaging.keyDifferentiators.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex-1 px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm">{item}</span>
                  <button onClick={() => removeDifferentiator(i)} className="p-1.5 rounded-md text-destructive hover:bg-destructive/10">
                    <span className="material-icons text-base">close</span>
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newDifferentiator}
                  onChange={(e) => setNewDifferentiator(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addDifferentiator()}
                  placeholder="Add a differentiator"
                  className={inputClass}
                />
                <button
                  onClick={addDifferentiator}
                  disabled={!newDifferentiator.trim()}
                  className="px-3 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <span className="material-icons text-base">add</span>
                </button>
              </div>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1"><label className={`${labelClass} mb-0`}>Target Audience</label><button type="button" onClick={() => openRewrite('targetAudience', 'Target Audience')} className="p-0.5 rounded text-muted-foreground hover:text-primary transition-colors" title="Rewrite with AI"><span className="material-icons text-sm">auto_awesome</span></button></div>
            <textarea value={messaging.targetAudience} onChange={(e) => updateMessaging('targetAudience', e.target.value)} placeholder="Who are your ideal customers? Demographics, needs, pain points" className={`${inputClass} min-h-[80px] resize-y`} />
          </div>
        </div>

        {/* Company Details */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="material-icons text-base text-primary">info</span>
            Company Details
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Industry</label>
              <input type="text" value={messaging.industry} onChange={(e) => updateMessaging('industry', e.target.value)} placeholder="e.g. SaaS, Healthcare, Fintech" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Year Founded</label>
              <input type="text" value={messaging.yearFounded} onChange={(e) => updateMessaging('yearFounded', e.target.value)} placeholder="e.g. 2020" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Company Size</label>
              <input type="text" value={messaging.companySize} onChange={(e) => updateMessaging('companySize', e.target.value)} placeholder="e.g. 50-100 employees" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Headquarters</label>
              <input type="text" value={messaging.headquarters} onChange={(e) => updateMessaging('headquarters', e.target.value)} placeholder="City, State / Country" className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Website URL</label>
            <input type="text" value={messaging.websiteUrl} onChange={(e) => updateMessaging('websiteUrl', e.target.value)} placeholder="https://example.com" className={inputClass} />
          </div>
        </div>

        {/* Social Proof */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="material-icons text-base text-primary">verified</span>
            Social Proof
          </h3>
          <div>
            <div className="flex items-center justify-between mb-1"><label className={`${labelClass} mb-0`}>Testimonials, Awards & Press</label><button type="button" onClick={() => openRewrite('socialProof', 'Testimonials, Awards & Press')} className="p-0.5 rounded text-muted-foreground hover:text-primary transition-colors" title="Rewrite with AI"><span className="material-icons text-sm">auto_awesome</span></button></div>
            <textarea value={messaging.socialProof} onChange={(e) => updateMessaging('socialProof', e.target.value)} placeholder="Notable testimonials, awards, or press mentions" className={`${inputClass} min-h-[80px] resize-y`} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1"><label className={`${labelClass} mb-0`}>Key Clients / Partners</label><button type="button" onClick={() => openRewrite('keyClients', 'Key Clients / Partners')} className="p-0.5 rounded text-muted-foreground hover:text-primary transition-colors" title="Rewrite with AI"><span className="material-icons text-sm">auto_awesome</span></button></div>
            <textarea value={messaging.keyClients} onChange={(e) => updateMessaging('keyClients', e.target.value)} placeholder="Notable clients or partners you can reference" className={`${inputClass} min-h-[80px] resize-y`} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1"><label className={`${labelClass} mb-0`}>Certifications & Accreditations</label><button type="button" onClick={() => openRewrite('certifications', 'Certifications & Accreditations')} className="p-0.5 rounded text-muted-foreground hover:text-primary transition-colors" title="Rewrite with AI"><span className="material-icons text-sm">auto_awesome</span></button></div>
            <textarea value={messaging.certifications} onChange={(e) => updateMessaging('certifications', e.target.value)} placeholder="Industry certifications, compliance standards, etc." className={`${inputClass} min-h-[80px] resize-y`} />
          </div>
        </div>

        {/* Additional Context */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="material-icons text-base text-primary">lightbulb</span>
            Additional Context
          </h3>
          <div>
            <div className="flex items-center justify-between mb-1"><label className={`${labelClass} mb-0`}>Anything else the AI should know</label><button type="button" onClick={() => openRewrite('additionalContext', 'Additional Context')} className="p-0.5 rounded text-muted-foreground hover:text-primary transition-colors" title="Rewrite with AI"><span className="material-icons text-sm">auto_awesome</span></button></div>
            <textarea
              value={messaging.additionalContext}
              onChange={(e) => updateMessaging('additionalContext', e.target.value)}
              placeholder="Any other information that would be helpful when generating proposals, pitch decks, or other content"
              className={`${inputClass} min-h-[120px] resize-y`}
            />
          </div>
        </div>
      </div>
      )}

      {/* Field-level AI Rewrite Modal */}
      {rewriteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setRewriteModal(null)} />
          <div className="relative w-full max-w-lg mx-4 bg-card border border-border rounded-xl shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="material-icons text-base text-primary">auto_awesome</span>
                <h3 className="text-sm font-semibold text-foreground">Rewrite: {rewriteModal.label}</h3>
              </div>
              <button onClick={() => setRewriteModal(null)} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent">
                <span className="material-icons text-base">close</span>
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {Boolean((messaging as Record<string, unknown>)[rewriteModal.field]) && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Current value</label>
                  <div className="px-3 py-2 rounded-md border border-border bg-muted/30 text-sm text-muted-foreground max-h-24 overflow-y-auto whitespace-pre-wrap">
                    {String((messaging as Record<string, unknown>)[rewriteModal.field])}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">What should AI do?</label>
                <textarea
                  value={rewritePrompt}
                  onChange={(e) => setRewritePrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), runRewrite())}
                  placeholder={'e.g. "Make it more concise" or "Write this for a tech-savvy audience" or "Generate from scratch for a fitness brand"'}
                  className={`${inputClass} h-20 resize-none`}
                  autoFocus
                  disabled={rewriteLoading}
                />
              </div>
              {rewritePreview && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Preview</label>
                  <div className="px-3 py-2 rounded-md border border-primary/30 bg-primary/5 text-sm text-foreground max-h-32 overflow-y-auto whitespace-pre-wrap">
                    {rewritePreview}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
              {rewritePreview ? (
                <>
                  <button
                    onClick={runRewrite}
                    disabled={rewriteLoading || !rewritePrompt.trim()}
                    className="px-3 py-1.5 text-sm rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-50"
                  >
                    {rewriteLoading ? 'Regenerating...' : 'Regenerate'}
                  </button>
                  <button
                    onClick={acceptRewrite}
                    className="px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Accept
                  </button>
                </>
              ) : (
                <button
                  onClick={runRewrite}
                  disabled={rewriteLoading || !rewritePrompt.trim()}
                  className="px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {rewriteLoading ? (
                    <><span className="material-icons animate-spin text-sm">autorenew</span>Generating...</>
                  ) : (
                    <><span className="material-icons text-sm">auto_awesome</span>Generate</>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
