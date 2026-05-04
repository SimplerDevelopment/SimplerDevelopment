// Hook that owns fetch + dirty-tracking + save coordination for profile + messaging.

import { useCallback, useEffect, useState } from 'react';
import {
  EMPTY_MESSAGING,
  PROFILE_DEFAULTS,
  type ButtonPreset,
  type ButtonStyle,
  type DarkModeOverrides,
  type ElementTypography,
  type MessagingData,
  type ProfileData,
} from '../_lib/types';
import { fetchMessaging, fetchProfile, saveMessaging, saveProfile } from '../_lib/api';

export function useBrandProfile(profileId: string) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [messaging, setMessaging] = useState<MessagingData>(EMPTY_MESSAGING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [messagingDirty, setMessagingDirty] = useState(false);

  useEffect(() => {
    Promise.all([fetchProfile(profileId), fetchMessaging(profileId)])
      .then(([profileRes, messagingRes]) => {
        if (profileRes.success && profileRes.data) {
          setProfile({ ...PROFILE_DEFAULTS, ...profileRes.data } as ProfileData);
        }
        if (messagingRes.success && messagingRes.data) {
          setMessaging((prev) => ({
            ...prev,
            ...messagingRes.data,
            keyDifferentiators: messagingRes.data?.keyDifferentiators ?? [],
            toneAxes: messagingRes.data?.toneAxes ?? {},
            voiceSamples: messagingRes.data?.voiceSamples ?? [],
          }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [profileId]);

  const update = useCallback((updates: Partial<ProfileData>) => {
    setProfile((prev) => (prev ? { ...prev, ...updates } : prev));
    setDirty(true);
  }, []);

  const updateDark = useCallback(
    (updates: Partial<DarkModeOverrides>) => {
      setProfile((prev) => {
        if (!prev) return prev;
        return { ...prev, darkMode: { ...(prev.darkMode || {}), ...updates } };
      });
      setDirty(true);
    },
    [],
  );

  const updateButtonStyle = useCallback((updates: Partial<ButtonStyle>) => {
    setProfile((prev) => {
      if (!prev) return prev;
      return { ...prev, buttonStyle: { ...(prev.buttonStyle || {}), ...updates } };
    });
    setDirty(true);
  }, []);

  const updateTypo = useCallback((el: string, updates: Partial<ElementTypography>) => {
    setProfile((prev) => {
      if (!prev) return prev;
      const current = { ...(prev.typography?.[el] || {}) };
      return {
        ...prev,
        typography: {
          ...(prev.typography || {}),
          [el]: { ...current, ...updates },
        },
      };
    });
    setDirty(true);
  }, []);

  const setButtonPresets = useCallback(
    (next: ButtonPreset[]) => {
      setProfile((prev) => (prev ? { ...prev, buttonPresets: next } : prev));
      setDirty(true);
    },
    [],
  );

  const updateMessaging = useCallback((field: string, value: unknown) => {
    setMessaging((prev) => ({ ...prev, [field]: value }));
    setMessagingDirty(true);
  }, []);

  const replaceMessaging = useCallback((updater: (prev: MessagingData) => MessagingData) => {
    setMessaging(updater);
    setMessagingDirty(true);
  }, []);

  const save = useCallback(async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const saves = [saveProfile(profileId, profile)];
      if (messagingDirty) {
        saves.push(saveMessaging(profileId, messaging));
      }
      await Promise.all(saves);
      setDirty(false);
      setMessagingDirty(false);
    } finally {
      setSaving(false);
    }
  }, [profileId, profile, messaging, messagingDirty]);

  return {
    profile,
    setProfile,
    messaging,
    setMessaging,
    loading,
    saving,
    dirty,
    messagingDirty,
    setMessagingDirty,
    update,
    updateDark,
    updateButtonStyle,
    updateTypo,
    setButtonPresets,
    updateMessaging,
    replaceMessaging,
    save,
  };
}
