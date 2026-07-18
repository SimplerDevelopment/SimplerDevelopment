import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { IconTile, MIcon, Radio, Toggle } from '@/components/atoms';
import { Group, GroupFooter, GroupLabel, PushedNav, SettingsRow } from '@/components/settings';
import { Screen } from '@/components/ui';
import { Gradients, T, linearGradientProps } from '@/lib/theme';

/**
 * AI Assistant settings (settings mockup screen 03). Gradient hero with model
 * label, approval-mode radios, Brain-context toggles, and the per-domain tool
 * inventory. All toggles + radios are local state — Phase 3 wires them up.
 */
export default function AiAssistantScreen() {
  const router = useRouter();

  const [mode, setMode] = useState<'auto' | 'writes' | 'all'>('writes');
  const [brainAutoInject, setBrainAutoInject] = useState(true);
  const [brainPrivate, setBrainPrivate] = useState(false);
  const [brainCrm, setBrainCrm] = useState(true);
  const [crmTools, setCrmTools] = useState(true);
  const [brainTools, setBrainTools] = useState(true);
  const [postsTools, setPostsTools] = useState(true);
  const [emailTools, setEmailTools] = useState(true);

  return (
    <Screen>
      <PushedNav title="AI Assistant" onBack={() => router.back()} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Hero card */}
        <View style={{ marginHorizontal: 16, marginTop: 12 }}>
          <LinearGradient
            {...linearGradientProps(Gradients.ai)}
            style={{
              borderRadius: 16,
              padding: 16,
              overflow: 'hidden',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: 'rgba(255,255,255,0.18)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MIcon name="auto_awesome" size={20} color="white" fill={1} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 11,
                    color: 'rgba(255,255,255,0.85)',
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                    fontWeight: '600',
                  }}
                >
                  Model
                </Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: 'white', letterSpacing: -0.2 }}>
                  Claude Opus 4.7
                </Text>
              </View>
              <MIcon name="expand_more" size={20} color="white" />
            </View>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 3.5,
                    backgroundColor: '#86EFAC',
                  }}
                />
                <Text style={{ color: 'white', fontSize: 11, opacity: 0.92 }}>
                  Connected
                </Text>
              </View>
              <Text style={{ color: 'white', fontSize: 11, opacity: 0.7 }}>·</Text>
              <Text style={{ color: 'white', fontSize: 11, opacity: 0.92 }}>
                23 tools available
              </Text>
              <Text style={{ color: 'white', fontSize: 11, opacity: 0.7 }}>·</Text>
              <Text style={{ color: 'white', fontSize: 11, opacity: 0.92 }}>Brain linked</Text>
            </View>
          </LinearGradient>
        </View>

        <GroupLabel>Approval mode</GroupLabel>
        <Group>
          <RadioRow
            icon="bolt"
            iconBg={T.warning}
            title="Auto-run all tools"
            sub="Fast but risky — even sends emails"
            selected={mode === 'auto'}
            onPress={() => setMode('auto')}
          />
          <RadioRow
            icon="rule"
            iconGradient
            title="Approve writes"
            sub="Reads run instantly · writes ask first"
            selected={mode === 'writes'}
            onPress={() => setMode('writes')}
          />
          <RadioRow
            icon="lock"
            iconBg={T.success}
            title="Approve everything"
            sub="Safest · slowest"
            selected={mode === 'all'}
            onPress={() => setMode('all')}
            last
          />
        </Group>

        <GroupLabel>Context from Brain</GroupLabel>
        <Group>
          <SettingsRow
            icon="hub"
            iconBg={T.iosPurple}
            iconFill={1}
            title="Auto-inject relevant notes"
            accessory={<Toggle value={brainAutoInject} onChange={setBrainAutoInject} />}
          />
          <SettingsRow
            icon="badge"
            iconBg={T.iosBlue}
            iconFill={1}
            title="Include private notes"
            accessory={<Toggle value={brainPrivate} onChange={setBrainPrivate} />}
          />
          <SettingsRow
            icon="timeline"
            iconBg={T.iosOrange}
            iconFill={1}
            title="Include CRM activity"
            accessory={<Toggle value={brainCrm} onChange={setBrainCrm} />}
            last
          />
        </Group>
        <GroupFooter>
          The strip above each AI reply shows exactly what context was used.
        </GroupFooter>

        <GroupLabel>Available tools</GroupLabel>
        <Group>
          <SettingsRow
            icon="business_center"
            iconBg={T.iosBlue}
            iconFill={1}
            title="CRM"
            value="4 of 4"
            accessory={<Toggle value={crmTools} onChange={setCrmTools} />}
          />
          <SettingsRow
            icon="psychology_alt"
            iconBg={T.iosPurple}
            iconFill={1}
            title="Brain"
            value="9 of 9"
            accessory={<Toggle value={brainTools} onChange={setBrainTools} />}
          />
          <SettingsRow
            icon="article"
            iconBg={T.iosTeal}
            iconFill={1}
            title="Posts & pages"
            value="3 of 3"
            accessory={<Toggle value={postsTools} onChange={setPostsTools} />}
          />
          <SettingsRow
            icon="mail"
            iconBg={T.iosOrange}
            iconFill={1}
            title="Email campaigns"
            value="2 of 3"
            accessory={<Toggle value={emailTools} onChange={setEmailTools} />}
          />
          <SettingsRow
            icon="more_horiz"
            iconBg={T.textTertiary}
            iconFill={1}
            title="See all 23 tools"
            last
          />
        </Group>
      </ScrollView>
    </Screen>
  );
}

function RadioRow({
  icon,
  iconBg,
  iconGradient,
  title,
  sub,
  selected,
  onPress,
  last,
}: {
  icon: string;
  iconBg?: string;
  iconGradient?: boolean;
  title: string;
  sub: string;
  selected: boolean;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: T.borderLight }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 11,
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: T.rowDivider,
        backgroundColor: pressed ? T.bgSubtle : 'transparent',
      })}
    >
      <IconTile
        name={icon}
        bg={iconBg ?? T.iosBlue}
        gradient={iconGradient ? Gradients.ai : undefined}
        fill={1}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{ fontSize: 15, color: T.textPrimary, fontWeight: '500', letterSpacing: -0.1 }}
        >
          {title}
        </Text>
        <Text style={{ fontSize: 12, color: T.textTertiary, marginTop: 1 }}>{sub}</Text>
      </View>
      <Radio selected={selected} />
    </Pressable>
  );
}
