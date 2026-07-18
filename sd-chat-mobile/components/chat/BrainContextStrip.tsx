import { Pressable, Text, View } from 'react-native';

import { MIcon } from '@/components/atoms';
import { T } from '@/lib/theme';

export type BrainContextItem = {
  /** Plural label, e.g. "notes" / "decisions" / "deals". */
  label: string;
  count: number;
};

export type BrainContextStripProps = {
  items?: BrainContextItem[];
  onTune?: () => void;
};

const DEFAULT: BrainContextItem[] = [
  { label: 'notes', count: 3 },
  { label: 'decisions', count: 2 },
  { label: 'deals', count: 1 },
];

/**
 * "Using 3 notes · 2 decisions · 1 deal" strip that sits below the chat
 * header on AI 1-on-1 chats. Tapping the tune icon will eventually pop the
 * context-picker bottom-sheet — Phase 2 just exposes the onTune callback.
 */
export function BrainContextStrip({
  items = DEFAULT,
  onTune,
}: BrainContextStripProps) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: T.aiTint,
        borderBottomWidth: 1,
        borderBottomColor: T.aiBorder,
      }}
    >
      <MIcon name="hub" size={14} color={T.ai} />
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <Text style={{ fontSize: 11, color: T.aiDark, fontWeight: '500' }}>
          Using{' '}
        </Text>
        {items.map((it, i) => (
          <Text
            key={it.label}
            style={{ fontSize: 11, color: T.aiDark, fontWeight: '500' }}
          >
            <Text style={{ fontWeight: '700' }}>
              {it.count} {it.label}
            </Text>
            {i < items.length - 1 ? ' · ' : ''}
          </Text>
        ))}
      </View>
      <Pressable
        onPress={onTune}
        hitSlop={8}
        accessibilityLabel="Adjust brain context"
      >
        <MIcon name="tune" size={14} color={T.ai} />
      </Pressable>
    </View>
  );
}

export default BrainContextStrip;
