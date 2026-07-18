import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Avatar, MIcon } from '@/components/atoms';
import { EntitlementUpsell, Screen } from '@/components/ui';
import { useBrainSearch } from '@/lib/api/brain';
import { ApiError } from '@/lib/api/client';
import type { BrainSearchEntityType, BrainSearchHit } from '@/lib/api/types/brain';
import { T } from '@/lib/theme';

type FilterKey = 'All' | 'Notes' | 'Decisions' | 'People' | 'Glossary';
const FILTERS: FilterKey[] = ['All', 'Notes', 'Decisions', 'People', 'Glossary'];

// Mapping from the search-hit's `type` field to our filter-chip labels.
// `person` is the brain-people entity (internal humans), `contact` is the
// CRM contact (external) — the People chip surfaces brain-people but if a
// tenant has CRM contacts matching too, they show under People as well.
const FILTER_TO_TYPES: Record<FilterKey, BrainSearchEntityType[] | null> = {
  All: null,
  Notes: ['note'],
  Decisions: ['decision'],
  People: ['person', 'contact'],
  Glossary: ['glossary'],
};

/**
 * Brain search — backed by `GET /api/portal/brain/search?q=`. The hook
 * debounces nothing on its own; this screen debounces input by 250 ms via
 * a useEffect → setState dance, then the hook gates on `query.length >= 2`.
 * `placeholderData: keepPreviousData` (in the hook) keeps the previous
 * result list visible while a new query is in-flight.
 *
 * The portal search route currently indexes: meeting, note, task,
 * relationship, company, contact, deal, post. Decisions + glossary are
 * NOT indexed — those filter chips will always read 0 until the search
 * lib is extended.
 */
export default function BrainSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState<FilterKey>('All');

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(handle);
  }, [query]);

  const searchQ = useBrainSearch(debounced);
  const hits = searchQ.data?.hits ?? [];

  const grouped = useMemo(() => {
    const byType = new Map<BrainSearchEntityType, BrainSearchHit[]>();
    for (const hit of hits) {
      const list = byType.get(hit.type) ?? [];
      list.push(hit);
      byType.set(hit.type, list);
    }
    return byType;
  }, [hits]);

  // Filter chip counts — derived from the same grouped map.
  const counts = useMemo(() => {
    return {
      All: hits.length,
      Notes: grouped.get('note')?.length ?? 0,
      Decisions: grouped.get('decision')?.length ?? 0,
      People: (grouped.get('person')?.length ?? 0) + (grouped.get('contact')?.length ?? 0),
      Glossary: grouped.get('glossary')?.length ?? 0,
    } satisfies Record<FilterKey, number>;
  }, [hits.length, grouped]);

  const visibleHits = useMemo(() => {
    const allowed = FILTER_TO_TYPES[filter];
    if (allowed === null) return hits;
    if (allowed.length === 0) return [];
    const set = new Set(allowed);
    return hits.filter((h) => set.has(h.type));
  }, [hits, filter]);

  const isInitialLoad = searchQ.isLoading && !searchQ.data;
  const hasQuery = debounced.trim().length >= 2;

  return (
    <Screen bg={T.bgApp}>
      {/* Nav row */}
      <View style={{ paddingHorizontal: 8, paddingTop: 4, paddingBottom: 4 }}>
        <Pressable
          onPress={() => router.back()}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            padding: 8,
            alignSelf: 'flex-start',
          }}
        >
          <MIcon name="chevron_left" size={22} color={T.ai} />
          <Text style={{ color: T.ai, fontSize: 16, marginLeft: -2 }}>
            Brain
          </Text>
        </Pressable>
      </View>

      <Text
        style={{
          fontSize: 24,
          fontWeight: '700',
          color: T.textPrimary,
          letterSpacing: -0.4,
          paddingHorizontal: 20,
          paddingBottom: 10,
        }}
      >
        Search Brain
      </Text>

      {/* Search field */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <View
          style={{
            backgroundColor: T.bgCard,
            borderRadius: 12,
            paddingHorizontal: 10,
            paddingVertical: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            borderWidth: 1.5,
            borderColor: T.aiBorder,
          }}
        >
          <MIcon name="search" size={18} color={T.textTertiary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            autoFocus
            placeholder="Search notes, people, deals…"
            placeholderTextColor={T.textTertiary}
            style={{
              flex: 1,
              fontSize: 14,
              color: T.textPrimary,
              padding: 0,
            }}
          />
          {searchQ.isFetching && hasQuery ? (
            <ActivityIndicator size="small" color={T.ai} />
          ) : null}
          {query.length > 0 ? (
            <Pressable
              onPress={() => setQuery('')}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <MIcon name="close" size={16} color={T.textTertiary} />
              <Text
                style={{
                  fontSize: 12,
                  color: T.textTertiary,
                  fontWeight: '500',
                }}
              >
                clear
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, flexShrink: 0 }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          gap: 6,
          paddingBottom: 8,
          alignItems: 'center',
        }}
      >
        {FILTERS.map((f) => {
          const sel = f === filter;
          const count = counts[f];
          return (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 999,
                backgroundColor: sel ? T.brand : T.bgCard,
                borderWidth: sel ? 0 : 0.5,
                borderColor: T.border,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <Text
                style={{
                  color: sel ? 'white' : T.textSecondary,
                  fontSize: 11.5,
                  fontWeight: '600',
                  letterSpacing: -0.1,
                }}
              >
                {f}
              </Text>
              <Text
                style={{
                  fontSize: 10,
                  color: sel ? 'rgba(255,255,255,0.7)' : T.textTertiary,
                }}
              >
                {count}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text
        style={{
          paddingHorizontal: 20,
          paddingTop: 4,
          fontSize: 12,
          color: T.textTertiary,
          fontWeight: '500',
        }}
      >
        {hasQuery ? `${visibleHits.length} results` : 'Type 2+ characters to search'}
      </Text>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {!hasQuery ? null : isInitialLoad ? (
          <SearchSkeleton />
        ) : searchQ.isError &&
          searchQ.error instanceof ApiError &&
          searchQ.error.code === 'BRAIN_NOT_ENTITLED' ? (
          <EntitlementUpsell
            variant="brain"
            upsellUrl={searchQ.error.upsellUrl}
            secondaryLabel="Retry"
            onSecondaryPress={() => searchQ.refetch()}
          />
        ) : searchQ.isError ? (
          <ErrorBanner
            message={
              searchQ.error instanceof Error ? searchQ.error.message : 'Search failed'
            }
            onRetry={() => searchQ.refetch()}
          />
        ) : visibleHits.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 40 }}>
            <MIcon name="search" size={32} color={T.textTertiary} />
            <Text
              style={{ marginTop: 12, fontSize: 13, color: T.textSecondary }}
            >
              0 results for "{debounced}"
            </Text>
          </View>
        ) : (
          renderGroups(visibleHits, debounced, router)
        )}
      </ScrollView>
    </Screen>
  );
}

