import { Pressable, Text, View } from 'react-native';

import { T } from '@/lib/theme';
import { PageDots } from './PageDots';

export type OnboardingHeaderProps = {
  total: number;
  current: number;
  onBack?: () => void;
  onSkip?: () => void;
  /** Optional left-side identity strip ("demo@example.com" + avatar). */
  left?: React.ReactNode;
};

/**
 * Common onboarding header: 3-column layout with optional Back / page-dots /
 * Skip. When `left` is provided (workspace pick uses it for the email pill),
 * Back/Skip are hidden so the row reads identity + progress.
 */
export function OnboardingHeader({
  total,
  current,
  onBack,
  onSkip,
  left,
}: OnboardingHeaderProps) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 8,
        paddingBottom: 4,
        minHeight: 32,
      }}
    >
      {left ? (
        <View>{left}</View>
      ) : onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={8}
          style={{ padding: 4, minWidth: 44 }}
        >
          <Text style={{ color: T.textTertiary, fontSize: 13, fontWeight: '500' }}>
            Back
          </Text>
        </Pressable>
      ) : (
        <View style={{ width: 44 }} />
      )}

      <PageDots total={total} current={current} />

      {onSkip ? (
        <Pressable
          onPress={onSkip}
          hitSlop={8}
          style={{ padding: 4, minWidth: 44, alignItems: 'flex-end' }}
        >
          <Text style={{ color: T.textTertiary, fontSize: 13, fontWeight: '500' }}>
            Skip
          </Text>
        </Pressable>
      ) : (
        <View style={{ width: 44 }} />
      )}
    </View>
  );
}

export default OnboardingHeader;
