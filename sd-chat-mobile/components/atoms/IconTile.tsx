import { LinearGradient } from 'expo-linear-gradient';
import { View, type ViewStyle } from 'react-native';

import { T, type GradientTuple, linearGradientProps } from '@/lib/theme';
import { MIcon, type MIconProps } from './MIcon';

export type IconTileProps = {
  name: MIconProps['name'];
  bg?: string;
  color?: string;
  size?: number;
  iconSize?: number;
  fill?: 0 | 1;
  gradient?: GradientTuple;
  style?: ViewStyle;
};

/**
 * Rounded colored square containing a single icon — used heavily in settings
 * rows ("notifications" row prefix, etc.) and across the brain/composer
 * mockups.
 */
export function IconTile({
  name,
  bg = '#0A84FF',
  color = 'white',
  size = 30,
  iconSize = 18,
  fill = 0,
  gradient,
  style,
}: IconTileProps) {
  const base: ViewStyle = {
    width: size,
    height: size,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  };
  const shadow: ViewStyle = gradient
    ? {
        shadowColor: T.ai,
        shadowOpacity: 0.25,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      }
    : {};

  if (gradient) {
    return (
      <View style={[base, shadow, style]}>
        <LinearGradient
          {...linearGradientProps(gradient)}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MIcon name={name} size={iconSize} color={color} fill={fill} />
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={[base, { backgroundColor: bg }, style]}>
      <MIcon name={name} size={iconSize} color={color} fill={fill} />
    </View>
  );
}

export default IconTile;
