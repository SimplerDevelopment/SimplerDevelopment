import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { MIcon, Toggle } from '@/components/atoms';
import { Group, GroupLabel, PushedNav, SettingsRow } from '@/components/settings';
import { Screen } from '@/components/ui';
import { Gradients, T, linearGradientProps } from '@/lib/theme';

type ThemeMode = 'light' | 'dark' | 'auto';

type AccentSwatch = {
  name: string;
  color: string;
  gradient?: boolean;
};

const ACCENTS: AccentSwatch[] = [
  { name: 'Indigo', color: T.ai, gradient: true },
  { name: 'Pink', color: '#FF2D92' },
  { name: 'Teal', color: '#0BB8B0' },
  { name: 'Amber', color: '#F59E0B' },
  { name: 'Forest', color: '#16A34A' },
  { name: 'Slate', color: '#475569' },
];

/**
 * Appearance settings (settings mockup screen 06). Theme cards (light/dark/
 * auto), accent swatches, text-size slider, density toggle, chat-appearance
 * preferences, and a live AI/user bubble preview.
 *
 * All state is local — Phase 3 will promote to a Zustand store that gates
 * the chat bubble color in real time.
 */
export default function AppearanceScreen() {
  const router = useRouter();
  const [theme, setTheme] = useState<ThemeMode>('auto');
  const [accent, setAccent] = useState('Indigo');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [tintAi, setTintAi] = useState(true);
  const [expandTools, setExpandTools] = useState(true);
  const [inlineStamps, setInlineStamps] = useState(false);

  return (
    <Screen>
      <PushedNav title="Appearance" onBack={() => router.back()} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }}>
        <GroupLabel mt={12}>Theme</GroupLabel>
        <View
          style={{
            marginHorizontal: 16,
            flexDirection: 'row',
            gap: 10,
          }}
        >
          {(['light', 'dark', 'auto'] as ThemeMode[]).map((t) => (
            <ThemeCard
              key={t}
              mode={t}
              selected={theme === t}
              onPress={() => setTheme(t)}
            />
          ))}
        </View>

        <GroupLabel>Accent color</GroupLabel>
        <View
          style={{
            marginHorizontal: 16,
            paddingVertical: 14,
            paddingHorizontal: 16,
            backgroundColor: T.bgCard,
            borderRadius: 14,
            flexDirection: 'row',
            justifyContent: 'space-between',
          }}
        >
          {ACCENTS.map((a) => {
            const selected = accent === a.name;
            return (
              <Pressable
                key={a.name}
                onPress={() => setAccent(a.name)}
                style={{ alignItems: 'center', gap: 6 }}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    overflow: 'hidden',
                    backgroundColor: a.gradient ? undefined : a.color,
                    borderWidth: selected ? 3 : 0,
                    borderColor: 'white',
                    shadowColor: selected ? T.ai : 'transparent',
                    shadowOpacity: selected ? 1 : 0,
                    shadowRadius: 0,
                    shadowOffset: { width: 0, height: 0 },
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {a.gradient ? (
                    <LinearGradient
                      {...linearGradientProps(Gradients.ai)}
                      style={{
                        flex: 1,
                        width: '100%',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {selected ? <MIcon name="check" size={16} color="white" /> : null}
                    </LinearGradient>
                  ) : selected ? (
                    <MIcon name="check" size={16} color="white" />
                  ) : null}
                </View>
                <Text
                  style={{
                    fontSize: 9,
                    color: T.textTertiary,
                    fontWeight: '500',
                    letterSpacing: 0.2,
                  }}
                >
                  {a.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <GroupLabel>Text size</GroupLabel>
        <Group>
          <View style={{ padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={{ fontSize: 13, color: T.textTertiary, fontWeight: '600' }}>A</Text>
              <View
                style={{
                  flex: 1,
                  position: 'relative',
                  height: 4,
                  backgroundColor: T.bgSubtle,
                  borderRadius: 2,
                }}
              >
                <View
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: '62%',
                    backgroundColor: T.ai,
                    borderRadius: 2,
                  }}
                />
                <View
                  style={{
                    position: 'absolute',
                    left: '62%',
                    top: -9,
                    marginLeft: -11,
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: 'white',
                    shadowColor: '#000',
                    shadowOpacity: 0.18,
                    shadowRadius: 4,
                    shadowOffset: { width: 0, height: 1 },
                    elevation: 2,
                  }}
                />
              </View>
              <Text style={{ fontSize: 20, color: T.textTertiary, fontWeight: '600' }}>A</Text>
            </View>
            <Text
              style={{
                fontSize: 11,
                color: T.textTertiary,
                marginTop: 10,
                textAlign: 'center',
                letterSpacing: 0.3,
              }}
            >
              Standard · respects iOS Dynamic Type
            </Text>
          </View>
        </Group>

        <GroupLabel>Density</GroupLabel>
        <View
          style={{
            marginHorizontal: 16,
            padding: 4,
            backgroundColor: T.bgCard,
            borderRadius: 14,
            flexDirection: 'row',
            gap: 4,
          }}
        >
          {(['comfortable', 'compact'] as const).map((d) => {
            const sel = density === d;
            return (
              <Pressable
                key={d}
                onPress={() => setDensity(d)}
                style={{ flex: 1, borderRadius: 11, overflow: 'hidden' }}
              >
                {sel ? (
                  <LinearGradient
                    {...linearGradientProps(Gradients.ai)}
                    style={{ paddingVertical: 10, alignItems: 'center' }}
                  >
                    <Text
                      style={{
                        color: 'white',
                        fontSize: 14,
                        fontWeight: '600',
                        letterSpacing: -0.1,
                      }}
                    >
                      {d === 'comfortable' ? 'Comfortable' : 'Compact'}
                    </Text>
                  </LinearGradient>
                ) : (
                  <View style={{ paddingVertical: 10, alignItems: 'center' }}>
                    <Text
                      style={{
                        color: T.textSecondary,
                        fontSize: 14,
                        fontWeight: '600',
                        letterSpacing: -0.1,
                      }}
                    >
                      {d === 'comfortable' ? 'Comfortable' : 'Compact'}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        <GroupLabel>Chat appearance</GroupLabel>
        <Group>
          <SettingsRow
            icon="auto_awesome"
            iconGradient={Gradients.ai}
            iconFill={1}
            title="Tint AI message bubbles"
            accessory={<Toggle value={tintAi} onChange={setTintAi} />}
          />
          <SettingsRow
            icon="unfold_more"
            iconBg={T.iosBlue}
            iconFill={1}
            title="Show tool cards expanded"
            accessory={<Toggle value={expandTools} onChange={setExpandTools} />}
          />
          <SettingsRow
            icon="schedule"
            iconBg={T.iosTeal}
            iconFill={1}
            title="Show timestamps inline"
            accessory={<Toggle value={inlineStamps} onChange={setInlineStamps} />}
            last
          />
        </Group>

        <GroupLabel>Preview</GroupLabel>
        <View style={{ marginHorizontal: 16, backgroundColor: T.bgCard, borderRadius: 14, padding: 14 }}>
          {/* AI bubble */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              <LinearGradient
                {...linearGradientProps(Gradients.ai)}
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
              >
                <MIcon name="auto_awesome" size={12} color="white" fill={1} />
              </LinearGradient>
            </View>
            <View
              style={{
                flex: 1,
                paddingHorizontal: 12,
                paddingVertical: 8,
                backgroundColor: tintAi ? T.aiTint : T.bgSubtle,
                borderWidth: 1,
                borderColor: tintAi ? T.aiBorder : T.borderLight,
                borderTopLeftRadius: 4,
                borderTopRightRadius: 14,
                borderBottomLeftRadius: 14,
                borderBottomRightRadius: 14,
              }}
            >
              <Text style={{ fontSize: 12, color: T.textPrimary, lineHeight: 18 }}>
                I drafted the Q2 nurture email — ready when you are.
              </Text>
            </View>
          </View>
          {/* User bubble */}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
            <View
              style={{
                maxWidth: '78%',
                backgroundColor: T.brand,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderTopLeftRadius: 14,
                borderTopRightRadius: 14,
                borderBottomLeftRadius: 14,
                borderBottomRightRadius: 4,
              }}
            >
              <Text style={{ color: 'white', fontSize: 12, lineHeight: 18 }}>
                Push it to staging when you have a sec.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

function ThemeCard({
  mode,
  selected,
  onPress,
}: {
  mode: ThemeMode;
  selected: boolean;
  onPress: () => void;
}) {
  const labels: Record<ThemeMode, string> = { light: 'Light', dark: 'Dark', auto: 'Auto' };
  const bg = mode === 'light' ? '#FFFFFF' : mode === 'dark' ? '#0F1015' : undefined;
  const sub = mode === 'light' ? '#F5F5F4' : mode === 'dark' ? '#18181B' : '#A8A29E';

  return (
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      <View
        style={{
          aspectRatio: 0.78,
          borderRadius: 12,
          borderWidth: selected ? 2.5 : 1,
          borderColor: selected ? T.ai : T.border,
          padding: 8,
          backgroundColor: bg ?? '#FFFFFF',
          gap: 4,
          overflow: 'hidden',
        }}
      >
        {mode === 'auto' ? (
          // Diagonal split using a dark wedge on top of the white background
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            <View
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: '100%',
                height: '100%',
                backgroundColor: '#0F1015',
                transform: [{ translateX: 60 }, { rotate: '-45deg' }, { scale: 2 }],
              }}
            />
          </View>
        ) : null}
        <View style={{ position: 'relative', gap: 4 }}>
          <View style={{ height: 8, borderRadius: 2, backgroundColor: sub, width: '60%' }} />
          <View style={{ height: 6, borderRadius: 2, backgroundColor: sub, width: '85%' }} />
          <View style={{ height: 6, borderRadius: 2, backgroundColor: sub, width: '70%' }} />
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ position: 'relative', alignItems: 'flex-end' }}>
          <View style={{ height: 10, borderRadius: 4, width: '40%', overflow: 'hidden' }}>
            <LinearGradient
              {...linearGradientProps(Gradients.ai)}
              style={{ flex: 1 }}
            />
          </View>
        </View>
        {selected ? (
          <View
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: T.ai,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MIcon name="check" size={12} color="white" />
          </View>
        ) : null}
      </View>
      <Text
        style={{
          textAlign: 'center',
          fontSize: 12,
          color: selected ? T.ai : T.textSecondary,
          marginTop: 7,
          fontWeight: selected ? '600' : '500',
        }}
      >
        {labels[mode]}
      </Text>
    </Pressable>
  );
}
