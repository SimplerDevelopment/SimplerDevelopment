import { Pressable, Text, View, type ViewStyle } from 'react-native';

import { IconTile, MIcon } from '@/components/atoms';
import { type GradientTuple, T } from '@/lib/theme';

export type SettingsRowProps = {
  /** Material Symbols name for the left icon tile. Omit for sub-rows. */
  icon?: string;
  iconBg?: string;
  iconColor?: string;
  iconGradient?: GradientTuple;
  iconFill?: 0 | 1;
  title: string;
  /** Custom color override (e.g. red for destructive Sign out). */
  titleColor?: string;
  /** Right-side hint, e.g. "3" or "Push on". */
  value?: string;
  valueColor?: string;
  /**
   * Right-side accessory. Default 'chevron'. Pass a React element to embed a
   * Toggle / Radio / custom node — they appear in the chevron slot.
   * Pass `null` to render no accessory.
   */
  accessory?: 'chevron' | 'check' | React.ReactElement | null;
  /** Suppress the bottom divider (use on last item in a Group). */
  last?: boolean;
  onPress?: () => void;
};

/**
 * Single iOS-grouped-table row used everywhere in Settings. Composes existing
 * atoms (IconTile, MIcon) — pass `accessory={<Toggle ... />}` etc for embedded
 * controls.
 *
 * Wrap a stack of these in <Group> for the rounded card + dividers, and
 * <GroupLabel> for the uppercase section header.
 */
export function SettingsRow({
  icon,
  iconBg,
  iconColor,
  iconGradient,
  iconFill = 0,
  title,
  titleColor,
  value,
  valueColor,
  accessory = 'chevron',
  last,
  onPress,
}: SettingsRowProps) {
  const inner = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 11,
        paddingHorizontal: 16,
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: T.rowDivider,
      }}
    >
      {icon ? (
        <IconTile
          name={icon}
          bg={iconBg ?? T.iosBlue}
          color={iconColor ?? 'white'}
          gradient={iconGradient}
          fill={iconFill}
        />
      ) : null}

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 15,
            color: titleColor ?? T.textPrimary,
            fontWeight: '400',
            letterSpacing: -0.1,
          }}
        >
          {title}
        </Text>
      </View>

      {value ? (
        <Text
          numberOfLines={1}
          style={{
            fontSize: 14,
            color: valueColor ?? T.textTertiary,
            fontWeight: '400',
          }}
        >
          {value}
        </Text>
      ) : null}

      {accessory === 'chevron' ? (
        <MIcon name="chevron_right" size={20} color={T.textTertiary} />
      ) : accessory === 'check' ? (
        <MIcon name="check" size={18} color={T.ai} />
      ) : accessory ? (
        accessory
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} android_ripple={{ color: T.borderLight }}>
        {({ pressed }) => (
          <View style={{ backgroundColor: pressed ? T.bgSubtle : 'transparent' }}>
            {inner}
          </View>
        )}
      </Pressable>
    );
  }
  return inner;
}

export type GroupProps = {
  children: React.ReactNode;
  mx?: number;
  style?: ViewStyle;
};

/** Rounded white card that wraps a column of <SettingsRow>s. */
export function Group({ children, mx = 16, style }: GroupProps) {
  return (
    <View
      style={[
        {
          marginHorizontal: mx,
          backgroundColor: T.bgCard,
          borderRadius: 14,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Uppercase section header above a Group. */
export function GroupLabel({
  children,
  mt = 24,
  mb = 7,
}: {
  children: React.ReactNode;
  mt?: number;
  mb?: number;
}) {
  return (
    <Text
      style={{
        paddingTop: mt,
        paddingBottom: mb,
        paddingHorizontal: 32,
        fontSize: 11,
        color: T.textTertiary,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        fontWeight: '600',
      }}
    >
      {children}
    </Text>
  );
}

/** Small grey paragraph below a Group (footnote / explainer). */
export function GroupFooter({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        paddingHorizontal: 32,
        paddingTop: 8,
        fontSize: 11,
        color: T.textTertiary,
        lineHeight: 16,
      }}
    >
      {children}
    </Text>
  );
}

export default SettingsRow;
