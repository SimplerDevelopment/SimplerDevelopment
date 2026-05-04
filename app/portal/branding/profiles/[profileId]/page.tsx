// Brand profile editor — orchestrates tabs, AI tools, save state, and the rewrite modal.

'use client';

import { useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { BrandAuditPanel } from '@/components/portal/BrandAuditPanel';
import { AIGeneratorPanel, RewriteModal } from './_components/AIToolsPanel';
import { AssetsTab } from './_components/AssetsTab';
import { ColorsTab } from './_components/ColorsTab';
import { TypographyTab } from './_components/TypographyTab';
import { ButtonsTab } from './_components/ButtonsTab';
import { StyleTab } from './_components/StyleTab';
import { MessagingTab } from './_components/MessagingTab';
import { useBrandProfile } from './_hooks/useBrandProfile';
import { VALID_TABS, type TabId } from './_lib/types';

export default function BrandingProfileEditorPage() {
  const { profileId } = useParams<{ profileId: string }>();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab');
  const startTab: TabId = VALID_TABS.includes(initialTab as TabId) ? (initialTab as TabId) : 'logos';

  const {
    profile,
    messaging,
    loading,
    saving,
    dirty,
    messagingDirty,
    update,
    updateDark,
    updateButtonStyle,
    updateTypo,
    setButtonPresets,
    updateMessaging,
    replaceMessaging,
    save,
  } = useBrandProfile(profileId);

  const [activeTab, setActiveTab] = useState<TabId>(startTab);
  const [rewriteModal, setRewriteModal] = useState<{ field: string; label: string } | null>(null);

  const openRewrite = (field: string, label: string) => {
    setRewriteModal({ field, label });
  };

  const acceptRewrite = (field: string, value: string) => {
    updateMessaging(field, value);
    setRewriteModal(null);
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
        <Link href="/portal/branding" className="text-primary text-sm mt-2 inline-block">
          Back to Branding
        </Link>
      </div>
    );
  }

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
      <AIGeneratorPanel profile={profile} update={update} setMessaging={replaceMessaging} />

      {/* Brand audit — visible above tabs so issues are always surfaced */}
      <div className="border border-border rounded-lg bg-background p-4">
        <BrandAuditPanel profileId={parseInt(profileId, 10)} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((tab) => (
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

      {activeTab === 'logos' && (
        <AssetsTab profile={profile} update={update} updateDark={updateDark} updateTypo={updateTypo} />
      )}
      {activeTab === 'colors' && <ColorsTab profile={profile} update={update} updateDark={updateDark} />}
      {activeTab === 'typography' && (
        <TypographyTab profile={profile} update={update} updateTypo={updateTypo} />
      )}
      {activeTab === 'buttons' && (
        <ButtonsTab
          profile={profile}
          updateButtonStyle={updateButtonStyle}
          setButtonPresets={setButtonPresets}
        />
      )}
      {activeTab === 'style' && <StyleTab profile={profile} update={update} />}
      {activeTab === 'messaging' && (
        <MessagingTab messaging={messaging} updateMessaging={updateMessaging} openRewrite={openRewrite} />
      )}

      <RewriteModal
        modal={rewriteModal}
        messaging={messaging}
        onAccept={acceptRewrite}
        onClose={() => setRewriteModal(null)}
      />
    </div>
  );
}
