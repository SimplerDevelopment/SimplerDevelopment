import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { MIcon, Toggle } from '@/components/atoms';
import { Group, GroupFooter, GroupLabel, PushedNav, SettingsRow } from '@/components/settings';
import { Screen } from '@/components/ui';
import { Gradients, T } from '@/lib/theme';

type MutedThread = { name: string; until: string };

const MUTED: MutedThread[] = [
  { name: '# Q2 Planning', until: 'until tomorrow' },
  { name: '# Brand sprint', until: 'until Friday' },
  { name: 'Maya Rivera', until: 'forever' },
];

/**
 * Notifications settings (settings mockup screen 04). Channels (push, email,
 * sounds, haptics), when-to-notify defaults, quiet hours, and muted threads.
 */
export default function NotificationsSettings() {
  const router = useRouter();

  const [push, setPush] = useState(true);
  const [emailDigest, setEmailDigest] = useState(false);
  const [sounds, setSounds] = useState(true);
  const [haptics, setHaptics] = useState(true);
  const [quietHours, setQuietHours] = useState(true);
  const [muted, setMuted] = useState<MutedThread[]>(MUTED);

  return (
    <Screen>
      <PushedNav title="Notifications" onBack={() => router.back()} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }}>
        <GroupLabel mt={12}>Channels</GroupLabel>
        <Group>
          <SettingsRow
            icon="notifications_active"
            iconBg={T.iosRed}
            iconFill={1}
            title="Push notifications"
            accessory={<Toggle value={push} onChange={setPush} />}
          />
          <SettingsRow
            icon="mail"
            iconBg={T.iosBlue}
            iconFill={1}
            title="Email digest"
            value="Off"
            accessory={<Toggle value={emailDigest} onChange={setEmailDigest} />}
          />
          <SettingsRow
            icon="volume_up"
            iconBg={T.iosOrange}
            iconFill={1}
            title="In-app sounds"
            accessory={<Toggle value={sounds} onChange={setSounds} />}
          />
          <SettingsRow
            icon="vibration"
            iconBg={T.iosPurple}
            iconFill={1}
            title="Haptics"
            accessory={<Toggle value={haptics} onChange={setHaptics} />}
            last
          />
        </Group>

        <GroupLabel>When to notify</GroupLabel>
        <Group>
          <SettingsRow
            icon="forum"
            iconGradient={Gradients.ai}
            iconFill={1}
            title="Direct messages"
            value="All"
          />
          <SettingsRow
            icon="alternate_email"
            iconBg={T.iosBlue}
            iconFill={1}
            title="@mentions"
            value="All"
          />
          <SettingsRow
            icon="groups"
            iconBg={T.iosTeal}
            iconFill={1}
            title="Group messages"
            value="Only when active"
          />
          <SettingsRow
            icon="auto_awesome"
            iconGradient={Gradients.ai}
            iconFill={1}
            title="AI tool approvals"
            value="All"
            valueColor={T.ai}
          />
          <SettingsRow
            icon="psychology_alt"
            iconBg={T.iosPurple}
            iconFill={1}
            title="Brain updates I follow"
            value="Daily digest"
            last
          />
        </Group>
        <GroupFooter>AI tool approvals can't be muted — they always require your tap.</GroupFooter>

        <GroupLabel>Quiet hours</GroupLabel>
        <Group>
          <SettingsRow
            icon="dark_mode"
            iconBg={T.textPrimary}
            iconFill={1}
            title="Pause notifications"
            accessory={<Toggle value={quietHours} onChange={setQuietHours} />}
          />
          <SettingsRow
            icon="schedule"
            iconBg={T.iosBlue}
            iconFill={1}
            title="From"
            value="10:00 PM"
          />
          <SettingsRow
            icon="schedule"
            iconBg={T.iosBlue}
            iconFill={1}
            title="To"
            value="7:00 AM"
            last
          />
        </Group>

        <GroupLabel>Muted threads ({muted.length})</GroupLabel>
        <Group>
          {muted.map((m, i) => (
            <View
              key={m.name}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 11,
                paddingHorizontal: 16,
                borderBottomWidth: i < muted.length - 1 ? 0.5 : 0,
                borderBottomColor: T.rowDivider,
              }}
            >
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  backgroundColor: T.bgSubtle,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MIcon name="notifications_off" size={16} color={T.textSecondary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14, color: T.textPrimary, fontWeight: '500' }}>
                  {m.name}
                </Text>
                <Text style={{ fontSize: 12, color: T.textTertiary, marginTop: 1 }}>
                  Muted {m.until}
                </Text>
              </View>
              <Pressable
                onPress={() => setMuted((prev) => prev.filter((x) => x.name !== m.name))}
                hitSlop={6}
              >
                <Text style={{ fontSize: 13, color: T.ai, fontWeight: '500' }}>Unmute</Text>
              </Pressable>
            </View>
          ))}
        </Group>
      </ScrollView>
    </Screen>
  );
}
