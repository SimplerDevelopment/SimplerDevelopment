import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, Text, View } from 'react-native';

import { MIcon } from '@/components/atoms';
import type { MediaItem } from '@/lib/mock/media';
import { T } from '@/lib/theme';

export type MediaTileProps = {
  item: MediaItem;
  onPress?: () => void;
};

/**
 * Square 1:1 media library tile — renders one of four variants based on
 * `item.kind`:
 *  - image: full-bleed image
 *  - video: image + dark gradient bottom + center play button + duration
 *  - doc:   faux page (white rect, corner fold, EXT label, filename)
 *  - audio: subtle gradient + graphic_eq icon + label + duration
 *
 * Tap is a no-op for Phase 2; Phase 3 wires the file viewer.
 */
export function MediaTile({ item, onPress }: MediaTileProps) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        aspectRatio: 1,
        borderRadius: 10,
        overflow: 'hidden',
        backgroundColor: T.bgSubtle,
        position: 'relative',
      }}
    >
      {item.kind === 'image' ? <ImageTile item={item} /> : null}
      {item.kind === 'video' ? <VideoTile item={item} /> : null}
      {item.kind === 'doc' ? <DocTile item={item} /> : null}
      {item.kind === 'audio' ? <AudioTile item={item} /> : null}
    </Pressable>
  );
}

function thumbUri(seed: string | undefined) {
  return `https://picsum.photos/seed/${seed ?? 'sd'}/400/400`;
}

function ImageTile({ item }: { item: MediaItem }) {
  return (
    <Image
      source={{ uri: thumbUri(item.seed) }}
      style={{ width: '100%', height: '100%' }}
      accessibilityIgnoresInvertColors
    />
  );
}

function VideoTile({ item }: { item: MediaItem }) {
  return (
    <View style={{ width: '100%', height: '100%' }}>
      <Image
        source={{ uri: thumbUri(item.seed) }}
        style={{ width: '100%', height: '100%', position: 'absolute' }}
        accessibilityIgnoresInvertColors
      />
      {/* Dark gradient overlay so the duration is legible. */}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.5)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ position: 'absolute', inset: 0 }}
      />
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: 'rgba(255,255,255,0.92)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MIcon name="play_arrow" size={20} color={T.textPrimary} fill={1} />
        </View>
      </View>
      <Text
        style={{
          position: 'absolute',
          bottom: 5,
          left: 6,
          fontSize: 9,
          color: 'white',
          fontWeight: '600',
          letterSpacing: 0.4,
          textShadowColor: 'rgba(0,0,0,0.4)',
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 2,
        }}
      >
        {item.duration ?? item.label.split('·')[0]?.trim() ?? ''}
      </Text>
    </View>
  );
}

function DocTile({ item }: { item: MediaItem }) {
  const color = item.color ?? T.textSecondary;
  return (
    <View
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#FAFAF8',
        borderWidth: 1,
        borderColor: T.borderLight,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 8,
      }}
    >
      {/* Faux page */}
      <View
        style={{
          width: 44,
          height: 52,
          borderRadius: 6,
          backgroundColor: 'white',
          borderWidth: 1,
          borderColor: T.border,
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingBottom: 5,
          marginBottom: 8,
          position: 'relative',
          shadowColor: '#000',
          shadowOpacity: 0.06,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: 1,
        }}
      >
        <Text
          style={{
            fontSize: 9,
            fontWeight: '800',
            letterSpacing: 0.4,
            color,
          }}
        >
          {item.ext ?? 'DOC'}
        </Text>
        {/* corner fold */}
        <View
          style={{
            position: 'absolute',
            top: -1,
            right: -1,
            width: 12,
            height: 12,
            backgroundColor: T.bgSubtle,
            borderBottomLeftRadius: 4,
            borderLeftWidth: 1,
            borderBottomWidth: 1,
            borderColor: T.border,
          }}
        />
      </View>
      <Text
        numberOfLines={1}
        style={{
          fontSize: 9,
          color: T.textSecondary,
          fontWeight: '500',
          textAlign: 'center',
          width: '100%',
        }}
      >
        {item.label}
      </Text>
    </View>
  );
}

function AudioTile({ item }: { item: MediaItem }) {
  return (
    <LinearGradient
      colors={[T.aiSoft, T.aiTint]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 10,
        borderWidth: 1,
        borderColor: T.aiBorder,
        borderRadius: 10,
      }}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: 'white',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 8,
        }}
      >
        <MIcon name="graphic_eq" size={20} color={T.ai} fill={1} />
      </View>
      <Text
        numberOfLines={1}
        style={{
          fontSize: 9,
          color: T.textPrimary,
          fontWeight: '600',
          textAlign: 'center',
        }}
      >
        {item.label}
      </Text>
      {item.duration ? (
        <Text
          style={{
            marginTop: 2,
            fontSize: 9,
            color: T.aiDark,
            fontWeight: '500',
          }}
        >
          {item.duration}
        </Text>
      ) : null}
    </LinearGradient>
  );
}

export default MediaTile;
