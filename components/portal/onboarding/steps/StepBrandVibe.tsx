'use client';

import { useEffect, useState } from 'react';
import type { StepProps } from './types';
import { BRAND_TONES } from '@/lib/onboarding/types';
import { obLabel, obHint, obPill, obPillSoft, obPrimaryBtn } from '../ob-styles';
import { useBrandProfile } from '@/app/portal/branding/profiles/[profileId]/_hooks/useBrandProfile';
import { AssetsTab } from '@/app/portal/branding/profiles/[profileId]/_components/AssetsTab';
import { ColorsTab } from '@/app/portal/branding/profiles/[profileId]/_components/ColorsTab';
import { TypographyTab } from '@/app/portal/branding/profiles/[profileId]/_components/TypographyTab';
import { ButtonsTab } from '@/app/portal/branding/profiles/[profileId]/_components/ButtonsTab';
import { StyleTab } from '@/app/portal/branding/profiles/[profileId]/_components/StyleTab';
import { MessagingTab } from '@/app/portal/branding/profiles/[profileId]/_components/MessagingTab';
import { RewriteModal } from '@/app/portal/branding/profiles/[profileId]/_components/AIToolsPanel';
import type { TabId } from '@/app/portal/branding/profiles/[profileId]/_lib/types';

const MAX_TONES = 3;

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'logos', label: 'Logos', icon: 'image' },
  { id: 'colors', label: 'Colors', icon: 'palette' },
  { id: 'typography', label: 'Typography', icon: 'text_fields' },
  { id: 'buttons', label: 'Buttons', icon: 'smart_button' },
  { id: 'style', label: 'Style', icon: 'tune' },
  { id: 'messaging', label: 'Messaging', icon: 'chat' },
];

export function StepBrandVibe({ state, setAnswers, next }: StepProps) {
  const [tones, setTones] = useState<string[]>(state.answers.brandTones ?? []);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [profileError, setProfileError] = useState(false);

  // Find the client's default brand profile (created at signup / enriched from
  // their domain), or create an empty one so the editor has something to edit.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/portal/branding/profiles');
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          const existing = json.data.find((p: { isDefault: boolean }) => p.isDefault) ?? json.data[0];
          if (existing) {
            if (!cancelled) setProfileId(existing.id);
            return;
          }
        }
        const created = await fetch('/api/portal/branding/profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Default', isDefault: true }),
        });
        const createdJson = await created.json();
        if (createdJson.success && createdJson.data?.id) {
          if (!cancelled) setProfileId(createdJson.data.id);
        } else if (!cancelled) {
          setProfileError(true);
        }
      } catch {
        if (!cancelled) setProfileError(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const toggleTone = (id: string) => {
    // Update both local + parent state from the event handler. Calling
    // setAnswers() inside the setTones updater ran it during render →
    // "Cannot update a component while rendering another".
    const has = tones.includes(id);
    const updated = has ? tones.filter((t) => t !== id) : [...tones, id].slice(0, MAX_TONES);
    setTones(updated);
    setAnswers({ brandTones: updated });
  };

  return (
    <div className="space-y-7">
      <div>
        <label className={obLabel}>
          Tone <span className="font-normal text-muted-foreground">— up to {MAX_TONES}</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {BRAND_TONES.map((t) => {
            const active = tones.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleTone(t.id)}
                data-testid={`onboarding-tone-${t.id}`}
                className={active ? obPillSoft : obPill}
              >
                <span className="material-icons" style={{ fontSize: 16, verticalAlign: 'text-bottom', marginRight: 4 }}>{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>
        <p className={obHint}>
          <span className="material-icons" style={{ fontSize: 15 }}>info</span>
          {tones.length} / {MAX_TONES} selected
        </p>
      </div>

      {profileId !== null ? (
        <InlineBrandEditor profileId={profileId} tones={tones} next={next} />
      ) : profileError ? (
        <div className="flex items-center justify-between rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">
            Couldn&apos;t load your brand profile — you can set it up later in Branding.
          </p>
          <button
            type="button"
            onClick={() => next({ brandTones: tones })}
            data-testid="onboarding-brand-next"
            className={obPrimaryBtn}
          >
            Continue
            <span className="material-icons" style={{ fontSize: 18 }}>arrow_forward</span>
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-center py-10">
          <span className="material-icons animate-spin text-muted-foreground">refresh</span>
        </div>
      )}
    </div>
  );
}

// The full portal brand-profile editor (same tabs as /portal/branding/profiles/[id]),
// pointed at the default profile so onboarding edits are the real thing.
function InlineBrandEditor({
  profileId,
  tones,
  next,
}: {
  profileId: number;
  tones: string[];
  next: StepProps['next'];
}) {
  const {
    profile,
    messaging,
    loading,
    saving,
    update,
    updateDark,
    updateButtonStyle,
    updateTypo,
    setButtonPresets,
    updateMessaging,
    save,
  } = useBrandProfile(String(profileId));

  const [activeTab, setActiveTab] = useState<TabId>('logos');
  const [rewriteModal, setRewriteModal] = useState<{ field: string; label: string } | null>(null);

  const continueNext = async () => {
    if (profile) await save();
    next({ brandTones: tones });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <span className="material-icons animate-spin text-muted-foreground">refresh</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            data-testid={`onboarding-brand-tab-${tab.id}`}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
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

      {profile && (
        <>
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
            <MessagingTab
              messaging={messaging}
              updateMessaging={updateMessaging}
              openRewrite={(field, label) => setRewriteModal({ field, label })}
            />
          )}
        </>
      )}

      <div className="flex items-center justify-end pt-1">
        <button
          type="button"
          onClick={continueNext}
          disabled={saving}
          data-testid="onboarding-brand-next"
          className={obPrimaryBtn}
        >
          {saving ? 'Saving…' : 'Continue'}
          <span className="material-icons" style={{ fontSize: 18 }}>arrow_forward</span>
        </button>
      </div>

      <RewriteModal
        modal={rewriteModal}
        messaging={messaging}
        onAccept={(field, value) => {
          updateMessaging(field, value);
          setRewriteModal(null);
        }}
        onClose={() => setRewriteModal(null)}
      />
    </div>
  );
}
