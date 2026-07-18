import { useEffect, useRef } from 'react';
import { Animated, Pressable } from 'react-native';

import { T } from '@/lib/theme';

export type ToggleProps = {
  value: boolean;
  onChange?: (next: boolean) => void;
  accent?: string;
  disabled?: boolean;
};

/**
 * iOS-style toggle. Uses RN's stock Animated (not reanimated) so it has zero
 * worklet/runtime baggage. 200ms slide matches the mockup transition.
 */
export function Toggle({ value, onChange, accent = T.ai, disabled }: ToggleProps) {
  const slide = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: value ? 1 : 0,
      duration: 200,
      useNativeDriver: false, // animating bg color + left position
    }).start();
  }, [value, slide]);

  const trackBg = slide.interpolate({
    inputRange: [0, 1],
    outputRange: ['#D9DCE4', accent],
  });
  const knobLeft = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 20],
  });

  return (
    <Pressable
      onPress={() => !disabled && onChange?.(!value)}
      disabled={disabled}
      hitSlop={8}
    >
      <Animated.View
        style={{
          width: 44,
          height: 26,
          borderRadius: 13,
          backgroundColor: trackBg,
          opacity: disabled ? 0.5 : 1,
          shadowColor: value ? accent : 'transparent',
          shadowOpacity: value ? 0.4 : 0,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 1 },
        }}
      >
        <Animated.View
          style={{
            position: 'absolute',
            top: 2,
            left: knobLeft,
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: '#FFFFFF',
            shadowColor: '#000',
            shadowOpacity: 0.18,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 1 },
            elevation: 2,
          }}
        />
      </Animated.View>
    </Pressable>
  );
}

export default Toggle;
