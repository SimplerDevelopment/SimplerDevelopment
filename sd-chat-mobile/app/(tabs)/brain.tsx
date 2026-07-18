import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { Avatar, Chip, MIcon } from '@/components/atoms';
import { NoteCard } from '@/components/brain';
import { EntitlementUpsell, LargeTitle, Screen } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import {
  useBrainDecisions,
  useBrainGlossary,
  useBrainNotes,
  useBrainPeople,
} from '@/lib/api/brain';
import type {
  BrainDecisionRow,
  BrainGlossaryListRow,
  BrainNoteRow,
  BrainPersonListRow,
} from '@/lib/api/types/brain';
import type { BrainNote as MockBrainNote } from '@/lib/mock/brain';
import { Gradients, T, linearGradientProps } from '@/lib/theme';

type BrainTab = 'Notes' | 'Decisions' | 'People' | 'Glossary';
const TABS: BrainTab[] = ['Notes', 'Decisions', 'People', 'Glossary'];

type Row =
  | { kind: 'note'; data: BrainNoteRow }
  | { kind: 'decision'; data: BrainDecisionRow }
  | { kind: 'person'; data: BrainPersonListRow }
  | { kind: 'glossary'; data: BrainGlossaryListRow };

/**
 * Brain landing — backed by `/api/portal/brain/*` via Tanstack Query.
 * One hook per tab; only the active tab's query is read but all run in
 * parallel so switching tabs is instant after first paint.
 *
 * Loading / empty / error states are per-tab so a failing decisions list
 * does not blank the notes view.
 */
