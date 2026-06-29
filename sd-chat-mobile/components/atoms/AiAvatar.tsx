import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';

import { Gradients, T, linearGradientProps } from '@/lib/theme';
import { MIcon } from './MIcon';
import { SdLogo } from './SdLogo';

export type AiAvatarProps = {
  size?: number;
  /** Adds a white ring + drop shadow (mirrors the mockup's primary AI avatar). */
  ring?: boolean;
  /**
   * Render the SimplerDevelopment `</>` brand mark instead of the assistant
   * sparkle, in the same gradient tile. Use on company/brand surfaces
   * (sign-in, onboarding chrome); leave off for the in-chat assistant avatar.
   */
  logo?: boolean;
};

export function AiAvatar({ size = 36, ring = true, logo = false }: AiAvatarProps) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        // ring/shadow approximated via a wrapping View with platform shadow
        // when ring=true. The actual gradient is the inner LinearGradient.
        ...(ring
          ? {
              shadowColor: T.ai,
              shadowOpacity: 0.32,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 6 },
              elevation: 4,
              borderWidth: 2,
              borderColor: T.bgCard,
            }
          : {}),
      }}
    >
      <LinearGradient
        {...linearGradientProps(Gradients.ai)}
        style={{
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {logo ? (
          <SdLogo size={Math.round(size * 0.46)} color="white" />
        ) : (
          <MIcon name="auto_awesome" size={Math.round(size * 0.5)} color="white" fill={1} />
        )}
      </LinearGradient>
    </View>
  );
}

export default AiAvatar;
