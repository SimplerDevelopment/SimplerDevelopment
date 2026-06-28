import { LinearGradient } from 'expo-linear-gradient';
import { Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { MIcon } from '@/components/atoms';
import { mediaItems, type MediaItem } from '@/lib/mock';
import { Gradients, T, linearGradientProps } from '@/lib/theme';

type Tile = {
  name: string;
  icon: string;
  bg?: string;
  gradient?: boolean;
  sub?: string;
};

const TILES: Tile[] = [
  { name: 'Photo & video', icon: 'image', bg: T.iosBlue },
  { name: 'Take photo', icon: 'photo-camera', bg: T.iosOrange },
  { name: 'Files', icon: 'folder', bg: T.iosPurple },
  { name: 'Media library', icon: 'perm_media', bg: T.iosTeal, sub: '1,432 items' },
  { name: 'Link a deal', icon: 'business-center', bg: T.iosGreen, sub: 'From CRM' },
  { name: 'Brain note', icon: 'psychology_alt', gradient: true, sub: '1,284 indexed' },
  { name: 'Voice memo', icon: 'mic', bg: T.iosRed },
  { name: 'Code snippet', icon: 'code', bg: '#334155' },
];

export type AttachSheetProps = {
  visible: boolean;
  onClose: () => void;
  onPick?: (tileName: string) => void;
  onPickRecent?: (item: MediaItem) => void;
};

/**
 * 4x2 action grid + recent-media strip. Wires to lib/mock/media for the
 * recents row so it's never empty.
 */
export function AttachSheet({
  visible,
  onClose,
  onPick,
  onPickRecent,
}: AttachSheetProps) {
  const recents = mediaItems.slice(0, 6);

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
          backgroundColor: 'rgba(11,15,25,0.4)',
          justifyContent: 'flex-end',
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: T.bgCard,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingHorizontal: 16,
            paddingBottom: 24,
          }}
        >
          {/* Handle */}
          <View
            style={{
              alignItems: 'center',
              paddingTop: 4,
              paddingBottom: 10,
            }}
          >
            <View
              style={{
                width: 36,
                height: 4,
                backgroundColor: '#D9DCE4',
                borderRadius: 2,
              }}
            />
          </View>

          <Text
            style={{
              textAlign: 'center',
              fontSize: 14,
              fontWeight: '700',
              color: T.textPrimary,
              letterSpacing: -0.2,
              marginBottom: 14,
            }}
          >
            Attach to message
          </Text>

          {/* 4x2 grid */}
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            {TILES.map((t) => (
              <Pressable
                key={t.name}
                onPress={() => {
                  onPick?.(t.name);
                  onClose();
                }}
                style={({ pressed }) => ({
                  width: '23.5%', // 4 across, gap accounted for
                  backgroundColor: pressed ? T.bgChip : T.bgSubtle,
                  borderRadius: 12,
                  paddingHorizontal: 6,
                  paddingTop: 10,
                  paddingBottom: 8,
                  alignItems: 'center',
                  gap: 6,
                })}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 11,
                    overflow: 'hidden',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: t.gradient ? 'transparent' : t.bg,
                    shadowColor: t.gradient ? T.ai : '#000',
                    shadowOpacity: t.gradient ? 0.3 : 0.08,
                    shadowRadius: t.gradient ? 8 : 3,
                    shadowOffset: { width: 0, height: t.gradient ? 3 : 1 },
                    elevation: 2,
                  }}
                >
                  {t.gradient ? (
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
                      <MIcon name={t.icon} size={20} color="white" fill={1} />
                    </LinearGradient>
                  ) : (
                    <MIcon name={t.icon} size={20} color="white" fill={1} />
                  )}
                </View>
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 10,
                    fontWeight: '600',
                    color: T.textPrimary,
                    textAlign: 'center',
                    letterSpacing: -0.1,
                  }}
                >
                  {t.name}
                </Text>
                {t.sub ? (
                  <Text
                    style={{
                      fontSize: 8.5,
                      color: T.textTertiary,
                      textAlign: 'center',
                      letterSpacing: 0.2,
                    }}
                  >
                    {t.sub}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>

          {/* Recents strip */}
          <View style={{ marginTop: 14 }}>
            <Text
              style={{
                fontSize: 9.5,
                color: T.textTertiary,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                fontWeight: '700',
                marginBottom: 8,
              }}
            >
              Recent
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {recents.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    onPickRecent?.(item);
                    onClose();
                  }}
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 10,
                    overflow: 'hidden',
                    borderWidth: 1,
                    borderColor: T.borderLight,
                    backgroundColor:
                      item.kind === 'doc' ? T.bgSubtle : T.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <RecentTile item={item} />
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <Pressable
            onPress={onClose}
            style={({ pressed }) => ({
              marginTop: 14,
              paddingVertical: 13,
              backgroundColor: pressed ? T.bgChip : T.bgSubtle,
              borderRadius: 14,
              alignItems: 'center',
            })}
          >
            <Text
              style={{
                color: T.ai,
                fontSize: 15,
                fontWeight: '600',
                letterSpacing: -0.1,
              }}
            >
              Cancel
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function RecentTile({ item }: { item: MediaItem }) {
  if (item.kind === 'image' || item.kind === 'video') {
    return (
      <Image
        source={{
          uri: `https://picsum.photos/seed/${item.seed ?? item.id}/128/128`,
        }}
        style={{ width: '100%', height: '100%' }}
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <MIcon name="description" size={22} color={item.color ?? T.iosRed} fill={1} />
      <Text
        numberOfLines={1}
        style={{
          fontSize: 8,
          color: T.textTertiary,
          fontWeight: '600',
          paddingHorizontal: 4,
        }}
      >
        {item.ext ?? 'DOC'}
      </Text>
    </View>
  );
}

export default AttachSheet;
