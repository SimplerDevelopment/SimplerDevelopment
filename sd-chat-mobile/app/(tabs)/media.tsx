import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { MIcon } from '@/components/atoms';
import { FilterChip, MediaTile } from '@/components/media';
import { LargeTitle, Screen } from '@/components/ui';
import { mimeTypeToKind, useMedia } from '@/lib/api/media';
import type { MediaFilter, MediaRow } from '@/lib/api/types/media';
import type { MediaItem, MediaKind } from '@/lib/mock';
import { Gradients, T, linearGradientProps } from '@/lib/theme';

const FILTERS: { kind: MediaFilter; label: string }[] = [
  { kind: 'all', label: 'All' },
  { kind: 'image', label: 'Images' },
  { kind: 'doc', label: 'Docs' },
  { kind: 'video', label: 'Video' },
  { kind: 'audio', label: 'Audio' },
];

/**
 * Media library — screen 06 from sd-chat-mockup.html. 3-column grid of
 * mixed thumbnails. Filter chips at top filter the grid by kind, with
 * counts populated from the API response. Sort row + grid/list toggle are
 * decorative.
 *
 * Data: `useMedia(filter)` fetches `/api/portal/media` and exposes
 *  - `items` for the grid
 *  - `counts` for the filter chip badges
 */
export default function MediaTab() {
  const [active, setActive] = useState<MediaFilter>('all');
  const query = useMedia(active);

  // Translate `MediaRow` → the legacy `MediaItem` prop shape that the
  // existing `MediaTile` component consumes (kind/seed/label/duration).
  // Keeps the component layer unchanged — only the data source moves.
  const items: MediaItem[] = useMemo(() => {
    if (!query.data) return [];
    return query.data.items.map(mediaRowToTileItem);
  }, [query.data]);

  // Pack into rows of 3 so we can render a CSS-grid look with React Native flex.
  const rows = useMemo(() => {
    const out: Array<Array<MediaItem | null>> = [];
    for (let i = 0; i < items.length; i += 3) {
      const row = [
        items[i] ?? null,
        items[i + 1] ?? null,
        items[i + 2] ?? null,
      ];
      out.push(row);
    }
    return out;
  }, [items]);

  return (
    <Screen bg={T.bgCard}>
      <LargeTitle
        title="Shared Media"
        right={
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Pressable
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: T.bgSubtle,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              accessibilityLabel="Search media"
              accessibilityRole="button"
            >
              <MIcon name="search" size={18} color={T.textPrimary} />
            </Pressable>
            <Pressable
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                overflow: 'hidden',
              }}
              accessibilityLabel="Upload media"
              accessibilityRole="button"
            >
              <LinearGradient
                {...linearGradientProps(Gradients.ai)}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MIcon name="upload" size={17} color="white" fill={1} />
              </LinearGradient>
            </Pressable>
          </View>
        }
      />

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, flexShrink: 0 }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          gap: 6,
          paddingBottom: 10,
          alignItems: 'center',
        }}
      >
        {FILTERS.map((f) => {
          const c = query.data?.counts[f.kind];
          return (
            <FilterChip
              key={f.kind}
              label={f.label}
              count={c != null ? c.toLocaleString() : undefined}
              active={f.kind === active}
              onPress={() => setActive(f.kind)}
            />
          );
        })}
      </ScrollView>

      {/* Sort row */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingTop: 6,
          paddingBottom: 10,
        }}
      >
        <Text
          style={{
            fontSize: 11,
            color: T.textTertiary,
            letterSpacing: 1.6,
            textTransform: 'uppercase',
            fontWeight: '600',
          }}
        >
          This week
        </Text>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Text style={{ fontSize: 11, color: T.textTertiary }}>
              Sort: Newest
            </Text>
            <MIcon name="expand_more" size={14} color={T.textTertiary} />
          </View>
          <MIcon name="grid_view" size={16} color={T.ai} fill={1} />
          <MIcon name="view_list" size={16} color={T.textTertiary} />
        </View>
      </View>

      {/* Grid */}
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 32,
          gap: 8,
        }}
      >
        {query.isLoading ? (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <ActivityIndicator color={T.ai} />
          </View>
        ) : query.isError ? (
          <EmptyState
            icon="error_outline"
            title="Couldn't load media"
            subtitle={query.error?.message ?? 'Try pulling to refresh.'}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="perm_media"
            title="Nothing here yet"
            subtitle="No media matches this filter."
          />
        ) : (
          rows.map((row, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
              {row.map((cell, j) =>
                cell ? (
                  <MediaTile key={cell.id} item={cell} />
                ) : (
                  <View key={`empty-${j}`} style={{ flex: 1, aspectRatio: 1 }} />
                ),
              )}
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: string;
  title: string;
  subtitle: string;
}) {
  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
        paddingHorizontal: 24,
      }}
    >
      <MIcon name={icon} size={36} color={T.textTertiary} />
      <Text
        style={{
          marginTop: 12,
          fontSize: 14,
          color: T.textPrimary,
          fontWeight: '600',
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          marginTop: 4,
          fontSize: 12.5,
          color: T.textSecondary,
          textAlign: 'center',
        }}
      >
        {subtitle}
      </Text>
    </View>
  );
}

/**
 * Reshape a `MediaRow` from the portal into the legacy `MediaItem` prop
 * shape that the existing `MediaTile` component consumes. Doc + audio
 * tiles use synthesized cosmetic fields (color/ext/duration) since the
 * portal does not store those server-side.
 */
function mediaRowToTileItem(row: MediaRow): MediaItem {
  const kind: MediaKind = mimeTypeToKind(row.mimeType);
  if (kind === 'image' || kind === 'video') {
    // MediaTile expects a picsum seed string (it builds
    // `https://picsum.photos/seed/<seed>/400/400`). The portal stores a
    // real `url` / `thumbnailUrl` but the existing tile component does
    // not consume those yet — Phase 5 enhancement. For now, use the
    // row id + filename as a deterministic seed so repeat renders are
    // stable.
    return {
      id: String(row.id),
      kind,
      label: row.filename,
      seed: `sd-${row.id}-${row.filename.slice(0, 8)}`,
    };
  }
  if (kind === 'doc') {
    const ext = (row.filename.split('.').pop() ?? 'DOC').toUpperCase().slice(0, 4);
    return { id: String(row.id), kind: 'doc', label: row.filename, ext, color: docColor(ext) };
  }
  return { id: String(row.id), kind: 'audio', label: row.filename };
}

function docColor(ext: string): string {
  if (ext === 'PDF') return '#E11D48';
  if (ext === 'DOC' || ext === 'DOCX') return '#2563EB';
  if (ext === 'XLS' || ext === 'XLSX' || ext === 'CSV') return '#16A34A';
  if (ext === 'PPT' || ext === 'PPTX') return '#EA580C';
  return T.textSecondary;
}