function renderGroups(
  hits: BrainSearchHit[],
  query: string,
  router: ReturnType<typeof useRouter>,
) {
  const byType = new Map<BrainSearchEntityType, BrainSearchHit[]>();
  for (const hit of hits) {
    const list = byType.get(hit.type) ?? [];
    list.push(hit);
    byType.set(hit.type, list);
  }
  const ordered: BrainSearchEntityType[] = [
    'note',
    'decision',
    'person',
    'glossary',
    'meeting',
    'task',
    'contact',
    'company',
    'deal',
    'relationship',
    'post',
  ];
  return (
    <>
      {ordered.map((type) => {
        const group = byType.get(type);
        if (!group || group.length === 0) return null;
        return (
          <View key={type}>
            <GroupLabel>
              {labelForType(type)} ({group.length})
            </GroupLabel>
            <Group>
              {group.map((hit, i, arr) => (
                <HitRow
                  key={`${hit.type}-${hit.id}`}
                  hit={hit}
                  query={query}
                  last={i === arr.length - 1}
                  onPress={() => navigateForHit(hit, router)}
                />
              ))}
            </Group>
          </View>
        );
      })}
    </>
  );
}

function labelForType(type: BrainSearchEntityType): string {
  switch (type) {
    case 'note':
      return 'Notes';
    case 'meeting':
      return 'Meetings';
    case 'task':
      return 'Tasks';
    case 'contact':
      return 'Contacts';
    case 'company':
      return 'Companies';
    case 'deal':
      return 'Deals';
    case 'relationship':
      return 'Relationships';
    case 'post':
      return 'Posts';
    case 'decision':
      return 'Decisions';
    case 'glossary':
      return 'Glossary';
    case 'person':
      return 'People';
  }
}

function iconForType(type: BrainSearchEntityType): { name: string; color: string } {
  switch (type) {
    case 'note':
      return { name: 'description', color: T.iosBlue };
    case 'meeting':
      return { name: 'event_note', color: T.iosOrange };
    case 'task':
      return { name: 'task_alt', color: T.success };
    case 'contact':
      return { name: 'person', color: T.iosPurple };
    case 'company':
      return { name: 'corporate_fare', color: T.iosBlue };
    case 'deal':
      return { name: 'trending_up', color: T.success };
    case 'relationship':
      return { name: 'hub', color: T.iosTeal };
    case 'post':
      return { name: 'article', color: T.iosBlue };
    case 'decision':
      return { name: 'gavel', color: T.ai };
    case 'glossary':
      return { name: 'book', color: T.iosOrange };
    case 'person':
      return { name: 'person', color: T.iosPurple };
  }
}

