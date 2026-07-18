import { Pressable, Text } from 'react-native';

import { T } from '@/lib/theme';

export type FilterChipProps = {
  label: string;
  count?: string | number;
  active?: boolean;
  onPress?: () => void;
};

/**
 * Pill-shaped media library filter chip. Active state inverts to brand fill
 * and lightens the count badge — mirrors screen 06 of sd-chat-mockup.html.
 */
export function FilterChip({ label, count, active, onPress }: FilterChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: active ? T.brand : T.bgCard,
        borderWidth: active ? 0 : 1,
        borderColor: T.border,
      }}
    >
      <Text
        style={{
          color: active ? 'white' : T.textSecondary,
          fontSize: 12,
          fontWeight: '600',
        }}
      >
        {label}
      </Text>
      {count != null ? (
        <Text
          style={{
            fontSize: 10,
            color: active ? 'rgba(255,255,255,0.7)' : T.textTertiary,
            fontWeight: '500',
          }}
        >
          {count}
        </Text>
      ) : null}
    </Pressable>
  );
}

export default FilterChip;
