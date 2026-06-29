import { Text, View } from 'react-native';

import { AiAvatar, Avatar, Bubble, Chip } from '@/components/atoms';
import { T } from '@/lib/theme';

export type MessageBubbleProps = {
  kind: 'user' | 'other' | 'ai';
  text: string;
  authorName?: string;
  authorAvatarId?: number;
  time?: string;
  /** Whether this is the last bubble in a run (controls the tail). */
  tail?: boolean;
  /** Renders an extra "AI" pill next to the author name for ai messages. */
  aiPill?: boolean;
};

/**
 * MessageBubble — wraps the Bubble atom to add an avatar, author name, and
 * the small per-bubble layout the mockup uses. Variants:
 *
 *  - user  → right-aligned, AI gradient fill (delegates to <Bubble variant="user">)
 *  - other → left-aligned, neutral grey fill, avatar + author name
 *  - ai    → left-aligned, soft indigo tint, AI avatar + "Assistant" + AI pill
 */
export function MessageBubble({
  kind,
  text,
  authorName,
  authorAvatarId,
  time,
  tail = true,
  aiPill,
}: MessageBubbleProps) {
  if (kind === 'user') {
    return (
      <View style={{ paddingHorizontal: 14, marginBottom: 10 }}>
        <Bubble variant="user" tail={tail}>
          {text}
        </Bubble>
        {time ? (
          <Text
            style={{
              alignSelf: 'flex-end',
              fontSize: 10,
              color: T.textTertiary,
              marginTop: 3,
              marginRight: 4,
            }}
          >
            {time}
          </Text>
        ) : null}
      </View>
    );
  }

  const showAvatar = tail; // bottom-most bubble in a run shows the avatar
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 8,
        paddingHorizontal: 14,
        marginBottom: 10,
      }}
    >
      <View style={{ width: 28, alignItems: 'center' }}>
        {showAvatar ? (
          kind === 'ai' ? (
            <AiAvatar size={28} ring={false} />
          ) : (
            <Avatar id={authorAvatarId ?? 7} size={28} />
          )
        ) : (
          <View style={{ width: 28, height: 28 }} />
        )}
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        {(authorName || aiPill) && tail ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              marginBottom: 3,
            }}
          >
            {authorName ? (
              <Text
                style={{
                  fontSize: 11,
                  color: T.textTertiary,
                  fontWeight: '500',
                }}
              >
                {authorName}
              </Text>
            ) : null}
            {aiPill ? (
              <Chip bg={T.aiSoft} color={T.aiDark} fontSize={8}>
                AI
              </Chip>
            ) : null}
          </View>
        ) : null}

        <Bubble variant={kind} tail={tail}>
          {text}
        </Bubble>

        {time && tail ? (
          <Text
            style={{
              fontSize: 10,
              color: T.textTertiary,
              marginTop: 3,
              marginLeft: 4,
            }}
          >
            {time}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export default MessageBubble;
