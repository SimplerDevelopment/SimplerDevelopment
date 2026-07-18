import { Text, View, type ViewStyle } from 'react-native';

import { T } from '@/lib/theme';

export type LargeTitleProps = {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  style?: ViewStyle;
};

export function LargeTitle({ title, subtitle, right, style }: LargeTitleProps) {
  return (
    <View
      style={[
        {
          paddingTop: 4,
          paddingBottom: 14,
          paddingHorizontal: 20,
        },
        style,
      ]}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 36,
        }}
      >
        <Text
          style={{
            fontSize: 28,
            fontWeight: '700',
            letterSpacing: -0.5,
            color: T.textPrimary,
          }}
        >
          {title}
        </Text>
        {right}
      </View>
      {subtitle ? (
        <Text style={{ fontSize: 12, color: T.textSecondary, marginTop: 2 }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

export default LargeTitle;
