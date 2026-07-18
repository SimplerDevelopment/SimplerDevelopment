import { useMemo, useState } from 'react';
import { Image, Text, View } from 'react-native';

export type AvatarProps = {
  /** pravatar.cc seed id (1-70). Only used when neither `imageUrl` nor `name`-only mode is wanted. Default 7 = the canonical "Daniel Coyle" face. */
  id?: number;
  /** Explicit image URL. Wins over `id` if provided. Falls back to initials if it 404s. */
  imageUrl?: string | null;
  /** Display name. When no image is available (or load errors) we render the
   *  first letter of each word (max 2) on a deterministic tinted background. */
  name?: string | null;
  size?: number;
};

const INITIAL_BG = [
  '#2563EB', // blue-600 (brand)
  '#0EA5E9', // sky
  '#F59E0B', // amber
  '#10B981', // emerald
  '#EC4899', // pink
  '#3B82F6', // blue-500
  '#EF4444', // red
  '#14B8A6', // teal
] as const;

function initials(name?: string | null): string {
  if (!name) return '';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map(p => p[0]?.toUpperCase() ?? '').join('');
}

function tintFor(seed: string | number): string {
  const s = typeof seed === 'string' ? seed : String(seed);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return INITIAL_BG[Math.abs(h) % INITIAL_BG.length];
}

export function Avatar({ id, imageUrl, name, size = 56 }: AvatarProps) {
  const [failed, setFailed] = useState(false);

  // Resolve the image URI to try. Explicit imageUrl wins; otherwise fall back
  // to the pravatar id (clamped to 1-70 — pravatar 404s outside that range,
  // which is why we used to see gray circles for user ids like 181).
  const uri = useMemo<string | null>(() => {
    if (imageUrl != null && imageUrl !== '') return imageUrl;
    if (id != null && id >= 1 && id <= 70) return `https://i.pravatar.cc/200?img=${id}`;
    return null;
  }, [imageUrl, id]);

  const init = initials(name);
  const bg = tintFor(name ?? id ?? 'avatar');
  const showImage = uri !== null && !failed;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: showImage ? '#D9DCE4' : bg,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {showImage ? (
        <Image
          source={{ uri: uri! }}
          style={{ width: size, height: size }}
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text
          style={{
            color: 'white',
            fontWeight: '700',
            fontSize: Math.round(size * 0.4),
            letterSpacing: 0.2,
          }}
        >
          {init || '?'}
        </Text>
      )}
    </View>
  );
}

export type AvatarStackProps = {
  /** Array of pravatar ids, rendered overlapping. */
  ids: number[];
  size?: number;
  bgRingColor?: string;
};

export function AvatarStack({ ids, size = 26, bgRingColor = '#FFFFFF' }: AvatarStackProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {ids.map((id, i) => (
        <View
          key={`${id}-${i}`}
          style={{
            marginLeft: i === 0 ? 0 : -8,
            borderWidth: 2,
            borderColor: bgRingColor,
            borderRadius: size,
            backgroundColor: bgRingColor,
          }}
        >
          <Avatar id={id} size={size} />
        </View>
      ))}
    </View>
  );
}

export default Avatar;
