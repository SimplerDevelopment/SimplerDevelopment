import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { MIcon, Toggle } from '@/components/atoms';
import { Group, GroupFooter, GroupLabel, PushedNav, SettingsRow } from '@/components/settings';
import { Screen } from '@/components/ui';
import { useRevokeSession, useSessions } from '@/lib/api/sessions';
import type { ActiveSession } from '@/lib/api/types/sessions';
import { Gradients, T } from '@/lib/theme';

/**
 * Privacy & Security settings (settings mockup screen 05). Face ID toggle,
 * AI-data toggles, active sessions list with sign-out per row, and a
 * destructive bottom CTA to sign out everywhere.
 *
 * Active sessions come from `/api/portal/api-keys` via `useSessions()`,
 * which also detects the current device's row by matching `keyPreview`
 * against the stored token (best-effort heuristic — see `lib/api/sessions.ts`).
 *
 * Revoke calls `DELETE /api/portal/api-keys?id=<id>`. The current device's
 * "End" affordance is suppressed.
 */
export default function PrivacyScreen() {
  const router = useRouter();
  const [faceId, setFaceId] = useState(true);
  const [hidePreviews, setHidePreviews] = useState(true);
  const [trainAi, setTrainAi] = useState(false);
  const [syncDevices, setSyncDevices] = useState(true);

  const sessionsQuery = useSessions();
  const revokeMutation = useRevokeSession();
  const sessionList = sessionsQuery.data ?? [];

  const endSession = (s: ActiveSession) => {
    Alert.alert(
      'End session?',
      `Sign "${s.device}" out immediately. They'll have to sign in again to access the portal.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End',
          style: 'destructive',
          onPress: async () => {
            try {
              await revokeMutation.mutateAsync(s.id);
            } catch (err) {
              Alert.alert(
                'Couldn\'t end session',
                err instanceof Error ? err.message : 'Unknown error',
              );
            }
          },
        },
      ],
    );
  };

  const signOutAll = () => {
    const others = sessionList.filter((s) => !s.current);
    if (others.length === 0) {
      Alert.alert('Nothing to sign out', 'Only this device is currently signed in.');
      return;
    }
    Alert.alert(
      'Sign out all other sessions?',
      `${others.length} device${others.length === 1 ? '' : 's'} will be signed out. You'll stay signed in on this device.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            // Sequential — the portal does not yet expose a bulk revoke
            // endpoint, and fan-out parallelism would race the cache
            // invalidation. Failures are reported but do not abort the
            // batch.
            const failures: string[] = [];
            for (const s of others) {
              try {
                await revokeMutation.mutateAsync(s.id);
              } catch (err) {
                failures.push(`${s.device}: ${err instanceof Error ? err.message : 'unknown'}`);
              }
            }
            if (failures.length > 0) {
              Alert.alert('Some sessions failed to revoke', failures.join('\n'));
            }
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <PushedNav title="Privacy & Security" onBack={() => router.back()} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }}>
        <GroupLabel mt={12}>App lock</GroupLabel>
        <Group>
          <SettingsRow
            icon="face"
            iconBg={T.success}
            iconFill={1}
            title="Face ID"
            accessory={<Toggle value={faceId} onChange={setFaceId} />}
          />
          <SettingsRow
            icon="timer"
            iconBg={T.iosBlue}
            iconFill={1}
            title="Require after"
            value="5 minutes"
          />
          <SettingsRow
            icon="visibility_off"
            iconBg={T.iosOrange}
            iconFill={1}
            title="Hide previews on lock"
            accessory={<Toggle value={hidePreviews} onChange={setHidePreviews} />}
            last
          />
        </Group>

        <GroupLabel>AI & data</GroupLabel>
        <Group>
          <SettingsRow
            icon="psychology"
            iconGradient={Gradients.ai}
            iconFill={1}
            title="Use chats to improve AI"
            accessory={<Toggle value={trainAi} onChange={setTrainAi} />}
          />
          <SettingsRow
            icon="auto_delete"
            iconBg={T.iosPurple}
            iconFill={1}
            title="Auto-delete AI transcripts"
            value="180 days"
          />
          <SettingsRow
            icon="cloud_sync"
            iconBg={T.iosBlue}
            iconFill={1}
            title="Sync across devices"
            accessory={<Toggle value={syncDevices} onChange={setSyncDevices} />}
            last
          />
        </Group>
        <GroupFooter>
          When off, your conversations and Brain queries are never used to train models. Default: off.
        </GroupFooter>

        <GroupLabel>Active sessions</GroupLabel>
        <Group>
          {sessionsQuery.isLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <ActivityIndicator color={T.ai} />
            </View>
          ) : sessionsQuery.isError ? (
            <View style={{ paddingVertical: 18, paddingHorizontal: 16 }}>
              <Text style={{ fontSize: 13, color: T.textSecondary, textAlign: 'center' }}>
                {sessionsQuery.error?.message ?? "Couldn't load sessions."}
              </Text>
            </View>
          ) : sessionList.length === 0 ? (
            <View style={{ paddingVertical: 18, paddingHorizontal: 16 }}>
              <Text style={{ fontSize: 13, color: T.textSecondary, textAlign: 'center' }}>
                No active sessions found.
              </Text>
            </View>
          ) : (
            sessionList.map((s, i) => (
              <View
                key={s.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 11,
                  paddingHorizontal: 16,
                  borderBottomWidth: i < sessionList.length - 1 ? 0.5 : 0,
                  borderBottomColor: T.rowDivider,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: s.current ? T.aiSoft : T.bgSubtle,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <MIcon
                    name={s.icon}
                    size={18}
                    color={s.current ? T.ai : T.textSecondary}
                    fill={1}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text
                      style={{ fontSize: 14, color: T.textPrimary, fontWeight: '500' }}
                      numberOfLines={1}
                    >
                      {s.device}
                    </Text>
                    {s.current ? (
                      <View
                        style={{
                          paddingHorizontal: 5,
                          paddingVertical: 2,
                          backgroundColor: '#DCFCE7',
                          borderRadius: 4,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 9,
                            fontWeight: '700',
                            letterSpacing: 0.5,
                            color: T.success,
                          }}
                        >
                          THIS DEVICE
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text
                    style={{ fontSize: 11, color: T.textTertiary, marginTop: 1 }}
                    numberOfLines={1}
                  >
                    {s.location} · {s.time}
                  </Text>
                </View>
                {!s.current ? (
                  <Pressable
                    onPress={() => endSession(s)}
                    disabled={revokeMutation.isPending}
                    hitSlop={6}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        color: T.danger,
                        fontWeight: '500',
                        opacity: revokeMutation.isPending ? 0.5 : 1,
                      }}
                    >
                      End
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ))
          )}
        </Group>

        <View style={{ marginHorizontal: 16, marginTop: 16 }}>
          <Pressable
            onPress={signOutAll}
            disabled={revokeMutation.isPending || sessionList.filter((s) => !s.current).length === 0}
            style={({ pressed }) => ({
              paddingVertical: 13,
              backgroundColor: T.bgCard,
              borderRadius: 14,
              alignItems: 'center',
              opacity: pressed || revokeMutation.isPending ? 0.7 : 1,
            })}
          >
            <Text style={{ color: T.danger, fontSize: 15, fontWeight: '500' }}>
              Sign out all other sessions
            </Text>
          </Pressable>
        </View>

        <GroupLabel>Your data</GroupLabel>
        <Group>
          <SettingsRow icon="download" iconBg={T.iosBlue} iconFill={1} title="Export your data" />
          <SettingsRow
            icon="delete_forever"
            iconBg={T.iosRed}
            iconFill={1}
            title="Delete account"
            titleColor={T.danger}
            last
          />
        </Group>
      </ScrollView>
    </Screen>
  );
}
