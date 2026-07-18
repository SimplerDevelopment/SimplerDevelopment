import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import {
  AiAvatar,
  Avatar,
  AvatarStack,
  Chip,
  MIcon,
} from '@/components/atoms';
import { LargeTitle, Screen } from '@/components/ui';
import { useConversations } from '@/lib/api/conversations';
import type { AiConversation } from '@/lib/api/types/chat';
import { type Conversation } from '@/lib/mock';
import { Gradients, T, linearGradientProps } from '@/lib/theme';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * Chats — the canonical conversation list.
 *
 * Phase 4 Agent A: AI conversations now come from
 * `GET /api/portal/ai/conversations` via the `useConversations()` hook.
 * DM + group rows are still mocked (no backend tables) and are tagged
 * inline so future work knows to swap them. The real AI list is rendered
 * first (with the pinned "primary" assistant always pinned on top), then
 * the mock human rows for parity with the canonical mockup.
 *
 * States the screen handles:
 *  - loading                → 4 skeleton rows
 *  - error (incl. 401)      → red banner with retry
 *  - data + zero AI rows    → friendly empty card with "start a chat" CTA
 *                             ABOVE the mocked human rows (so the screen
 *                             never feels empty if the user has DMs)
 *  - data + has AI rows     → real AI rows + mocked human rows
 */

function UnreadBadge({ count }: { count: number }) {
  return (
    <LinearGradient
      {...linearGradientProps(Gradients.ai)}
      style={{
        minWidth: 22,
        height: 22,
        paddingHorizontal: 6,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: 'white', fontSize: 12, fontWeight: '700' }}>
        {count > 99 ? '99+' : count}
      </Text>
    </LinearGradient>
  );
}

function AiSparkleBadge() {
  return (
    <View
      style={{
        position: 'absolute',
        right: -3,
        bottom: -3,
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: T.bgCard,
        overflow: 'hidden',
      }}
    >
      <LinearGradient
        {...linearGradientProps(Gradients.ai)}
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MIcon name="auto_awesome" size={11} color="white" fill={1} />
      </LinearGradient>
    </View>
  );
}

function ConversationRow({
  conversation: c,
  onPress,
}: {
  conversation: Conversation;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: T.borderLight }}
      style={({ pressed }) => ({
        backgroundColor: pressed ? T.bgSubtle : T.bgCard,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderBottomWidth: 0.5,
        borderBottomColor: T.borderLight,
      })}
    >
      <View style={{ position: 'relative' }}>
        {c.kind === 'ai' ? (
          <AiAvatar size={46} />
        ) : c.kind === 'group' ? (
          <AvatarStack ids={c.participantIds.slice(0, 2)} size={30} />
        ) : (
          <Avatar id={c.participantIds[0] ?? 7} size={46} />
        )}
        {c.hasAi && c.kind !== 'ai' ? <AiSparkleBadge /> : null}
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}
          >
            <Text
              numberOfLines={1}
              style={{
                fontSize: 15,
                fontWeight: '600',
                color: T.textPrimary,
                letterSpacing: -0.1,
                flexShrink: 1,
              }}
            >
              {c.title}
            </Text>
            {c.tag === 'AI' ? (
              <Chip bg={T.aiSoft} color={T.aiDark} fontSize={9}>
                AI
              </Chip>
            ) : null}
          </View>
          <Text style={{ fontSize: 12, color: T.textTertiary, marginLeft: 8 }}>
            {c.time}
          </Text>
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 3,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              fontSize: 13,
              color: T.textSecondary,
              lineHeight: 18,
              flex: 1,
              marginRight: 10,
            }}
          >
            {c.preview}
          </Text>
          {c.unread && c.unread > 0 ? <UnreadBadge count={c.unread} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

// ─── adapter: AiConversation (backend) → Conversation (UI) ─────────────────

const MS_MIN = 60 * 1000;
const MS_HOUR = 60 * MS_MIN;
const MS_DAY = 24 * MS_HOUR;
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Compact relative time (matches the mock formatter: `2m`, `1h`, `Tue`). */
function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const delta = Date.now() - t;
  if (delta < MS_MIN) return 'now';
  if (delta < MS_HOUR) return `${Math.floor(delta / MS_MIN)}m`;
  if (delta < MS_DAY) return `${Math.floor(delta / MS_HOUR)}h`;
  if (delta < 7 * MS_DAY) return WEEKDAY[new Date(t).getDay()];
  return new Date(t).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function adaptAiConversation(row: AiConversation): Conversation {
  const title = row.title?.trim() || 'New Conversation';
  return {
    id: `ai-${row.id}`,
    kind: 'ai',
    title,
    // We don't get a preview snippet from the list endpoint (would require
    // joining the latest ai_messages row). Show the model name + a soft
    // hint until the list endpoint is enriched.
    preview: 'Claude · tap to continue',
    time: formatRelative(row.updatedAt),
    participantIds: [],
    tag: 'AI',
  };
}

// ─── loading skeleton ──────────────────────────────────────────────────────

function SkeletonBar({ width, height = 12 }: { width: number; height?: number }) {
  return (
    <View
      style={{
        width,
        height,
        borderRadius: height / 2,
        backgroundColor: T.bgSubtle,
      }}
    />
  );
}

function SkeletonRow() {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderBottomWidth: 0.5,
        borderBottomColor: T.borderLight,
        backgroundColor: T.bgCard,
      }}
    >
      <View
        style={{
          width: 46,
          height: 46,
          borderRadius: 23,
          backgroundColor: T.bgSubtle,
        }}
      />
      <View style={{ flex: 1, gap: 8, paddingTop: 4 }}>
        <SkeletonBar width={140} height={13} />
        <SkeletonBar width={220} height={11} />
      </View>
    </View>
  );
}

