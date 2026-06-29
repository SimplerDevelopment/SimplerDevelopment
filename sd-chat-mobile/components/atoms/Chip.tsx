import { Text, View, type ViewStyle } from 'react-native';

import { T } from '@/lib/theme';

export type ChipProps = {
  children: string;
  color?: string;
  bg?: string;
  fontSize?: number;
  style?: ViewStyle;
};

export function Chip({
  children,
  color = T.textSecondary,
  bg = T.bgChip,
  fontSize = 10,
  style,
}: ChipProps) {
  return (
    <View
      style={[
        {
          paddingVertical: 3,
          paddingHorizontal: 8,
          borderRadius: 999,
          backgroundColor: bg,
          alignSelf: 'flex-start',
        },
        style,
      ]}
    >
      <Text
        style={{
          color,
          fontSize,
          fontWeight: '500',
          letterSpacing: 0.1,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

export default Chip;
