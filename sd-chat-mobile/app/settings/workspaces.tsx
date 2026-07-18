import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { MIcon } from '@/components/atoms';
import { Group, GroupFooter, GroupLabel, PushedNav } from '@/components/settings';
import { Screen } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import {
  useSwitchWorkspace,
  useWorkspaces,
  type SwitchWorkspaceError,
} from '@/lib/api/user';
import type { ClientMembership } from '@/lib/api/types/user';
import { Gradients, T, linearGradientProps } from '@/lib/theme';

/**
 * Workspaces settings subscreen (settings mockup screen 02).
 *
 * Sourced from `useWorkspaces()` — `/api/portal/clients`. The active
 * workspace (matched against `useAuth().client.id` since that's whatever
 * the bearer token was minted for) gets the hero card with the aiBorder
 * ring. Everything else lands in the "Switch to" group.
 *
 * Switch flow caveat: mobile bearer tokens are bound to one clientId, so
 * tapping a Switch row can't just POST `/api/portal/switch-client`. The
 * `useSwitchWorkspace` mutation rejects with `requires_reauth`; we surface
 * that as a native `Alert` that walks the user through sign-out + sign-in.
 * Backend gap documented in `lib/api/user.ts`.
 */
export default function WorkspacesScreen() {
  const router = useRouter();
  const { user, client: activeClient, signOut } = useAuth();
  const workspacesQuery = useWorkspaces({ enabled: !!user });
  const switchMutation = useSwitchWorkspace();
  const [pendingSwitchId, setPendingSwitchId] = useState<number | null>(null);

  const allClients = workspacesQuery.data?.clients ?? [];
  const activeId = activeClient?.id ?? workspacesQuery.data?.activeClientId ?? null;
  const active = allClients.find(c => c.id === activeId) ?? null;
  const others = allClients.filter(c => c.id !== activeId);

  function handleSwitch(target: ClientMembership) {
    setPendingSwitchId(target.id);
    switchMutation.mutate(target.id, {
      onError: (err: SwitchWorkspaceError) => {
        setPendingSwitchId(null);
        if (err.code === 'requires_reauth') {
          Alert.alert(
            `Switch to ${target.company ?? 'workspace'}?`,
            'You’ll be signed out so we can sign you back in to this workspace.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Sign out',
                style: 'destructive',
                onPress: () => {
                  void (async () => {
                    await signOut();
                    router.replace('/(auth)/sign-in');
                  })();
                },
              },
            ],
          );
        } else if (err.code === 'forbidden') {
          Alert.alert('Access denied', err.message);
        } else {
          Alert.alert('Couldn’t switch', err.message);
        }
      },
      onSuccess: () => {
        // Future: when the backend grows a token-rebind endpoint, the
        // mutation will resolve normally and we just bounce back to the
        // tabs root.
        setPendingSwitchId(null);
        router.replace('/(tabs)');
      },
    });
  }

  return (
    <Screen>
      <PushedNav title="Workspaces" onBack={() => router.back()} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }}>
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
        ) : workspacesQuery.isError ? (
          <View style={{ marginHorizontal: 16, marginTop: 16 }}>
            <View
              style={{
                backgroundColor: T.iosRed + '12',
                borderRadius: 12,
                padding: 12,
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
                <Text style={{ fontSize: 13, fontWeight: '600', color: T.iosRed }}>
                  Retry
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            {/* Current workspace hero */}
            {active ? (
              <>
                <GroupLabel mt={12}>Current workspace</GroupLabel>
                <View style={{ marginHorizontal: 16 }}>
                  <View
                    style={{
                      backgroundColor: T.bgCard,
                      borderRadius: 14,
                      overflow: 'hidden',
                      borderWidth: 1.5,
                      borderColor: T.aiBorder,
                    }}
                  >
                    <View
                      style={{
                        padding: 14,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        backgroundColor: T.aiTint,
                        borderBottomWidth: 0.5,
                        borderBottomColor: T.rowDivider,
                      }}
                    >
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
                        <Text
                          style={{
                            color: 'white',
                            fontSize: 17,
                            fontWeight: '700',
                            letterSpacing: -0.5,
                          }}
                        >
                          {shortFor(active.company)}
                        </Text>
                      </LinearGradient>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          numberOfLines={1}
                          style={{
                            fontSize: 16,
                            fontWeight: '600',
                            color: T.textPrimary,
                            letterSpacing: -0.2,
                          }}
                        >
                          {active.company ?? 'Untitled workspace'}
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={{
                            fontSize: 12,
                            color: T.aiDark,
                            marginTop: 2,
                            fontWeight: '500',
                          }}
                        >
                          {titleCase(active.role)}
                          {active.website ? ` · ${domainFor(active.website)}` : ''}
                        </Text>
                      </View>
                      <MIcon name="check_circle" size={20} color={T.ai} fill={1} />
                    </View>
                  </View>
                </View>
              </>
            ) : null}

            {others.length > 0 ? (
              <>
                <GroupLabel>Switch to</GroupLabel>
                <Group>
                  {others.map((w, i) => {
                    const isPending = pendingSwitchId === w.id;
                    return (
                      <Pressable
                        key={w.id}
                        onPress={() => handleSwitch(w)}
                        disabled={isPending}
                        android_ripple={{ color: T.borderLight }}
                        style={({ pressed }) => ({
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 12,
                          paddingHorizontal: 16,
                          paddingVertical: 11,
                          borderBottomWidth: i < others.length - 1 ? 0.5 : 0,
                          borderBottomColor: T.rowDivider,
                          backgroundColor: pressed ? T.bgSubtle : 'transparent',
                          opacity: isPending ? 0.5 : 1,
                        })}
                      >
                        <View
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            backgroundColor: colorFor(w.id) + '22',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Text
                            style={{
                              color: colorFor(w.id),
                              fontSize: 14,
                              fontWeight: '700',
                              letterSpacing: -0.3,
                            }}
                          >
                            {shortFor(w.company)}
                          </Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            numberOfLines={1}
                            style={{
                              fontSize: 15,
                              color: T.textPrimary,
                              fontWeight: '500',
                              letterSpacing: -0.1,
                            }}
                          >
                            {w.company ?? 'Untitled workspace'}
                          </Text>
                          <Text
                            numberOfLines={1}
                            style={{ fontSize: 12, color: T.textTertiary, marginTop: 1 }}
                          >
                            {titleCase(w.role)}
                            {w.website ? ` · ${domainFor(w.website)}` : ''}
                          </Text>
                        </View>
                        {isPending ? (
                          <ActivityIndicator size="small" color={T.textTertiary} />
                        ) : (
                          <MIcon name="chevron_right" size={20} color={T.textTertiary} />
                        )}
                      </Pressable>
                    );
                  })}
                </Group>
              </>
            ) : active ? (
              <GroupFooter>
                You’re only in one workspace right now. Ask a teammate for an invite to join others.
              </GroupFooter>
            ) : (
              <View style={{ padding: 32, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: T.textSecondary }}>
                  No workspaces on this account yet.
                </Text>
              </View>
            )}

            <View style={{ marginHorizontal: 16, marginTop: 24 }}>
              <Pressable
                style={({ pressed }) => ({
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
                  backgroundColor: T.bgCard,
                })}
              >
                <MIcon name="add" size={18} color={T.ai} />
                <Text style={{ color: T.ai, fontSize: 14, fontWeight: '600' }}>
                  Join or create workspace
                </Text>
              </Pressable>
            </View>

            <GroupFooter>
              Workspaces are isolated. Conversations, Brain notes, media, and CRM stay scoped to whichever you’re in. Switching workspaces signs you out and back in so your mobile session is re-issued for the new workspace.
            </GroupFooter>
          </>
        )}
      </ScrollView>
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
