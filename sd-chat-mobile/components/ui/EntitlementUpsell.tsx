import { useState } from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';

import { MIcon } from '@/components/atoms';
import { api } from '@/lib/api/client';
import { Gradients, T, linearGradientProps } from '@/lib/theme';

export type EntitlementUpsellVariant =
  | 'brain'
  | 'ai_credits'
  | 'service_required'
  | 'generic';

export interface EntitlementUpsellProps {
  /** Pick the preset copy + iconography. */
  variant: EntitlementUpsellVariant;
  /** Optional title override — defaults per variant. */
  title?: string;
  /** Optional body override — defaults per variant. */
  body?: string;
  /** Optional CTA label — defaults to "Upgrade in portal" / "Buy credits". */
  ctaLabel?: string;
  /** Optional portal URL to open. Defaults per variant. Accepts a path
   *  (joined to api.baseUrl) or a full URL. */
  upsellUrl?: string;
  /** Secondary action — e.g. "Dismiss" / "Retry". When omitted, no second
   *  button renders. */
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
  /** Margin/style override on the outer card. */
  style?: ViewStyle;
}

interface Preset {
  icon: Parameters<typeof MIcon>[0]['name'];
  iconBg: string;
  title: string;
  body: string;
  ctaLabel: string;
  upsellPath: string;
  gradient?: boolean;
}

const PRESETS: Record<EntitlementUpsellVariant, Preset> = {
  brain: {
    icon: 'psychology_alt',
    iconBg: T.ai,
    title: 'Add Company Brain',
    body: 'Brain captures notes, decisions, people, and glossary across your team. Add it to your subscription to unlock this screen.',
    ctaLabel: 'Add Brain',
    upsellPath: '/portal/brain',
    gradient: true,
  },
  ai_credits: {
    icon: 'bolt',
    iconBg: T.ai,
    title: 'Out of AI credits',
    body: 'Your workspace has run out of credits for assistant replies and tool use. Add more to continue.',
    ctaLabel: 'Buy credits',
    upsellPath: '/portal/billing/credits',
    gradient: true,
  },
  service_required: {
    icon: 'workspace_premium',
    iconBg: T.iosPurple ?? T.brand,
    title: 'Subscription required',
    body: 'This feature is part of a subscription your workspace does not currently have.',
    ctaLabel: 'Open subscriptions',
    upsellPath: '/portal/services',
  },
  generic: {
    icon: 'lock',
    iconBg: T.textTertiary,
    title: 'Not available',
    body: 'This feature is not available for your workspace.',
    ctaLabel: 'Learn more',
    upsellPath: '/portal/services',
  },
};

function joinUrl(base: string, pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const cleanBase = base.replace(/\/$/, '');
  const cleanPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${cleanBase}${cleanPath}`;
}

/**
 * Friendly upsell card used wherever the portal returns a 402 / 403
 * entitlement error. Avoids leaking raw server messages and instead leads
 * with a clear value prop + a tappable "Open in portal" CTA that opens the
 * SimplerDev portal in the in-app browser (or default web browser).
 *
 * Three preset variants cover the common cases (brain, ai_credits,
 * service_required). Generic falls back to a neutral lock icon for
 * unrecognised 4xx envelopes. Each preset can be overridden per-call with
 * `title` / `body` / `ctaLabel` / `upsellUrl` so the same component renders
 * inline credits-required banners (chat) and full-card upsells (brain).
 */
export function EntitlementUpsell({
  variant,
  title,
  body,
  ctaLabel,
  upsellUrl,
  secondaryLabel,
  onSecondaryPress,
  style,
}: EntitlementUpsellProps) {
  const preset = PRESETS[variant];
  const [opening, setOpening] = useState(false);

  const handleCta = async () => {
    const target = joinUrl(api.baseUrl, upsellUrl ?? preset.upsellPath);
    setOpening(true);
    try {
      await WebBrowser.openBrowserAsync(target);
    } catch {
      // ignore — opening the browser is best-effort
    } finally {
      setOpening(false);
    }
  };

  return (
    <View
      style={[
        {
          marginHorizontal: 16,
          marginTop: 12,
          marginBottom: 12,
          backgroundColor: T.bgCard,
          borderRadius: 16,
          padding: 18,
          borderWidth: 1,
          borderColor: T.borderLight,
          shadowColor: '#000',
          shadowOpacity: 0.05,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        {preset.gradient ? (
          <LinearGradient
            {...linearGradientProps(Gradients.ai)}
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MIcon name={preset.icon} size={22} color="white" fill={1} />
          </LinearGradient>
        ) : (
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: preset.iconBg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MIcon name={preset.icon} size={22} color="white" fill={1} />
          </View>
        )}
        <Text
          style={{
            flex: 1,
            fontSize: 16,
            fontWeight: '700',
            color: T.textPrimary,
            letterSpacing: -0.2,
          }}
          numberOfLines={2}
        >
          {title ?? preset.title}
        </Text>
      </View>

      <Text
        style={{
          fontSize: 13,
          lineHeight: 19,
          color: T.textSecondary,
          marginBottom: 16,
        }}
      >
        {body ?? preset.body}
      </Text>

      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <Pressable
          onPress={handleCta}
          disabled={opening}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel ?? preset.ctaLabel}
          style={({ pressed }) => ({
            flex: 1,
            opacity: opening ? 0.6 : pressed ? 0.85 : 1,
            borderRadius: 12,
            overflow: 'hidden',
          })}
        >
          <LinearGradient
            {...linearGradientProps(Gradients.ai)}
            style={{
              paddingVertical: 12,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 6,
            }}
          >
            <MIcon name="open_in_new" size={14} color="white" />
            <Text style={{ color: 'white', fontWeight: '700', fontSize: 13 }}>
              {ctaLabel ?? preset.ctaLabel}
            </Text>
          </LinearGradient>
        </Pressable>

        {secondaryLabel ? (
          <Pressable
            onPress={onSecondaryPress}
            accessibilityRole="button"
            accessibilityLabel={secondaryLabel}
            style={({ pressed }) => ({
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: T.border,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ color: T.textSecondary, fontWeight: '600', fontSize: 13 }}>
              {secondaryLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export default EntitlementUpsell;
