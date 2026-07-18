import { SafeAreaView, View, type ViewStyle } from 'react-native';

import { T } from '@/lib/theme';

export type ScreenProps = {
  children: React.ReactNode;
  style?: ViewStyle;
  bg?: string;
};

export function Screen({ children, style, bg = T.bgApp }: ScreenProps) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <View style={[{ flex: 1 }, style]}>{children}</View>
    </SafeAreaView>
  );
}

export default Screen;
