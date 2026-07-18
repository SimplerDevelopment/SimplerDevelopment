import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { AiAvatar, MIcon } from '@/components/atoms';
import { OnboardingHeader } from '@/components/onboarding';
import { Screen } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspaces } from '@/lib/api/user';
import type { ClientMembership } from '@/lib/api/types/user';
import { currentUser as mockUser, workspaces as mockWorkspaces } from '@/lib/mock';
import { Gradients, T, linearGradientProps } from '@/lib/theme';

/**
 * Workspace picker (onboarding mockup screen 02).
 *
 * Sourced from `useWorkspaces()` — `/api/portal/clients`. If the user only
 * has one workspace we auto-advance after a short beat. Loading shows a
 * spinner; error shows a red banner + retry; empty (zero memberships)
 * tells the user they need an invite.
 *
 * NOTE — the cards rendered here are read-only on this screen: the user
 * is signing into the workspace whose bearer token they JUST got minted
 * for. The cards are essentially a "this is what you're entering" preview.
 * To actually switch workspaces use `/settings/workspaces`.
 */
export default function PickWorkspace() {
  const router = useRouter();
  const { user, client } = useAuth();
  const workspacesQuery = useWorkspaces({ enabled: !!user });

  const remoteList = workspacesQuery.data?.clients ?? [];

  // Active-from-bearer-token wins; else the portal cookie hint; else the
  // first row.
  const activeId =
    client?.id ??
    workspacesQuery.data?.activeClientId ??
    remoteList[0]?.id ??
    null;

  const [selectedId, setSelectedId] = useState<number | null>(activeId);
  // Keep selection in sync once the data arrives.
  useEffect(() => {
    if (selectedId == null && activeId != null) setSelectedId(activeId);
  }, [activeId, selectedId]);

  // Auto-advance when there's exactly one workspace.
  useEffect(() => {
    if (workspacesQuery.isLoading) return;
    if (remoteList.length !== 1) return;
    const t = setTimeout(() => {
      router.replace('/(auth)/meet-assistant');
    }, 700);
    return () => clearTimeout(t);
  }, [workspacesQuery.isLoading, remoteList.length, router]);

  const { owned, member } = useMemo(() => {
    const o: ClientMembership[] = [];
    const m: ClientMembership[] = [];
    for (const c of remoteList) {
      if (c.role === 'owner') o.push(c);
      else m.push(c);
    }
    return { owned: o, member: m };
  }, [remoteList]);

  const selected =
    remoteList.find(w => w.id === selectedId) ?? remoteList[0] ?? null;

  const emailLabel = user?.email?.trim() || mockUser.email;

  return (
    <Screen>
      <OnboardingHeader
        total={5}
        current={0}
        left={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <AiAvatar size={24} ring={false} logo />
            <Text
              numberOfLines={1}
              style={{
                fontSize: 12,
                fontWeight: '600',
                color: T.textSecondary,
                letterSpacing: 0.3,
              }}
            >
              {emailLabel}
            </Text>
          </View>
        }
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24, paddingBottom: 16 }}>
        <Text
          style={{
            fontSize: 28,
            fontWeight: '700',
            letterSpacing: -0.6,
            color: T.textPrimary,
            lineHeight: 32,
            marginBottom: 8,
          }}
        >
          Where do you work?
        </Text>
        <Text style={{ fontSize: 14, color: T.textSecondary, lineHeight: 21, marginBottom: 24 }}>
          {workspacesQuery.isLoading
            ? 'Looking up your workspaces…'
            : remoteList.length === 0
              ? 'No workspaces found on this account yet. Ask a teammate for an invite.'
              : `We found you in ${remoteList.length} workspace${remoteList.length === 1 ? '' : 's'}. Pick one to start — you can switch anytime.`}
        </Text>

        {/* Error banner */}
        {workspacesQuery.isError ? (
          <View
            style={{
              backgroundColor: T.iosRed + '12',
              borderRadius: 12,
              padding: 12,
              marginBottom: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <MIcon name="error" size={18} color={T.iosRed} />
            <Text style={{ flex: 1, fontSize: 13, color: T.iosRed }}>
              Couldn’t load workspaces. {workspacesQuery.error?.message ?? ''}
            </Text>
            <Pressable onPress={() => workspacesQuery.refetch()}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: T.iosRed }}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Loading skeleton */}
        {workspacesQuery.isLoading ? (
          <View
            style={{
              padding: 40,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ActivityIndicator color={T.ai} />
          </View>
        ) : (
          <>
            {owned.length > 0 ? (
              <>
                <Text style={sectionLabel}>Your workspace</Text>
                {owned.map((w) => (
                  <WorkspaceCard
                    key={w.id}
                    name={w.company ?? 'Untitled workspace'}
                    short={shortFor(w.company)}
                    color={colorFor(w.id)}
                    role="Owner"
                    domain={domainFor(w.website)}
                    selected={w.id === selectedId}
                    onPress={() => setSelectedId(w.id)}
                  />
                ))}
              </>
            ) : null}

            {member.length > 0 ? (
              <>
                <Text style={[sectionLabel, { marginTop: owned.length > 0 ? 20 : 0 }]}>
                  Member of
                </Text>
                {member.map((w) => (
                  <WorkspaceCard
                    key={w.id}
                    name={w.company ?? 'Untitled workspace'}
                    short={shortFor(w.company)}
                    color={colorFor(w.id)}
                    role={titleCase(w.role)}
                    domain={domainFor(w.website)}
                    selected={w.id === selectedId}
                    onPress={() => setSelectedId(w.id)}
                  />
                ))}
              </>
            ) : null}
          </>
        )}

        <Pressable
          onPress={() => {}}
          style={({ pressed }) => ({
            marginTop: 12,
            paddingVertical: 14,
            borderRadius: 14,
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: T.border,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <MIcon name="add" size={18} color={T.ai} />
          <Text style={{ color: T.ai, fontSize: 14, fontWeight: '600' }}>
            Create a new workspace
          </Text>
        </Pressable>
      </ScrollView>

      {/* Bottom pinned CTA */}
      <View
        style={{
          padding: 24,
          paddingTop: 12,
          paddingBottom: 20,
          borderTopWidth: 1,
          borderTopColor: T.borderLight,
          backgroundColor: T.bgApp,
        }}
      >
        <PrimaryCTA
          icon="arrow_forward"
          label={
            workspacesQuery.isLoading
              ? 'Loading…'
              : selected
                ? `Continue as ${titleCase(selected.role)}`
                : 'Continue'
          }
          onPress={() => router.push('/(auth)/meet-assistant')}
        />
      </View>
    </Screen>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const PALETTE = ['#2563EB', '#0A84FF', '#30D158', '#FF9500', '#AF52DE', '#FF375F', '#64D2FF'];

function colorFor(id: number): string {
  return PALETTE[id % PALETTE.length] ?? PALETTE[0]!;
}

function shortFor(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) {
    const first = parts[0]!;
    return (first[0] ?? '').toUpperCase() + (first[1] ?? '').toUpperCase();
  }
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

function domainFor(website: string | null | undefined): string {
  if (!website) return '';
  try {
    const url = website.startsWith('http') ? website : `https://${website}`;
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return website;
  }
}

function titleCase(s: string): string {
  if (!s) return '';
  return s[0]!.toUpperCase() + s.slice(1).toLowerCase();
}

// Mock list still imported for AGENTS.md reference / future fallback paths.
// Touching it keeps the lint from flagging unused — once the network path
// stabilises this can drop entirely.
void mockWorkspaces;

const sectionLabel = {
  fontSize: 11,
  color: T.textTertiary,
  letterSpacing: 0.6,
  textTransform: 'uppercase' as const,
  fontWeight: '600' as const,
  marginBottom: 8,
};

function WorkspaceCard({
  name,
  short,
  color,
  role,
  domain,
  selected,
  onPress,
}: {
  name: string;
  short: string;
  color: string;
  role: string;
  domain: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: T.bgCard,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? T.ai : T.borderLight,
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        shadowColor: selected ? T.ai : 'transparent',
        shadowOpacity: selected ? 0.12 : 0,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 4 },
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          backgroundColor: color + '22',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color, fontSize: 16, fontWeight: '700', letterSpacing: -0.4 }}>
          {short}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{ fontSize: 15, color: T.textPrimary, fontWeight: '600', letterSpacing: -0.15 }}
        >
          {name}
        </Text>
        <Text numberOfLines={1} style={{ fontSize: 12, color: T.textTertiary, marginTop: 2 }}>
          {role}
          {domain ? ` · ${domain}` : ''}
        </Text>
      </View>
      {selected ? (
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: T.ai,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MIcon name="check" size={14} color="white" />
        </View>
      ) : (
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            borderWidth: 1.5,
            borderColor: T.border,
          }}
        />
      )}
    </Pressable>
  );
}

/** Primary gradient CTA — used throughout the onboarding chain. */
export function PrimaryCTA({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 14,
        overflow: 'hidden',
        opacity: pressed ? 0.92 : 1,
        shadowColor: T.ai,
        shadowOpacity: 0.35,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
      })}
    >
      <LinearGradient
        {...linearGradientProps(Gradients.ai)}
        style={{
          paddingVertical: 14,
          paddingHorizontal: 22,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <Text style={{ color: 'white', fontSize: 15, fontWeight: '600', letterSpacing: -0.1 }}>
          {label}
        </Text>
        {icon ? <MIcon name={icon} size={18} color="white" /> : null}
      </LinearGradient>
    </Pressable>
  );
}
