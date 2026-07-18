import { LinearGradient } from 'expo-linear-gradient';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { MIcon } from '@/components/atoms';
import { Gradients, T, linearGradientProps } from '@/lib/theme';

export type MessageActionsProps = {
  visible: boolean;
  onClose: () => void;
  /** The message text being acted on — shown faintly at the top for context. */
  targetText?: string;
  onAction?: (id: string) => void;
};

type Reaction = { id: string; icon: string; color: string };

const REACTIONS: Reaction[] = [
  { id: 'thumb_up', icon: 'thumb-up', color: T.iosBlue },
  { id: 'favorite', icon: 'favorite', color: T.iosRed },
  { id: 'celebration', icon: 'celebration', color: T.iosOrange },
  { id: 'lightbulb', icon: 'lightbulb', color: T.iosYellow },
  { id: 'priority_high', icon: 'priority-high', color: T.iosPurple },
  { id: 'add_reaction', icon: 'add-reaction', color: T.textSecondary },
];

type Row = {
  id: string;
  icon: string;
  label: string;
  destructive?: boolean;
  aiTint?: boolean;
  aiIcon?: boolean;
};

const GROUP_STANDARD: Row[] = [
  { id: 'reply', icon: 'reply', label: 'Reply' },
  { id: 'forward', icon: 'forward', label: 'Forward' },
  { id: 'quote', icon: 'format_quote', label: 'Quote' },
  { id: 'copy', icon: 'content-copy', label: 'Copy text' },
];

const GROUP_AI: Row[] = [
  { id: 'task', icon: 'task-alt', label: 'Convert to task', aiTint: true },
  { id: 'decision', icon: 'gavel', label: 'Record as decision', aiTint: true },
  { id: 'brain', icon: 'bookmark', label: 'Save to Brain', aiTint: true },
  {
    id: 'follow_up',
    icon: 'auto_awesome',
    label: 'Ask the AI to follow up',
    aiTint: true,
    aiIcon: true,
  },
];

const GROUP_WORKSPACE: Row[] = [
  { id: 'pin', icon: 'push_pin', label: 'Pin to channel' },
  { id: 'unread', icon: 'mark-email-unread', label: 'Mark unread' },
  { id: 'bookmark', icon: 'bookmark-add', label: 'Bookmark' },
  { id: 'report', icon: 'flag', label: 'Report' },
];

const GROUP_DESTRUCTIVE: Row[] = [
  { id: 'delete', icon: 'delete', label: 'Delete', destructive: true },
];

/**
 * Long-press context menu. Reactions row + Standard / "Send to assistant" /
 * Workspace / Destructive groups. Pure visual demo — onAction is forwarded
 * so the chat screen can console.log or wire later.
 */
export function MessageActions({
  visible,
  onClose,
  targetText,
  onAction,
}: MessageActionsProps) {
  const handle = (id: string) => {
    onAction?.(id);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(11,15,25,0.55)',
          justifyContent: 'flex-start',
          paddingTop: 100,
          paddingHorizontal: 14,
        }}
      >
        {targetText ? (
          <View
            style={{
              alignSelf: 'flex-start',
              maxWidth: '85%',
              backgroundColor: T.bgCard,
              borderRadius: 16,
              paddingVertical: 9,
              paddingHorizontal: 13,
              marginBottom: 12,
            }}
          >
            <Text
              numberOfLines={3}
              style={{ fontSize: 13, color: T.textPrimary, lineHeight: 18 }}
            >
              {targetText}
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: T.bgCard,
            borderRadius: 14,
            overflow: 'hidden',
            shadowColor: '#000',
            shadowOpacity: 0.35,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 18 },
            elevation: 12,
            maxHeight: '70%',
          }}
        >
          {/* Reactions */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-around',
              alignItems: 'center',
              paddingVertical: 10,
              paddingHorizontal: 8,
              borderBottomWidth: 0.5,
              borderBottomColor: T.rowDivider,
            }}
          >
            {REACTIONS.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => handle(`react:${r.id}`)}
                style={({ pressed }) => ({
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: pressed ? T.bgChip : T.bgSubtle,
                  alignItems: 'center',
                  justifyContent: 'center',
                })}
              >
                <MIcon name={r.icon} size={17} color={r.color} fill={1} />
              </Pressable>
            ))}
          </View>

          <ScrollView>
            {GROUP_STANDARD.map((row, i) => (
              <ContextRow
                key={row.id}
                row={row}
                last={i === GROUP_STANDARD.length - 1}
                onPress={() => handle(row.id)}
              />
            ))}

            {/* AI group header */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 14,
                paddingTop: 8,
                paddingBottom: 4,
                backgroundColor: T.aiTint,
                borderTopWidth: 0.5,
                borderTopColor: T.aiBorder,
              }}
            >
              <MIcon name="auto_awesome" size={11} color={T.aiDark} fill={1} />
              <Text
                style={{
                  fontSize: 9.5,
                  color: T.aiDark,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  fontWeight: '700',
                }}
              >
                Send to assistant
              </Text>
            </View>
            {GROUP_AI.map((row, i) => (
              <ContextRow
                key={row.id}
                row={row}
                last={i === GROUP_AI.length - 1}
                onPress={() => handle(row.id)}
              />
            ))}

            <View style={{ height: 0.5, backgroundColor: T.rowDivider }} />
            {GROUP_WORKSPACE.map((row, i) => (
              <ContextRow
                key={row.id}
                row={row}
                last={i === GROUP_WORKSPACE.length - 1}
                onPress={() => handle(row.id)}
              />
            ))}

            <View style={{ height: 0.5, backgroundColor: T.rowDivider }} />
            {GROUP_DESTRUCTIVE.map((row) => (
              <ContextRow
                key={row.id}
                row={row}
                last
                onPress={() => handle(row.id)}
              />
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ContextRow({
  row,
  last,
  onPress,
}: {
  row: Row;
  last: boolean;
  onPress: () => void;
}) {
  const color = row.destructive
    ? T.danger
    : row.aiTint
      ? T.textPrimary
      : T.textPrimary;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 11,
        paddingHorizontal: 14,
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: T.rowDivider,
        backgroundColor: pressed
          ? T.bgChip
          : row.aiTint
            ? T.aiTint
            : 'transparent',
      })}
    >
      <Text
        style={{
          flex: 1,
          fontSize: 14.5,
          color,
          fontWeight: '400',
          letterSpacing: -0.1,
        }}
      >
        {row.label}
      </Text>
      {row.aiIcon ? (
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: T.ai,
            shadowOpacity: 0.3,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 },
            elevation: 2,
          }}
        >
          <LinearGradient
            {...linearGradientProps(Gradients.ai)}
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
            <MIcon name={row.icon} size={15} color="white" fill={1} />
          </LinearGradient>
        </View>
      ) : (
        <MIcon
          name={row.icon}
          size={20}
          color={
            row.destructive
              ? T.danger
              : row.aiTint
                ? T.aiDark
                : T.textPrimary
          }
        />
      )}
    </Pressable>
  );
}

export default MessageActions;
