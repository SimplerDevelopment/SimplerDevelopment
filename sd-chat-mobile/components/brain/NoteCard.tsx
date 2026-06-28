import { Pressable, Text, View } from 'react-native';

import { Chip, MIcon } from '@/components/atoms';
import type { BrainNote } from '@/lib/mock/brain';
import { T } from '@/lib/theme';

export type NoteCardProps = {
  note: BrainNote;
  onPress?: () => void;
};

/**
 * List row for a Brain note. Mirrors the "Recent" rows on screen 05 of
 * sd-chat-mockup.html: small icon tile + title + 2-line snippet + tag chips +
 * meta line.
 */
export function NoteCard({ note, onPress }: NoteCardProps) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: T.borderLight }}
      style={({ pressed }) => ({
        backgroundColor: pressed ? T.bgSubtle : 'transparent',
        flexDirection: 'row',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderBottomWidth: 0.5,
        borderBottomColor: T.borderLight,
      })}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          backgroundColor: T.aiTint,
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <MIcon name={note.icon} size={17} color={T.ai} fill={1} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 14,
            fontWeight: '600',
            color: T.textPrimary,
            letterSpacing: -0.15,
            marginBottom: 3,
          }}
        >
          {note.title}
        </Text>
        <Text
          numberOfLines={2}
          style={{
            fontSize: 12,
            color: T.textSecondary,
            lineHeight: 17,
            marginBottom: 6,
          }}
        >
          {note.excerpt}
        </Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 4,
            marginBottom: 4,
          }}
        >
          {note.tags.map((tag, i) => (
            <Chip
              key={tag}
              bg={i === 0 ? T.aiSoft : T.bgChip}
              color={i === 0 ? T.aiDark : T.textSecondary}
              fontSize={10}
            >
              {`#${tag}`}
            </Chip>
          ))}
        </View>
        {note.meta ? (
          <Text style={{ fontSize: 10, color: T.textTertiary, fontWeight: '500' }}>
            {note.meta}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default NoteCard;
