import { LinearGradient } from 'expo-linear-gradient';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { AiAvatar, Avatar, MIcon } from '@/components/atoms';
import { Gradients, T, linearGradientProps } from '@/lib/theme';

export type MentionItem =
  | { kind: 'ai'; handle: string; sub: string }
  | { kind: 'person'; handle: string; sub: string; avatarId: number }
  | { kind: 'channel'; handle: string; sub: string }
  | { kind: 'smart'; handle: string; sub: string };

export type MentionGroup = {
  label: string;
  items: MentionItem[];
  smart?: boolean;
};

const DEFAULT_GROUPS: MentionGroup[] = [
  {
    label: 'Assistant',
    items: [{ kind: 'ai', handle: '@assistant', sub: 'the AI in this thread' }],
  },
  {
    label: 'People in this workspace',
    items: [
      { kind: 'person', handle: 'Sarah Kim', sub: 'Director of Strategy', avatarId: 47 },
      { kind: 'person', handle: 'Sam Wright', sub: 'Designer · last active 2h', avatarId: 8 },
      { kind: 'person', handle: 'Marcus Chen', sub: 'Product Lead', avatarId: 12 },
    ],
  },
  {
    label: 'Channels',
    items: [
      { kind: 'channel', handle: '# Sales pipeline', sub: '14 members' },
      { kind: 'channel', handle: '# Strategy syncs', sub: '6 members' },
    ],
  },
  {
    label: 'Smart groups',
    smart: true,
    items: [
      { kind: 'smart', handle: '@everyone-active-today', sub: '8 people online now' },
      { kind: 'smart', handle: '@deal-owners', sub: '3 people with open deals' },
    ],
  },
];

export type MentionPickerProps = {
  visible: boolean;
  onClose: () => void;
  onPick: (handle: string) => void;
};

/**
 * Mention picker rendered as a floating popover above the composer when the
 * user types `@` mid-string. Categorized: Assistant, People, Channels, Smart
 * groups. Tap an item → onPick(handle) + dismiss.
 */
export function MentionPicker({
  visible,
  onClose,
  onPick,
}: MentionPickerProps) {
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
          backgroundColor: 'rgba(11,15,25,0.35)',
          justifyContent: 'flex-end',
          padding: 12,
          paddingBottom: 96,
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: T.bgCard,
            borderRadius: 16,
            shadowColor: '#0F172A',
            shadowOpacity: 0.22,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 14 },
            elevation: 10,
            maxHeight: 460,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 14,
              paddingTop: 11,
              paddingBottom: 8,
            }}
          >
            <Text
              style={{
                fontFamily: 'Menlo',
                fontSize: 16,
                fontWeight: '700',
                color: T.ai,
              }}
            >
              @
            </Text>
            <Text style={{ flex: 1, fontSize: 13, color: T.textPrimary }}>
              Pick someone or something
            </Text>
          </View>

          <ScrollView style={{ paddingHorizontal: 4, paddingBottom: 6 }}>
            {DEFAULT_GROUPS.map((g) => (
              <View key={g.label}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    paddingHorizontal: 12,
                    paddingTop: 6,
                    paddingBottom: 3,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 9.5,
                      color: g.smart ? T.aiDark : T.textTertiary,
                      letterSpacing: 0.6,
                      textTransform: 'uppercase',
                      fontWeight: '700',
                    }}
                  >
                    {g.label}
                  </Text>
                  {g.smart ? (
                    <MIcon
                      name="auto_awesome"
                      size={10}
                      color={T.ai}
                      fill={1}
                    />
                  ) : null}
                </View>
                {g.items.map((it) => (
                  <Pressable
                    key={it.handle}
                    onPress={() => {
                      onPick(it.handle);
                      onClose();
                    }}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingVertical: 7,
                      paddingHorizontal: 10,
                      borderRadius: 9,
                      backgroundColor: pressed ? T.aiTint : 'transparent',
                      marginHorizontal: 4,
                      marginVertical: 1,
                    })}
                  >
                    <MentionLeading item={it} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '600',
                            color: T.textPrimary,
                            letterSpacing: -0.1,
                          }}
                        >
                          {it.handle}
                        </Text>
                        {it.kind === 'ai' ? <AiPill /> : null}
                      </View>
                      <Text
                        style={{
                          fontSize: 11,
                          color: T.textTertiary,
                          marginTop: 1,
                        }}
                      >
                        {it.sub}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ))}
          </ScrollView>

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingHorizontal: 14,
              paddingVertical: 8,
              backgroundColor: T.bgSubtle,
              borderTopWidth: 0.5,
              borderTopColor: T.rowDivider,
            }}
          >
            <Text style={{ fontSize: 10, color: T.textTertiary }}>↑↓ navigate</Text>
            <Text style={{ fontSize: 10, color: T.textTertiary }}>↩ insert</Text>
            <Text style={{ fontSize: 10, color: T.textTertiary }}>esc dismiss</Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MentionLeading({ item }: { item: MentionItem }) {
  if (item.kind === 'ai') {
    return <AiAvatar size={28} ring={false} />;
  }
  if (item.kind === 'person') {
    return <Avatar id={item.avatarId} size={28} />;
  }
  if (item.kind === 'channel') {
    return (
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          backgroundColor: T.bgSubtle,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            fontSize: 13,
            fontWeight: '700',
            color: T.textSecondary,
          }}
        >
          #
        </Text>
      </View>
    );
  }
  // smart
  return (
    <View
      style={{
        width: 28,
        height: 28,
        borderRadius: 7,
        backgroundColor: T.aiTint,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <MIcon name="auto_awesome" size={15} color={T.ai} fill={1} />
    </View>
  );
}

function AiPill() {
  return (
    <View
      style={{
        borderRadius: 4,
        overflow: 'hidden',
      }}
    >
      <LinearGradient
        {...linearGradientProps(Gradients.ai)}
        style={{ paddingHorizontal: 6, paddingVertical: 2 }}
      >
        <Text
          style={{
            fontSize: 8.5,
            fontWeight: '700',
            color: 'white',
            letterSpacing: 0.4,
          }}
        >
          AI
        </Text>
      </LinearGradient>
    </View>
  );
}

export default MentionPicker;
