import { View, type ViewStyle } from 'react-native';

import { T } from '@/lib/theme';

export type CardProps = {
  children: React.ReactNode;
  style?: ViewStyle;
  padded?: boolean;
};

export function Card({ children, style, padded = true }: CardProps) {
  return (
    <View
      style={[
        {
          backgroundColor: T.bgCard,
          borderRadius: 14,
          marginHorizontal: 16,
          padding: padded ? 16 : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export default Card;
