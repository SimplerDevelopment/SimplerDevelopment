import { Pressable, Text, View } from 'react-native';

import { MIcon } from '@/components/atoms';
import { T } from '@/lib/theme';

export type PushedNavProps = {
  title: string;
  backLabel?: string;
  onBack?: () => void;
  /** Right-side accessory (e.g. a button). */
  right?: React.ReactNode;
};

/**
 * iOS-style "pushed" detail nav bar: chevron + back-label on the left, centered
 * title, optional right accessory. Used on every settings sub-screen.
 */
export function PushedNav({
  title,
  backLabel = 'Settings',
  onBack,
  right,
}: PushedNavProps) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingTop: 4,
        paddingBottom: 10,
        borderBottomWidth: 0.5,
        borderBottomColor: T.rowDivider,
        backgroundColor: T.bgApp,
      }}
    >
      <Pressable
        onPress={onBack}
        hitSlop={8}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          padding: 6,
          minWidth: 90,
        }}
      >
        <MIcon name="chevron_left" size={26} color={T.ai} />
        <Text style={{ color: T.ai, fontSize: 14, marginLeft: -2 }}>
          {backLabel}
        </Text>
      </Pressable>

      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 15,
            fontWeight: '600',
            color: T.textPrimary,
            letterSpacing: -0.1,
          }}
        >
          {title}
        </Text>
      </View>

      <View
        style={{
          minWidth: 90,
          alignItems: 'flex-end',
          paddingRight: 6,
        }}
      >
        {right}
      </View>
    </View>
  );
}

export default PushedNav;
