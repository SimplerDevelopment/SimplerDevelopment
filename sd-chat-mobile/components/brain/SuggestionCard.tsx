import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View } from 'react-native';

import { MIcon } from '@/components/atoms';
import type { BrainSuggestion } from '@/lib/mock/brain';
import { Gradients, T, linearGradientProps } from '@/lib/theme';

export type SuggestionCardProps = {
  suggestion: BrainSuggestion;
  onPrimary?: () => void;
  onSecondary?: () => void;
};

/**
 * "While you're here" suggestion card — colored accent strip down the left
 * side, eyebrow + title + body, and two action buttons (primary brand/AI
 * gradient, secondary outline).
 */
export function SuggestionCard({
  suggestion: c,
  onPrimary,
  onSecondary,
}: SuggestionCardProps) {
  const eyebrowColor = c.gradient ? T.aiDark : c.accent;

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: T.bgCard,
        borderRadius: 14,
        overflow: 'hidden',
        borderWidth: 0.5,
        borderColor: T.rowDivider,
        shadowColor: '#000',
        shadowOpacity: 0.03,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
      }}
    >
      {/* Accent strip — gradient when c.gradient is true, solid otherwise. */}
      {c.gradient ? (
        <LinearGradient
          {...linearGradientProps(Gradients.ai)}
          style={{ width: 5, alignSelf: 'stretch' }}
        />
      ) : (
        <View
          style={{ width: 5, alignSelf: 'stretch', backgroundColor: c.accent }}
        />
      )}

      <View style={{ flex: 1, padding: 12 }}>
        {/* Icon tile + eyebrow */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 7,
            marginBottom: 5,
          }}
        >
          {c.gradient ? (
            <View style={{ borderRadius: 6, overflow: 'hidden' }}>
              <LinearGradient
                {...linearGradientProps(Gradients.ai)}
                style={{
                  width: 22,
                  height: 22,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MIcon name={c.icon} size={13} color="white" fill={1} />
              </LinearGradient>
            </View>
          ) : (
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                backgroundColor: c.bg,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MIcon name={c.icon} size={13} color={c.accent} fill={1} />
            </View>
          )}
          <Text
            style={{
              fontSize: 10,
              fontWeight: '700',
              letterSpacing: 0.5,
              color: eyebrowColor,
              textTransform: 'uppercase',
            }}
          >
            {c.eyebrow}
          </Text>
        </View>

        <Text
          style={{
            fontSize: 13.5,
            color: T.textPrimary,
            fontWeight: '600',
            letterSpacing: -0.15,
            lineHeight: 18,
          }}
        >
          {c.title}
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: T.textSecondary,
            marginTop: 4,
            lineHeight: 17,
          }}
        >
          {c.body}
        </Text>

        <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
          <PrimaryButton
            label={c.cta1}
            gradient={c.gradient}
            onPress={onPrimary}
          />
          <SecondaryButton label={c.cta2} onPress={onSecondary} />
        </View>
      </View>
    </View>
  );
}

function PrimaryButton({
  label,
  gradient,
  onPress,
}: {
  label: string;
  gradient?: boolean;
  onPress?: () => void;
}) {
  if (gradient) {
    return (
      <Pressable onPress={onPress} style={{ borderRadius: 999, overflow: 'hidden' }}>
        <LinearGradient
          {...linearGradientProps(Gradients.ai)}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: 'white', fontSize: 11.5, fontWeight: '600' }}>
            {label}
          </Text>
        </LinearGradient>
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: T.brand,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
      }}
    >
      <Text style={{ color: 'white', fontSize: 11.5, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}

function SecondaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: T.bgCard,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: T.border,
        paddingHorizontal: 12,
        paddingVertical: 6,
      }}
    >
      <Text style={{ color: T.textPrimary, fontSize: 11.5, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}

export default SuggestionCard;