export default function BrainTab() {
  const router = useRouter();
  const [active, setActive] = useState<BrainTab>('Notes');

  const notesQ = useBrainNotes({ limit: 50 });
  const decisionsQ = useBrainDecisions({ limit: 50 });
  const peopleQ = useBrainPeople({ limit: 50 });
  const glossaryQ = useBrainGlossary({ limit: 50 });

  const activeQuery =
    active === 'Notes'
      ? notesQ
      : active === 'Decisions'
      ? decisionsQ
      : active === 'People'
      ? peopleQ
      : glossaryQ;

  const rows = useMemo<Row[]>(() => {
    if (active === 'Notes' && notesQ.data) {
      return notesQ.data.items.map((n) => ({ kind: 'note' as const, data: n }));
    }
    if (active === 'Decisions' && decisionsQ.data) {
      return decisionsQ.data.items.map((d) => ({ kind: 'decision' as const, data: d }));
    }
    if (active === 'People' && peopleQ.data) {
      return peopleQ.data.items.map((p) => ({ kind: 'person' as const, data: p }));
    }
    if (active === 'Glossary' && glossaryQ.data) {
      return glossaryQ.data.items.map((g) => ({ kind: 'glossary' as const, data: g }));
    }
    return [];
  }, [active, notesQ.data, decisionsQ.data, peopleQ.data, glossaryQ.data]);

  return (
    <Screen bg={T.bgCard}>
      <LargeTitle
        title="Company Brain"
        right={
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Pressable
              onPress={() => router.push('/brain/suggestions')}
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: T.bgSubtle,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              accessibilityLabel="View AI suggestions"
              accessibilityRole="button"
            >
              <MIcon name="psychology_alt" size={18} color={T.textPrimary} />
            </Pressable>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/chat/[id]',
                  params: {
                    id: 'new',
                    prompt: 'Help me think through what I have in my Brain.',
                  },
                })
              }
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                overflow: 'hidden',
              }}
              accessibilityLabel="Ask the assistant"
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
                <MIcon name="auto_awesome" size={17} color="white" fill={1} />
              </LinearGradient>
            </Pressable>
          </View>
        }
      />

      {/* Search field (visual; tap routes to dedicated search screen) */}
      <Pressable
        onPress={() => router.push('/brain/search')}
        style={{
          marginHorizontal: 16,
          marginBottom: 10,
          backgroundColor: T.bgSubtle,
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <MIcon name="search" size={18} color={T.textTertiary} />
        <Text style={{ flex: 1, fontSize: 14, color: T.textTertiary }}>
          Search notes, decisions, people…
        </Text>
      </Pressable>

      {/* Tabs — show per-tab count once that tab's list query has resolved.
          We render `items.length` (not `total`) so the chip number matches what
          the user sees in the list below, even when the list is capped at the
          50-row limit. */}
      <View
        style={{
          flexDirection: 'row',
          gap: 4,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: T.borderLight,
        }}
      >
        {TABS.map((t) => {
          const sel = t === active;
          const count =
            t === 'Notes'
              ? notesQ.data?.items.length
              : t === 'Decisions'
              ? decisionsQ.data?.items.length
              : t === 'People'
              ? peopleQ.data?.items.length
              : glossaryQ.data?.items.length;
          return (
            <Pressable
              key={t}
              onPress={() => setActive(t)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 10,
                position: 'relative',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: sel ? T.textPrimary : T.textTertiary,
                  letterSpacing: -0.1,
                }}
              >
                {t}
              </Text>
              {count !== undefined && count > 0 ? (
                <Text
                  style={{
                    fontSize: 11,
                    color: sel ? T.textTertiary : T.textTertiary,
                    fontWeight: '500',
                  }}
                >
                  {count}
                </Text>
              ) : null}
              {sel ? (
                <View
                  style={{
                    position: 'absolute',
                    bottom: -1,
                    left: 8,
                    right: 8,
                    height: 2.5,
                    borderRadius: 2,
                    backgroundColor: T.ai,
                  }}
                />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {/* Section header */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingTop: 14,
          paddingBottom: 8,
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
          Recent
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 11, color: T.textTertiary }}>
            Sort: Updated
          </Text>
          <MIcon name="expand_more" size={14} color={T.textTertiary} />
        </View>
      </View>

      {activeQuery.isLoading ? (
        <ListSkeleton kind={active} />
      ) : activeQuery.isError &&
        activeQuery.error instanceof ApiError &&
        activeQuery.error.code === 'BRAIN_NOT_ENTITLED' ? (
        <EntitlementUpsell
          variant="brain"
          upsellUrl={activeQuery.error.upsellUrl}
          secondaryLabel="Retry"
          onSecondaryPress={() => activeQuery.refetch()}
        />
      ) : activeQuery.isError ? (
        <ErrorBanner
          message={activeQuery.error instanceof Error ? activeQuery.error.message : 'Failed to load'}
          onRetry={() => activeQuery.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState kind={active} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) =>
            r.kind === 'person' ? `p-${r.data.id}` : `${r.kind}-${r.data.id}`
          }
          renderItem={({ item }) => {
            if (item.kind === 'note') {
              return (
                <NoteCard
                  note={adaptNote(item.data)}
                  onPress={() => router.push(`/brain/note/${item.data.id}`)}
                />
              );
            }
            if (item.kind === 'decision') {
              return (
                <DecisionRow
                  decision={item.data}
                  onPress={() => router.push(`/brain/decision/${item.data.id}`)}
                />
              );
            }
            if (item.kind === 'person') {
              return (
                <PersonRow
                  person={item.data}
                  onPress={() => router.push(`/brain/person/${item.data.id}`)}
                />
              );
            }
            return (
              <GlossaryRow
                term={item.data}
                onPress={() => router.push(`/brain/glossary/${item.data.id}`)}
              />
            );
          }}
        />
      )}
    </Screen>
  );
}

// ─── Adapters + helpers ────────────────────────────────────────────────────

/** Map a portal note row → the shape `<NoteCard>` (from `lib/mock`) expects. */
function adaptNote(n: BrainNoteRow): MockBrainNote {
  return {
    id: String(n.id),
    title: n.title,
    excerpt: stripBody(n.body),
    updatedAt: formatRelative(n.updatedAt),
    tags: n.tags ?? [],
    icon: n.pinned ? 'push_pin' : 'description',
    authorId: n.createdBy ?? undefined,
    authorName: undefined,
    meta: `Updated ${formatRelative(n.updatedAt)}`,
  };
}

function stripBody(body: string): string {
  if (!body) return '';
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > 200 ? `${flat.slice(0, 200)}…` : flat;
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Date.now() - then;
  const day = 86_400_000;
  if (diff < day) return 'Today';
  if (diff < 2 * day) return 'Yesterday';
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  if (diff < 30 * day) return `${Math.floor(diff / (7 * day))}w ago`;
  return new Date(iso).toLocaleDateString();
}

function ListSkeleton({ kind }: { kind: BrainTab }) {
  // Eight stripes that loosely match each row layout so the page does not
  // jump on first paint.
  const count = 8;
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            gap: 12,
            paddingVertical: 14,
            paddingHorizontal: 20,
            borderBottomWidth: 0.5,
            borderBottomColor: T.borderLight,
          }}
        >
          <View
            style={{
              width: kind === 'People' ? 40 : 32,
              height: kind === 'People' ? 40 : 32,
              borderRadius: kind === 'People' ? 20 : 10,
              backgroundColor: T.bgSubtle,
            }}
          />
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ width: '60%', height: 12, borderRadius: 4, backgroundColor: T.bgSubtle }} />
            <View style={{ width: '90%', height: 10, borderRadius: 4, backgroundColor: T.bgSubtle }} />
            {kind === 'Notes' || kind === 'Glossary' ? (
              <View style={{ width: '75%', height: 10, borderRadius: 4, backgroundColor: T.bgSubtle }} />
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function EmptyState({ kind }: { kind: BrainTab }) {
  const label =
    kind === 'Notes'
      ? 'No notes yet'
      : kind === 'Decisions'
      ? 'No decisions yet'
      : kind === 'People'
      ? 'No people yet'
      : 'No glossary terms yet';
  return (
    <View style={{ alignItems: 'center', paddingTop: 56, paddingHorizontal: 24 }}>
      <MIcon name="inbox" size={32} color={T.textTertiary} />
      <Text style={{ marginTop: 12, fontSize: 14, color: T.textSecondary, fontWeight: '600' }}>
        {label}
      </Text>
      <Text style={{ marginTop: 4, fontSize: 12, color: T.textTertiary, textAlign: 'center' }}>
        Create one in the portal — it'll show up here automatically.
      </Text>
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
          Could not load
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

function DecisionRow({
  decision,
  onPress,
}: {
  decision: BrainDecisionRow;
  onPress: () => void;
}) {
  const isAccepted = decision.status === 'accepted';
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: T.borderLight }}
      style={({ pressed }) => ({
        backgroundColor: pressed ? T.bgSubtle : 'transparent',
        flexDirection: 'row',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderBottomWidth: 0.5,
        borderBottomColor: T.borderLight,
      })}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          backgroundColor: T.aiTint,
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <MIcon name="gavel" size={17} color={T.ai} fill={1} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginBottom: 3,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              fontSize: 14,
              fontWeight: '600',
              color: T.textPrimary,
              letterSpacing: -0.15,
            }}
          >
            {decision.title}
          </Text>
          <Chip
            bg={isAccepted ? '#DCFCE7' : T.bgChip}
            color={isAccepted ? T.success : T.textSecondary}
            fontSize={9}
          >
            {decision.status.toUpperCase()}
          </Chip>
        </View>
        <Text
          numberOfLines={2}
          style={{
            fontSize: 12,
            color: T.textSecondary,
            lineHeight: 17,
            marginBottom: 4,
          }}
        >
          {decision.decision}
        </Text>
        <Text style={{ fontSize: 10, color: T.textTertiary, fontWeight: '500' }}>
          Decided {formatRelative(decision.decidedAt)}
        </Text>
      </View>
    </Pressable>
  );
}