// ─── error + empty banners ─────────────────────────────────────────────────

function ErrorBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <View
      style={{
        marginHorizontal: 16,
        marginTop: 12,
        padding: 14,
        borderRadius: 12,
        backgroundColor: '#FEE2E2',
        borderWidth: 1,
        borderColor: '#FCA5A5',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <MIcon name="error_outline" size={20} color="#B91C1C" />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, color: '#7F1D1D', fontWeight: '600' }}>
          Couldn&apos;t load conversations
        </Text>
        <Text style={{ fontSize: 11, color: '#991B1B', marginTop: 2 }}>
          Check your connection and try again.
        </Text>
      </View>
      <Pressable
        onPress={onRetry}
        style={{
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: 'white',
        }}
      >
        <Text style={{ fontSize: 12, fontWeight: '600', color: '#B91C1C' }}>
          Retry
        </Text>
      </Pressable>
    </View>
  );
}

function EmptyCard({ onStart }: { onStart: () => void }) {
  return (
    <View
      style={{
        marginHorizontal: 16,
        marginTop: 12,
        padding: 18,
        borderRadius: 14,
        backgroundColor: T.aiSoft,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <AiAvatar size={36} />
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 14,
              fontWeight: '700',
              color: T.textPrimary,
              letterSpacing: -0.1,
            }}
          >
            No conversations yet
          </Text>
          <Text
            style={{ fontSize: 12, color: T.textSecondary, marginTop: 2 }}
          >
            Say hi to the assistant to get started.
          </Text>
        </View>
      </View>
      <Pressable
        onPress={onStart}
        style={{
          alignSelf: 'flex-start',
          borderRadius: 999,
          overflow: 'hidden',
          marginTop: 2,
        }}
      >
        <LinearGradient
          {...linearGradientProps(Gradients.ai)}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <MIcon name="auto_awesome" size={14} color="white" fill={1} />
          <Text style={{ color: 'white', fontSize: 13, fontWeight: '600' }}>
            Start a chat
          </Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

// ─── screen ────────────────────────────────────────────────────────────────

// Human DM/group conversations live behind a backend that doesn't exist
// yet — there are no portal tables for non-AI threads. The list intentionally
// shows ONLY real AI conversations until the backend lands; the empty-state
// card below covers the "no data yet" case. (Old mock rows for Sarah Kim,
// Atlas Launch, etc lived here in Phase 2 — removed to stop showing fake data
// that the user can't actually open.)

export default function ChatsScreen() {
  const router = useRouter();
  const query = useConversations();

  const aiRows = useMemo<Conversation[]>(() => {
    if (!query.data) return [];
    const rows = query.data.map(adaptAiConversation);
    // Pin the most-recently-updated AI thread (mirrors the mock "Assistant
    // primary" behaviour). Backend doesn't have a `pinned` flag yet.
    if (rows.length > 0) rows[0] = { ...rows[0], pinned: true };
    return rows;
  }, [query.data]);

  const sectioned = useMemo<Conversation[]>(() => {
    const pinned = aiRows.filter((c) => c.pinned);
    const recent = aiRows.filter((c) => !c.pinned);
    return [...pinned, ...recent];
  }, [aiRows]);

  return (
    <Screen bg={T.bgCard}>
      <LargeTitle
        title="Chats"
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
              onPress={() => router.push('/(tabs)/brain')}
              accessibilityLabel="Search"
              accessibilityRole="button"
            >
              <MIcon name="search" size={18} color={T.textPrimary} />
            </Pressable>
            <Pressable
              onPress={() => router.push('/chat/new')}
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                overflow: 'hidden',
              }}
              accessibilityLabel="Start a new chat"
              accessibilityRole="button"
            >
              <LinearGradient
                {...linearGradientProps(Gradients.ai)}
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
              >
                <MIcon name="edit" size={17} color="white" fill={1} />
              </LinearGradient>
            </Pressable>
          </View>
        }
      />

      {/* Error banner sits above the list so the user can still scroll the
          mock rows below it (handy on web where auth often hasn't fired). */}
      {query.isError ? <ErrorBanner onRetry={() => query.refetch()} /> : null}

      {/* Initial load → skeletons. We don't show skeletons on background
          refetch because the existing list is the better placeholder. */}
      {query.isLoading ? (
        <View>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      ) : (
        <FlatList
          data={sectioned}
          keyExtractor={(c) => c.id}
          ListHeaderComponent={
            !query.isError && aiRows.length === 0 ? (
              <EmptyCard onStart={() => router.push('/chat/new')} />
            ) : null
          }
          renderItem={({ item }) => (
            <ConversationRow
              conversation={item}
              onPress={() => router.push(`/chat/${item.id}`)}
            />
          )}
          ItemSeparatorComponent={null}
        />
      )}
    </Screen>
  );
}
