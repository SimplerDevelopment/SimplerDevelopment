import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { MIcon } from '@/components/atoms';
import { Gradients, T, linearGradientProps } from '@/lib/theme';

const BAR_COUNT = 24;
const MONO = 'Menlo';

/**
 * Voice mode full-screen takeover. AI gradient background, animated circular
 * waveform around a glowing orb, live transcript card, stop button → back.
 *
 * The waveform is animated by a `setInterval` regenerating per-bar heights
 * every 120ms. This is intentionally cheap (no reanimated worklets) — we
 * accept some jank in exchange for zero shared-value plumbing for Phase 2.
 */
export default function VoiceModeScreen() {
  const router = useRouter();
  const [bars, setBars] = useState<number[]>(() => seedBars());
  const [elapsed, setElapsed] = useState(0);

  // Animate waveform
  useEffect(() => {
    const id = setInterval(() => {
      setBars(seedBars());
    }, 140);
    return () => clearInterval(id);
  }, []);

  // Tick timer
  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const minutes = Math.floor(elapsed / 60);
  const seconds = (elapsed % 60).toString().padStart(2, '0');

  return (
    <LinearGradient
      {...linearGradientProps(Gradients.ai)}
      style={{ flex: 1 }}
    >
      <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />
      {/* Soft ambient highlights */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -80,
          left: -80,
          width: 300,
          height: 300,
          borderRadius: 150,
          backgroundColor: 'rgba(255,255,255,0.08)',
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: -100,
          right: -80,
          width: 280,
          height: 280,
          borderRadius: 140,
          backgroundColor: 'rgba(255,255,255,0.06)',
        }}
      />

      {/* Top bar */}
      <View
        style={{
          paddingTop: 60,
          paddingHorizontal: 20,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Text
          style={{
            fontSize: 11,
            color: 'white',
            opacity: 0.85,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            fontWeight: '700',
          }}
        >
          Voice mode
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <MIcon name="fiber-manual-record" size={9} color="#FCA5A5" fill={1} />
          <Text
            style={{
              fontSize: 11,
              color: 'white',
              opacity: 0.85,
              fontWeight: '600',
            }}
          >
            Recording
          </Text>
        </View>
      </View>

      {/* Status */}
      <View style={{ alignItems: 'center', marginTop: 28 }}>
        <Text
          style={{
            fontSize: 24,
            fontWeight: '700',
            color: 'white',
            letterSpacing: -0.4,
          }}
        >
          Listening…
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: 'white',
            opacity: 0.85,
            marginTop: 4,
            fontFamily: MONO,
            letterSpacing: 0.5,
          }}
        >
          {minutes}:{seconds}
        </Text>
      </View>

      {/* Waveform ring + orb */}
      <View
        style={{
          alignSelf: 'center',
          width: 230,
          height: 230,
          marginTop: 20,
        }}
      >
        {bars.map((h, i) => {
          const angle = (i / BAR_COUNT) * 360;
          const op = 0.55 + Math.abs(Math.sin(i * 1.3)) * 0.4;
          return (
            <View
              key={i}
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: 4,
                height: h,
                borderRadius: 2,
                backgroundColor: 'white',
                opacity: op,
                transform: [
                  { translateX: -2 },
                  { translateY: -h / 2 },
                  { rotate: `${angle}deg` },
                  { translateY: -86 },
                ],
              }}
            />
          );
        })}

        {/* Central orb */}
        <View
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            marginLeft: -40,
            marginTop: -40,
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: 'rgba(255,255,255,0.16)',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: 'white',
            shadowOpacity: 0.5,
            shadowRadius: 30,
            shadowOffset: { width: 0, height: 0 },
            elevation: 8,
          }}
        >
          <MIcon name="auto_awesome" size={36} color="white" fill={1} />
        </View>
      </View>

      {/* Live transcript */}
      <View
        style={{
          marginHorizontal: 20,
          marginTop: 24,
          backgroundColor: 'rgba(255,255,255,0.92)',
          borderRadius: 16,
          paddingVertical: 14,
          paddingHorizontal: 16,
          shadowColor: '#0F172A',
          shadowOpacity: 0.18,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 8 },
          elevation: 6,
        }}
      >
        <Text
          style={{
            fontSize: 9.5,
            color: T.aiDark,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            fontWeight: '700',
            marginBottom: 6,
          }}
        >
          Live transcript
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: T.textPrimary,
            lineHeight: 21,
            letterSpacing: -0.1,
          }}
        >
          Create a deal for Acme Industries — they want the audit package, around{' '}
          <Text style={{ color: T.textTertiary }}>forty thousand…</Text>
        </Text>
      </View>

      {/* Tool chips */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 7,
          marginTop: 12,
          paddingHorizontal: 20,
          flexWrap: 'wrap',
        }}
      >
        <ToolChip name="crm_deals_create" />
        <ToolChip name="crm_contacts_search" />
      </View>

      {/* Controls */}
      <View style={{ flex: 1 }} />
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 32,
          paddingHorizontal: 20,
          paddingTop: 18,
          paddingBottom: 8,
        }}
      >
        <CircleButton icon="pause" onPress={() => {}} />

        <Pressable
          onPress={() => router.back()}
          accessibilityLabel="Stop and send"
          style={{
            width: 78,
            height: 78,
            borderRadius: 39,
            backgroundColor: 'white',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.25,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
            elevation: 8,
          }}
        >
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 4,
              backgroundColor: T.ai,
            }}
          />
        </Pressable>

        <CircleButton icon="close" onPress={() => router.back()} />
      </View>
      <Text
        style={{
          textAlign: 'center',
          fontSize: 11,
          color: 'white',
          opacity: 0.75,
          paddingHorizontal: 20,
          paddingTop: 4,
          paddingBottom: 28,
          letterSpacing: 0.1,
        }}
      >
        Tap stop to send · Speak naturally — I&apos;ll handle the rest
      </Text>
    </LinearGradient>
  );
}

function ToolChip({ name }: { name: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 5,
        backgroundColor: 'rgba(255,255,255,0.16)',
        borderRadius: 999,
      }}
    >
      <MIcon name="build" size={12} color="white" fill={1} />
      <Text
        style={{
          fontSize: 10.5,
          fontFamily: MONO,
          color: 'white',
          letterSpacing: 0.2,
        }}
      >
        {name}
      </Text>
    </View>
  );
}

function CircleButton({
  icon,
  onPress,
}: {
  icon: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: 'rgba(255,255,255,0.18)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <MIcon name={icon} size={24} color="white" fill={1} />
    </Pressable>
  );
}

function seedBars(): number[] {
  return Array.from({ length: BAR_COUNT }).map(
    (_, i) =>
      18 +
      Math.abs(Math.sin(i * 0.9 + Math.random() * 2)) * 38 +
      (i % 3) * 6 +
      Math.random() * 6,
  );
}
