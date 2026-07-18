import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { MIcon } from '@/components/atoms';
import { OnboardingHeader } from '@/components/onboarding';
import { Screen } from '@/components/ui';
import { Gradients, T, linearGradientProps } from '@/lib/theme';
import { PrimaryCTA } from './pick-workspace';

type Mode = 'auto' | 'writes' | 'all';

type CardConfig = {
  id: Mode;
  icon: string;
  iconBg?: string;
  iconGradient?: boolean;
  title: string;
  sub: string;
  tag: string;
};

const CARDS: CardConfig[] = [
  {
    id: 'auto',
    icon: 'bolt',
    iconBg: T.warning,
    title: 'Auto-run everything',
    sub: 'Fastest. The assistant just does it — including sending emails and creating deals.',
    tag: 'Power user',
  },
  {
    id: 'writes',
    icon: 'rule',
    iconGradient: true,
    title: 'Approve writes',
    sub: 'Reads run instantly. Anything that changes data — CRM, drafts, sends — asks you first.',
    tag: 'Recommended',
  },
  {
    id: 'all',
    icon: 'lock',
    iconBg: T.success,
    title: 'Approve everything',
    sub: 'Safest. Even reads ask before they run. Good for sensitive workspaces.',
    tag: 'Maximum control',
  },
];

/**
 * AI permission-mode picker (onboarding mockup screen 04). 3 stacked cards;
 * the "Recommended" card is selected by default and shows the electric AI
 * border + filled check tile.
 */
export default function AiPermissions() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('writes');

  return (
    <Screen>
      <OnboardingHeader total={5} current={2} onBack={() => router.back()} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24 }}>
        <Text
          style={{
            fontSize: 26,
            fontWeight: '700',
            color: T.textPrimary,
            letterSpacing: -0.5,
            lineHeight: 31,
            marginBottom: 8,
          }}
        >
          How careful should it be?
        </Text>
        <Text style={{ fontSize: 14, color: T.textSecondary, lineHeight: 21, marginBottom: 22 }}>
          Pick a default for when the assistant uses tools. You can change this anytime in Settings.
        </Text>

        {CARDS.map((c) => (
          <PermissionCard
            key={c.id}
            cfg={c}
            selected={mode === c.id}
            onPress={() => setMode(c.id)}
          />
        ))}

        <View
          style={{
            marginTop: 18,
            padding: 12,
            backgroundColor: T.bgCard,
            borderWidth: 1,
            borderColor: T.borderLight,
            borderRadius: 12,
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 10,
          }}
        >
          <MIcon name="info" size={18} color={T.textTertiary} />
          <Text style={{ flex: 1, fontSize: 12, color: T.textSecondary, lineHeight: 17 }}>
            Each tool shows you exactly what it'll do before it runs. You can revoke individual tools later.
          </Text>
        </View>
      </ScrollView>

      <View
        style={{
          paddingHorizontal: 24,
          paddingTop: 12,
          paddingBottom: 20,
          borderTopWidth: 1,
          borderTopColor: T.borderLight,
        }}
      >
        <PrimaryCTA
          icon="arrow_forward"
          label="Continue"
          onPress={() => router.push('/(auth)/notifications')}
        />
      </View>
    </Screen>
  );
}

function PermissionCard({
  cfg,
  selected,
  onPress,
}: {
  cfg: CardConfig;
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
        alignItems: 'flex-start',
        gap: 12,
        shadowColor: selected ? T.ai : 'transparent',
        shadowOpacity: selected ? 0.12 : 0,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 6 },
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: cfg.iconGradient ? undefined : cfg.iconBg,
        }}
      >
        {cfg.iconGradient ? (
          <LinearGradient
            {...linearGradientProps(Gradients.ai)}
            style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' }}
          >
            <MIcon name={cfg.icon} size={20} color="white" fill={1} />
          </LinearGradient>
        ) : (
          <MIcon name={cfg.icon} size={20} color="white" fill={1} />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
          <Text
            style={{ fontSize: 15, fontWeight: '600', color: T.textPrimary, letterSpacing: -0.15 }}
          >
            {cfg.title}
          </Text>
          <View
            style={{
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 4,
              backgroundColor: selected ? T.ai : T.bgSubtle,
            }}
          >
            <Text
              style={{
                fontSize: 9,
                fontWeight: '700',
                letterSpacing: 0.4,
                textTransform: 'uppercase',
                color: selected ? 'white' : T.textTertiary,
              }}
            >
              {cfg.tag}
            </Text>
          </View>
        </View>
        <Text style={{ fontSize: 12, color: T.textSecondary, lineHeight: 18 }}>{cfg.sub}</Text>
      </View>
      <View style={{ marginTop: 2 }}>
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
      </View>
    </Pressable>
  );
}