function navigateForHit(hit: BrainSearchHit, router: ReturnType<typeof useRouter>) {
  switch (hit.type) {
    case 'note':
      router.push(`/brain/note/${hit.id}`);
      return;
    case 'decision':
      router.push(`/brain/decision/${hit.id}`);
      return;
    case 'glossary':
      router.push(`/brain/glossary/${hit.id}`);
      return;
    case 'person':
      router.push(`/brain/person/${hit.id}`);
      return;
  }
  // Other types (meeting / task / company / deal / contact / relationship /
  // post) do not have native screens yet. Tap is a no-op for now — the portal
  // `url` field is the web destination if/when we add an "Open in portal" path.
}

function HitRow({
  hit,
  query,
  last,
  onPress,
}: {
  hit: BrainSearchHit;
  query: string;
  last: boolean;
  onPress: () => void;
}) {
  const icon = iconForType(hit.type);
  if (hit.type === 'contact') {
    return (
      <Pressable
        onPress={onPress}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderBottomWidth: last ? 0 : 0.5,
          borderBottomColor: T.rowDivider,
        }}
      >
        <Avatar id={hit.id} size={36} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontSize: 13.5,
              color: T.textPrimary,
              fontWeight: '600',
              letterSpacing: -0.1,
            }}
          >
            <Highlighted text={hit.title} query={query} />
          </Text>
          {hit.snippet ? (
            <Text style={{ fontSize: 11.5, color: T.textSecondary, marginTop: 2 }}>
              <Highlighted text={hit.snippet} query={query} />
            </Text>
          ) : null}
        </View>
        <MIcon name="chevron_right" size={18} color={T.textTertiary} />
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: T.rowDivider,
      }}
    >
      <MIcon name={icon.name} size={16} color={icon.color} fill={1} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: 13,
            color: T.textPrimary,
            fontWeight: '600',
            letterSpacing: -0.1,
          }}
        >
          <Highlighted text={hit.title} query={query} />
        </Text>
        {hit.snippet ? (
          <Text
            style={{
              fontSize: 12,
              color: T.textSecondary,
              lineHeight: 17,
              marginTop: 3,
            }}
          >
            <Highlighted text={hit.snippet} query={query} />
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * Wraps every case-insensitive occurrence of `query` inside `text` in a
 * highlighted child Text. Designed for inline use inside a parent <Text>.
 */
function Highlighted({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const needle = query.toLowerCase();
  const lower = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  while (i < text.length) {
    const at = lower.indexOf(needle, i);
    if (at === -1) {
      parts.push(text.slice(i));
      break;
    }
    if (at > i) parts.push(text.slice(i, at));
    parts.push(
      <Text
        key={`h-${at}`}
        style={{
          backgroundColor: T.aiSoft,
          color: T.aiDark,
          fontWeight: '600',
        }}
      >
        {text.slice(at, at + needle.length)}
      </Text>,
    );
    i = at + needle.length;
  }
  return <>{parts}</>;
}

function GroupLabel({
  children,
  mt = 18,
}: {
  children: React.ReactNode;
  mt?: number;
}) {
  return (
    <Text
      style={{
        fontSize: 11,
        color: T.textTertiary,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        fontWeight: '600',
        marginTop: mt,
        marginBottom: 6,
        marginHorizontal: 20,
      }}
    >
      {children}
    </Text>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        marginHorizontal: 16,
        backgroundColor: T.bgCard,
        borderRadius: 14,
        borderWidth: 0.5,
        borderColor: T.rowDivider,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}

function SearchSkeleton() {
  return (
    <View style={{ paddingTop: 12 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            gap: 12,
            paddingHorizontal: 20,
            paddingVertical: 14,
          }}
        >
          <View style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: T.bgSubtle }} />
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ height: 12, width: '50%', borderRadius: 4, backgroundColor: T.bgSubtle }} />
            <View style={{ height: 10, width: '85%', borderRadius: 4, backgroundColor: T.bgSubtle }} />
          </View>
        </View>
      ))}
    </View>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View
      style={{
        margin: 16,
        padding: 14,
        borderRadius: 12,
        backgroundColor: '#FEE2E2',
        borderWidth: 1,
        borderColor: '#FCA5A5',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <MIcon name="error" size={18} color={T.danger} fill={1} />
        <Text style={{ flex: 1, fontSize: 13, color: T.danger, fontWeight: '600' }}>
          Search failed
        </Text>
        <Pressable
          onPress={onRetry}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 999,
            backgroundColor: 'white',
            borderWidth: 0.5,
            borderColor: '#FCA5A5',
          }}
        >
          <Text style={{ fontSize: 11, color: T.danger, fontWeight: '600' }}>Retry</Text>
        </Pressable>
      </View>
      <Text style={{ marginTop: 6, fontSize: 12, color: T.danger }}>{message}</Text>
    </View>
  );
}
