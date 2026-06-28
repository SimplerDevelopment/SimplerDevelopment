import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { AiAvatar, MIcon } from '@/components/atoms';
import { ScopeChip } from '@/components/approvals';
import { GroupFooter } from '@/components/settings';
import { LargeTitle, Screen } from '@/components/ui';
import { useApprovals, useBulkApprove, useBulkReject } from '@/lib/api/approvals';
import type { PendingChangeRow } from '@/lib/api/types/approvals';
import { Gradients, T, linearGradientProps } from '@/lib/theme';
import { toMockApproval } from './index';

/**
 * Bulk approval (approvals mockup screen 03). Multi-select pattern. Pulls
 * the live pending list from `useApprovals('pending')` and groups them by
 * tool (entityType + operation). Each group is one selectable card.
 *
 * Bulk submission uses the portal's native `/api/portal/approvals/bulk-approve`
 * + `/api/portal/approvals/bulk-reject` endpoints (server caps at 25 per
 * call; the hook chunks for us).
 */
export default function BulkApproval() {
  const router = useRouter();
  const query = useApprovals('pending');
  const bulkApprove = useBulkApprove();
  const bulkReject = useBulkReject();

  const [selected, setSelected] = useState<Set<number>>(new Set());

  const rows = query.data ?? [];
  const groups = useMemo(() => groupByTool(rows), [rows]);
  const checkedCount = selected.size;

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectAll = () =>
    setSelected(new Set(rows.map((r) => r.id)));

  const onApproveAll = async () => {
    if (checkedCount === 0) return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const result = await bulkApprove.mutateAsync({ ids: Array.from(selected) });
      if (result.failed > 0) {
        Alert.alert(
          'Bulk approve finished',
          `${result.applied} applied, ${result.failed} failed, ${result.skipped} skipped.`,
        );
      }
      router.back();
    } catch (err) {
      Alert.alert('Bulk approve failed', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const onDeclineAll = () => {
    if (checkedCount === 0) return;
    Alert.alert(`Decline ${checkedCount}?`, 'All selected approvals will be rejected.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          try {
            await bulkReject.mutateAsync({ ids: Array.from(selected) });
            router.back();
          } catch (err) {
            Alert.alert('Bulk decline failed', err instanceof Error ? err.message : 'Unknown error');
          }
        },
      },
    ]);
  };

  const busy = bulkApprove.isPending || bulkReject.isPending;

  return (
    <Screen>
      <LargeTitle
        title="Approvals"
        subtitle="Multi-select mode"
        right={
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => ({
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: T.border,
              backgroundColor: T.bgCard,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: T.ai, fontSize: 13, fontWeight: '600' }}>Cancel</Text>
          </Pressable>
        }
      />

      {/* Selection summary */}
      <View style={{ marginHorizontal: 16, marginBottom: 10 }}>
        <LinearGradient
          {...linearGradientProps(Gradients.ai)}
          style={{ borderRadius: 14, padding: 14 }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 6,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MIcon name="check_circle" size={18} color="white" fill={1} />
              <Text
                style={{ color: 'white', fontSize: 14, fontWeight: '700', letterSpacing: -0.1 }}
              >
                {checkedCount} selected
              </Text>
            </View>
            {rows.length > 0 ? (
              <Pressable onPress={selectAll}>
                <Text
                  style={{
                    color: 'white',
                    fontSize: 11.5,
                    fontWeight: '600',
                    opacity: 0.9,
                    letterSpacing: 0.2,
                    textTransform: 'uppercase',
                  }}
                >
                  Select all {rows.length}
                </Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={{ color: 'white', fontSize: 11.5, opacity: 0.92, lineHeight: 17 }}>
            {checkedCount === 0
              ? 'Pick items below to bulk approve or decline.'
              : `Bulk apply will run in batches of 25, serially server-side.`}
          </Text>
        </LinearGradient>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 130 }}>
        {query.isLoading ? (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <ActivityIndicator color={T.ai} />
          </View>
        ) : query.isError ? (
          <EmptyState
            icon="error_outline"
            title="Couldn't load pending approvals"
            subtitle={query.error?.message ?? 'Try again.'}
          />
        ) : rows.length === 0 ? (
          <EmptyState icon="inbox" title="Nothing pending" subtitle="Inbox zero." />
        ) : (
          <>
            {groups.map((g) => (
              <View key={g.key} style={{ marginHorizontal: 16, marginTop: 4, marginBottom: 12 }}>
                <View
                  style={{
                    backgroundColor: T.bgCard,
                    borderWidth: 1.5,
                    borderStyle: 'dashed',
                    borderColor: T.aiBorder,
                    borderRadius: 14,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      padding: 14,
                      backgroundColor: T.aiTint,
                      borderBottomWidth: 0.5,
                      borderBottomColor: T.aiBorder,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <LinearGradient
                      {...linearGradientProps(Gradients.ai)}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 7,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <MIcon name="auto_mode" size={15} color="white" fill={1} />
                    </LinearGradient>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={{
                          fontSize: 12.5,
                          color: T.aiDark,
                          fontWeight: '700',
                          letterSpacing: -0.1,
                        }}
                      >
                        {g.items.length} call{g.items.length === 1 ? '' : 's'} ·{' '}
                        <Text style={{ fontFamily: 'Menlo', color: T.ai }}>{g.key}</Text>
                      </Text>
                      <Text
                        style={{
                          fontSize: 10.5,
                          color: T.textTertiary,
                          marginTop: 1,
                          fontWeight: '500',
                        }}
                      >
                        Tap rows to select; or use "Select all" above.
                      </Text>
                    </View>
                  </View>

                  {g.items.map((it, i) => (
                    <BulkRow
                      key={it.id}
                      row={it}
                      checked={selected.has(it.id)}
                      last={i === g.items.length - 1}
                      onPress={() => toggle(it.id)}
                    />
                  ))}
                </View>
              </View>
            ))}
            <GroupFooter>
              Selecting items from different tools is fine — they'll fire in sequence, not in parallel.
            </GroupFooter>
          </>
        )}
      </ScrollView>

      {/* Sticky bottom */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          paddingHorizontal: 14,
          paddingTop: 8,
          paddingBottom: 16,
          backgroundColor: 'rgba(255,255,255,0.98)',
          borderTopWidth: 0.5,
          borderTopColor: T.rowDivider,
        }}
      >
        <View
          style={{
            marginBottom: 8,
            paddingHorizontal: 10,
            paddingVertical: 6,
            backgroundColor: T.bgSubtle,
            borderRadius: 8,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <MIcon name="schedule" size={13} color={T.textTertiary} />
          <Text style={{ fontSize: 11, color: T.textSecondary }}>
            Server runs in sequence ·{' '}
            <Text style={{ color: T.textPrimary, fontWeight: '700' }}>
              ~{Math.max(1, checkedCount)} second{checkedCount === 1 ? '' : 's'} total
            </Text>
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={onDeclineAll}
            disabled={checkedCount === 0 || busy}
            style={({ pressed }) => ({
              flex: 1,
              paddingVertical: 12,
              backgroundColor: T.bgCard,
              borderWidth: 1,
              borderColor: T.border,
              borderRadius: 12,
              alignItems: 'center',
              opacity: pressed || checkedCount === 0 || busy ? 0.5 : 1,
            })}
          >
            <Text
              style={{
                color: T.danger,
                fontSize: 13.5,
                fontWeight: '600',
                letterSpacing: -0.1,
              }}
            >
              {bulkReject.isPending ? 'Declining…' : `Decline ${checkedCount}`}
            </Text>
          </Pressable>
          <Pressable
            onPress={onApproveAll}
            disabled={checkedCount === 0 || busy}
            style={({ pressed }) => ({
              flex: 1.8,
              borderRadius: 12,
              overflow: 'hidden',
              opacity: pressed || checkedCount === 0 || busy ? 0.5 : 1,
            })}
          >
            <LinearGradient
              {...linearGradientProps(Gradients.ai)}
              style={{
                paddingVertical: 12,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              {bulkApprove.isPending ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <MIcon name="check_circle" size={16} color="white" fill={1} />
              )}
              <Text style={{ color: 'white', fontSize: 14, fontWeight: '700' }}>
                {bulkApprove.isPending
                  ? 'Approving…'
                  : `Approve ${checkedCount} selected`}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

function BulkRow({
  row,
  checked,
  last,
  onPress,
}: {
  row: PendingChangeRow;
  checked: boolean;
  last?: boolean;
  onPress: () => void;
}) {
  const approval = toMockApproval(row);
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
      <CheckBox checked={checked} onPress={onPress} />
      <AiAvatar size={28} ring={false} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            marginBottom: 3,
          }}
        >
          <ScopeChip scope={approval.scope} />
        </View>
        <Text
          style={{
            fontSize: 13,
            color: T.textPrimary,
            fontWeight: '600',
            letterSpacing: -0.1,
          }}
          numberOfLines={2}
        >
          {approval.description}
        </Text>
        <Text style={{ fontSize: 11, color: T.textTertiary, marginTop: 1 }}>
          {approval.meta} · {approval.time}
        </Text>
      </View>
    </Pressable>
  );
}

function CheckBox({ checked, onPress }: { checked: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6}>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          borderWidth: checked ? 0 : 1.5,
          borderColor: T.border,
          backgroundColor: checked ? T.ai : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? <MIcon name="check" size={15} color="white" /> : null}
      </View>
    </Pressable>
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
      <Text style={{ marginTop: 12, fontSize: 15, color: T.textPrimary, fontWeight: '600' }}>
        {title}
      </Text>
      <Text style={{ marginTop: 4, fontSize: 13, color: T.textSecondary, textAlign: 'center' }}>
        {subtitle}
      </Text>
    </View>
  );
}

interface ToolGroup {
  key: string; // `${entityType}_${operation}`
  items: PendingChangeRow[];
}

function groupByTool(rows: PendingChangeRow[]): ToolGroup[] {
  const map = new Map<string, PendingChangeRow[]>();
  for (const r of rows) {
    const k = `${r.entityType}_${r.operation}`;
    const arr = map.get(k) ?? [];
    arr.push(r);
    map.set(k, arr);
  }
  // Largest group first, so "similar" approvals cluster at the top.
  return Array.from(map.entries())
    .map(([key, items]) => ({ key, items }))
    .sort((a, b) => b.items.length - a.items.length);
}

