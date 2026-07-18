import { LinearGradient } from 'expo-linear-gradient';
import { Text, View, type ViewStyle } from 'react-native';

import { Gradients, T, linearGradientProps } from '@/lib/theme';

export type BubbleVariant = 'user' | 'other' | 'ai';

export type BubbleProps = {
  variant: BubbleVariant;
  children: string;
  /** Hides the "tail" corner when in the middle of a multi-bubble run. */
  tail?: boolean;
  style?: ViewStyle;
};

/**
 * Chat bubble. iMessage-style asymmetric rounding for tail vs no-tail variants.
 *  - user  = right-aligned, AI gradient fill
 *  - other = left-aligned, neutral grey fill
 *  - ai    = left-aligned, soft indigo tint + ai-border
 */
export function Bubble({ variant, children, tail = true, style }: BubbleProps) {
  const isRight = variant === 'user';

  const baseRadius = 18;
  const tailRadius = 4;

  const borderRadius = {
    borderTopLeftRadius: baseRadius,
    borderTopRightRadius: baseRadius,
    borderBottomLeftRadius: isRight ? baseRadius : tail ? tailRadius : baseRadius,
    borderBottomRightRadius: isRight ? (tail ? tailRadius : baseRadius) : baseRadius,
  };

  if (variant === 'user') {
    return (
      <View style={[{ alignSelf: 'flex-end', maxWidth: '80%' }, style]}>
        <LinearGradient
          {...linearGradientProps(Gradients.ai)}
          style={{
            paddingVertical: 9,
            paddingHorizontal: 14,
            ...borderRadius,
          }}
        >
          <Text style={{ color: 'white', fontSize: 15, lineHeight: 20 }}>
            {children}
          </Text>
        </LinearGradient>
      </View>
    );
  }

  const bg = variant === 'ai' ? T.aiSoft : T.bgChip;
  const fg = variant === 'ai' ? T.aiDark : T.textPrimary;
  const border = variant === 'ai' ? T.aiBorder : 'transparent';

  return (
    <View
      style={[
        {
          alignSelf: 'flex-start',
          maxWidth: '80%',
          backgroundColor: bg,
          borderWidth: variant === 'ai' ? 1 : 0,
          borderColor: border,
          paddingVertical: 9,
          paddingHorizontal: 14,
          ...borderRadius,
        },
        style,
      ]}
    >
      <Text style={{ color: fg, fontSize: 15, lineHeight: 20 }}>{children}</Text>
    </View>
  );
}

export default Bubble;