function PersonRow({
  person,
  onPress,
}: {
  person: BrainPersonListRow;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: T.borderLight }}
      style={({ pressed }) => ({
        backgroundColor: pressed ? T.bgSubtle : 'transparent',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderBottomWidth: 0.5,
        borderBottomColor: T.borderLight,
      })}
    >
      <Avatar id={person.id} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 14,
            fontWeight: '600',
            color: T.textPrimary,
            letterSpacing: -0.1,
          }}
        >
          {person.fullName}
        </Text>
        <Text
          numberOfLines={1}
          style={{ fontSize: 12, color: T.textSecondary, marginTop: 1 }}
        >
          {[person.title, person.primaryOrgUnit?.name].filter(Boolean).join(' · ') || '—'}
        </Text>
      </View>
      <MIcon name="chevron_right" size={20} color={T.textTertiary} />
    </Pressable>
  );
}

function GlossaryRow({
  term,
  onPress,
}: {
  term: BrainGlossaryListRow;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: T.borderLight }}
      style={({ pressed }) => ({
        backgroundColor: pressed ? T.bgSubtle : 'transparent',
        flexDirection: 'row',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderBottomWidth: 0.5,
        borderBottomColor: T.borderLight,
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          backgroundColor: T.aiSoft,
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Text
          style={{
            fontSize: 12,
            fontWeight: '800',
            color: T.aiDark,
            letterSpacing: -0.2,
          }}
        >
          {term.term.slice(0, 4)}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 14,
            fontWeight: '600',
            color: T.textPrimary,
            letterSpacing: -0.1,
          }}
        >
          {term.term}{' '}
          {term.shortDefinition ? (
            <Text style={{ color: T.textTertiary, fontWeight: '400' }}>
              · {term.shortDefinition}
            </Text>
          ) : null}
        </Text>
        {term.category ? (
          <Text
            numberOfLines={1}
            style={{
              fontSize: 12,
              color: T.textSecondary,
              marginTop: 2,
              lineHeight: 17,
            }}
          >
            {term.category}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

