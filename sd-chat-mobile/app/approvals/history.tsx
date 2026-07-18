import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { MIcon } from '@/components/atoms';
import { Group } from '@/components/settings';
import { LargeTitle, Screen } from '@/components/ui';
import { useApprovals } from '@/lib/api/approvals';
import type { PendingChangeRow } from '@/lib/api/types/approvals';
import { T } from '@/lib/theme';
import { ApprovalTabs, type ApprovalTab } from './index';

/**
 * Approval history (approvals mockup screen 04). Tab strip mirrors the inbox
 * (Pending / History / Auto-approved). Days are rendered as labeled sections
 * of rows grouped by day. Each row's color-coded status pill mirrors the
 * mockup. "Auto-approved" routes here too; sd2026 doesn't yet expose a
 * distinct auto-approved filter (Phase 5 follow-up).
 *
 * Data: `useApprovals('history')` fans out across applied/rejected/failed
 * statuses and merges latest-first.
 */
export default function ApprovalHistoryScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<ApprovalTab>('history');
  const query = useApprovals('history');

  const filters = [
    { label: 'Last 7 days', icon: 'calendar_today' },
    { label: 'All', icon: 'inbox' },
    { label: 'Any tool', icon: 'build' },
    { label: 'Me', icon: 'person' },
  ];

  const grouped = useMemo(() => groupByDay(query.data ?? []), [query.data]);

  return (
    <Screen>
      <LargeTitle
        title="Approvals"
        right={
          <Pressable
            onPress={() => router.push('/approvals/audit')}
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: T.bgCard,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MIcon name="ios_share" size={17} color={T.textPrimary} />
          </Pressable>
        }
      />

      <ApprovalTabs
        active={tab}
        onChange={(t) => {
          setTab(t);
          if (t === 'pending') router.replace('/approvals');
        }}
      />

      {/* Filter chips (decorative — Phase 5 will wire) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, flexShrink: 0 }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingVertical: 10,
          gap: 6,
          alignItems: 'center',
        }}
      >
        {filters.map((f) => (
          <View
            key={f.label}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              backgroundColor: T.bgCard,
              borderWidth: 1,
              borderColor: T.border,
              borderRadius: 999,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <MIcon name={f.icon} size={12} color={T.textTertiary} />
            <Text
              style={{
                fontSize: 11.5,
                color: T.textSecondary,
                fontWeight: '600',
                letterSpacing: -0.05,
              }}
            >
              {f.label}
            </Text>
            <MIcon name="expand_more" size={12} color={T.textTertiary} />
          </View>
        ))}
      </ScrollView>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }}>
        {query.isLoading ? (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <ActivityIndicator color={T.ai} />
          </View>
        ) : query.isError ? (
          <EmptyState
            icon="error_outline"
            title="Couldn't load history"
            subtitle={query.error?.message ?? 'Try again.'}
          />
        ) : grouped.length === 0 ? (
          <EmptyState
            icon="history"
            title="No history yet"
            subtitle="Approved and declined items will show up here."
          />
        ) : (
          <>
            {grouped.map((day) => (
              <View key={day.label}>
                <Text
                  style={{
                    paddingHorizontal: 32,
                    paddingTop: 14,
                    paddingBottom: 6,
                    fontSize: 10.5,
                    color: T.textTertiary,
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    fontWeight: '700',
                  }}
                >
                  {day.label}
                </Text>
                <Group>
                  {day.items.map((it, i) => (
                    <View
                      key={it.id}
                      style={{
                        borderBottomWidth: i < day.items.length - 1 ? 0.5 : 0,
                        borderBottomColor: T.rowDivider,
                      }}
                    >
                      <HistoryRow row={it} />
                    </View>
                  ))}
                </Group>
              </View>
            ))}

            <Text
              style={{
                textAlign: 'center',
                paddingVertical: 18,
                fontSize: 11.5,
                color: T.textTertiary,
                letterSpacing: 0.3,
              }}
            >
              Showing {query.data?.length ?? 0} approvals ·{' '}
              <Text
                onPress={() => router.push('/approvals/audit')}
                style={{ color: T.ai, fontWeight: '600' }}
              >
                Export audit log
              </Text>
            </Text>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function HistoryRow({ row }: { row: PendingChangeRow }) {
  const statusMap = {
    applied: { icon: 'check_circle', color: T.success, bg: '#DCFCE7' },
    rejected: { icon: 'cancel', color: T.danger, bg: '#FEE2E2' },
    failed: { icon: 'error', color: T.warning, bg: '#FEF3C7' },
    pending: { icon: 'schedule', color: T.textSecondary, bg: T.bgSubtle },
  } as const;
  const s = statusMap[row.status] ?? statusMap.pending;
  const tool = `${row.entityType}_${row.operation}`;
  const when = humanizeWhen(row.reviewedAt ?? row.appliedAt ?? row.createdAt, row.submitterName);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 11,
        paddingHorizontal: 14,
        paddingVertical: 11,
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: s.bg,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 1,
        }}
      >
        <MIcon name={s.icon} size={16} color={s.color} fill={1} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 }}>
          <Text
            style={{
              fontFamily: 'Menlo',
              fontSize: 11.5,
              color: T.textPrimary,
              fontWeight: '600',
              letterSpacing: -0.2,
            }}
          >
            {tool}
          </Text>
        </View>
        {row.summary ? (
          <Text
            style={{
              fontSize: 12.5,
              color: T.textPrimary,
              fontWeight: '500',
              letterSpacing: -0.1,
              lineHeight: 17,
            }}
          >
            {row.summary}
          </Text>
        ) : null}
        <Text style={{ fontSize: 11, color: T.textTertiary, marginTop: 2 }}>{when}</Text>
        {row.reviewNote ? (
          <Text
            style={{
              fontSize: 11.5,
              color: T.textTertiary,
              marginTop: 4,
              fontStyle: 'italic',
            }}
          >
            "{row.reviewNote}"
          </Text>
        ) : null}
        {row.errorMessage ? (
          <Text
            style={{
              fontSize: 11.5,
              color: T.danger,
              marginTop: 4,
              fontFamily: 'Menlo',
            }}
            numberOfLines={2}
          >
            {row.errorMessage}
          </Text>
        ) : null}
      </View>
    </View>
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
        paddingVertical: 80,
        paddingHorizontal: 32,
      }}
    >
      <MIcon name={icon} size={36} color={T.textTertiary} />
      <Text style={{ marginTop: 12, fontSize: 15, color: T.textPrimary, fontWeight: '600' }}>
        {title}
      </Text>
      <Text style={{ marginTop: 4, fontSize: 13, color: T.textSecondary, textAlign: 'center' }}>
        {subtitle}
      </Text>
    </View>
  );
}

// ─── grouping ─────────────────────────────────────────────────────────────

interface DayGroup {
  label: string;
  items: PendingChangeRow[];
}

function groupByDay(rows: PendingChangeRow[]): DayGroup[] {
  const map = new Map<string, PendingChangeRow[]>();
  for (const r of rows) {
    const key = dayKey(r.reviewedAt ?? r.appliedAt ?? r.createdAt);
    const arr = map.get(key) ?? [];
    arr.push(r);
    map.set(key, arr);
  }
  return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
}

function dayKey(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'Earlier';
  const d = new Date(t);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function humanizeWhen(iso: string | null, submitter: string | null): string {
  if (!iso) return submitter ? `by ${submitter}` : '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return submitter ? `by ${submitter}` : '';
  const deltaMs = Date.now() - t;
  const h = Math.floor(deltaMs / 3_600_000);
  const tail = submitter ? ` by ${submitter}` : '';
  if (h < 1) return `Just now${tail}`;
  if (h < 24) return `${h}h ago${tail}`;
  const d = Math.floor(h / 24);
  if (d === 1) return `Yesterday${tail}`;
  return `${d}d ago${tail}`;
}
