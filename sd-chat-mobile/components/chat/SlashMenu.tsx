import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { MIcon } from '@/components/atoms';
import { T } from '@/lib/theme';

export type SlashCommand = {
  cmd: string;
  icon: string;
  desc: string;
};

export type SlashGroup = {
  label: string;
  items: SlashCommand[];
};

const DEFAULT_GROUPS: SlashGroup[] = [
  {
    label: 'Drafts',
    items: [
      { cmd: '/draft-page', icon: 'article', desc: 'CMS page with brand profile applied' },
      { cmd: '/draft-deck', icon: 'slideshow', desc: 'Multi-slide pitch deck' },
      { cmd: '/draft-email', icon: 'mail', desc: 'Campaign tied to a list' },
      { cmd: '/draft-survey', icon: 'quiz', desc: 'Intake form with branching' },
    ],
  },
  {
    label: 'Brain',
    items: [
      { cmd: '/find-expert', icon: 'person-search', desc: 'Surface internal SMEs by topic' },
      { cmd: '/record-decision', icon: 'gavel', desc: 'Log a structured decision' },
      { cmd: '/define', icon: 'menu-book', desc: 'Add a glossary term' },
      { cmd: '/ask-brain', icon: 'psychology_alt', desc: 'RAG over your notes' },
    ],
  },
  {
    label: 'CRM',
    items: [
      { cmd: '/new-deal', icon: 'business-center', desc: 'Open opportunity in pipeline' },
      { cmd: '/log-call', icon: 'phone-in-talk', desc: 'Capture meeting notes to a contact' },
    ],
  },
  {
    label: 'Schedule',
    items: [
      { cmd: '/book', icon: 'event-available', desc: 'Insert booking link' },
      { cmd: '/find-time', icon: 'schedule', desc: 'Propose 3 slots from calendar' },
    ],
  },
];

const MONO = 'Menlo';

export type SlashMenuProps = {
  visible: boolean;
  onClose: () => void;
  onPick: (cmd: string) => void;
};

/**
 * Bottom-sheet slash command palette. Categorized commands; tapping any item
 * dismisses the sheet and calls onPick with the command string (the composer
 * is responsible for inserting it into the input).
 */
export function SlashMenu({ visible, onClose, onPick }: SlashMenuProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(11,15,25,0.45)',
          justifyContent: 'flex-end',
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: T.bgCard,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: '78%',
            paddingBottom: 8,
          }}
        >
          {/* Grab handle */}
          <View style={{ alignItems: 'center', paddingTop: 7 }}>
            <View
              style={{
                width: 36,
                height: 4,
                backgroundColor: '#D9DCE4',
                borderRadius: 2,
              }}
            />
          </View>

          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 16,
              paddingTop: 10,
              paddingBottom: 8,
            }}
          >
            <Text
              style={{
                fontFamily: MONO,
                fontSize: 14,
                fontWeight: '700',
                color: T.ai,
              }}
            >
              /
            </Text>
            <Text
              style={{
                flex: 1,
                fontSize: 15,
                fontWeight: '700',
                color: T.textPrimary,
                letterSpacing: -0.2,
              }}
            >
              Slash commands
            </Text>
            <Text
              style={{
                fontSize: 10,
                color: T.textTertiary,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
                fontWeight: '600',
              }}
            >
              Type to filter
            </Text>
          </View>

          <ScrollView style={{ paddingHorizontal: 8 }}>
            {DEFAULT_GROUPS.map((g) => (
              <View key={g.label} style={{ marginBottom: 6 }}>
                <Text
                  style={{
                    paddingTop: 8,
                    paddingBottom: 4,
                    paddingHorizontal: 12,
                    fontSize: 10,
                    color: T.textTertiary,
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    fontWeight: '700',
                  }}
                >
                  {g.label}
                </Text>
                {g.items.map((it) => (
                  <Pressable
                    key={it.cmd}
                    onPress={() => {
                      onPick(it.cmd);
                      onClose();
                    }}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingVertical: 7,
                      paddingHorizontal: 10,
                      borderRadius: 10,
                      backgroundColor: pressed ? T.aiSoft : 'transparent',
                      marginHorizontal: 4,
                      marginVertical: 1,
                    })}
                  >
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
                      <MIcon name={it.icon} size={16} color={T.ai} fill={1} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={{
                          fontFamily: MONO,
                          fontSize: 12.5,
                          fontWeight: '600',
                          color: T.textPrimary,
                          letterSpacing: -0.2,
                        }}
                      >
                        {it.cmd}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: T.textTertiary,
                          marginTop: 1,
                        }}
                      >
                        {it.desc}
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
              paddingHorizontal: 16,
              paddingTop: 10,
              paddingBottom: 12,
              borderTopWidth: 0.5,
              borderTopColor: T.rowDivider,
            }}
          >
            <Text style={{ fontSize: 10.5, color: T.textTertiary }}>
              Tap to insert
            </Text>
            <Text style={{ fontSize: 10.5, color: T.textTertiary }}>
              Tip: pin your favorites
            </Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default SlashMenu;
