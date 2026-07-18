import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { MIcon } from '@/components/atoms';
import { ApprovalRow } from '@/components/approvals';
import { Group, GroupFooter } from '@/components/settings';
import { LargeTitle, Screen } from '@/components/ui';
import { useApprovals } from '@/lib/api/approvals';
import type { PendingChangeRow } from '@/lib/api/types/approvals';
import type { Approval, ApprovalScope } from '@/lib/mock';
import { T } from '@/lib/theme';

/**
 * Approvals inbox (approvals mockup screen 01). Renders pending items from
 * `/api/portal/approvals?status=pending` as <ApprovalRow>s inside a single
 * grouped card, with a tab strip (Pending / History / Auto-approved) above
 * and a sticky bottom bar that routes to the bulk-approval screen.
 *
 * Tapping a row → /approvals/[id]. Tapping the chevron tab "History" routes
 * to /approvals/history. "Auto-approved" routes there too (sd2026 doesn't
 * yet expose a distinct auto-approved filter — Phase 5 follow-up).
 */
export default function ApprovalsInbox() {
  const router = useRouter();
  const query = useApprovals('pending');

  const items: Approval[] = (query.data ?? []).map(toMockApproval);
  const count = query.data?.length ?? 0;

  return (
    <Screen>
      <LargeTitle
        title="Approvals"
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 9,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: T.warning + '22',
              }}
            >
              <MIcon name="schedule" size={12} color="#92580E" fill={1} />
              <Text
                style={{
                  color: '#92580E',
                  fontSize: 11,
                  fontWeight: '700',
                  letterSpacing: 0.2,
                }}
              >
                {count} PENDING
              </Text>
            </View>
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
              accessibilityLabel="Audit export"
              accessibilityRole="button"
            >
              <MIcon name="tune" size={18} color={T.textPrimary} />
            </Pressable>
          </View>
        }
      />

      <ApprovalTabs
        active="pending"
        pendingCount={count}
        onChange={(tab) => {
          if (tab === 'history' || tab === 'auto') router.push('/approvals/history');
        }}
      />

      {/* Search bar (decorative — Phase 5 will wire) */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 12,
            paddingVertical: 8,
            backgroundColor: T.bgChip,
            borderRadius: 10,
          }}
        >
          <MIcon name="search" size={17} color={T.textTertiary} />
          <Text style={{ fontSize: 13.5, color: T.textTertiary, letterSpacing: -0.1 }}>
            Filter by tool, conversation, or person…
          </Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 96 }}>
        {query.isLoading ? (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <ActivityIndicator color={T.ai} />
          </View>
        ) : query.isError ? (
          <EmptyState
            icon="error_outline"
            title="Couldn't load approvals"
            subtitle={query.error?.message ?? 'Try pulling to refresh.'}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon="inbox"
            title="Inbox zero"
            subtitle="No pending approvals — the assistant is up to date."
          />
        ) : (
          <>
            <Group>
              {items.map((a, i) => (
                <ApprovalRow
                  key={a.id}
                  approval={a}
                  last={i === items.length - 1}
                  onPress={() => router.push(`/approvals/${a.id}`)}
                />
              ))}
            </Group>
            <GroupFooter>
              Tap to see context, args, and impact — or swipe right to approve, left to decline.
            </GroupFooter>
          </>
        )}
      </ScrollView>

      {/* Sticky bottom bar */}
      {items.length > 0 ? (
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: 14,
            backgroundColor: 'rgba(240,241,244,0.96)',
            borderTopWidth: 0.5,
            borderTopColor: T.rowDivider,
            flexDirection: 'row',
            gap: 8,
          }}
        >
          <Pressable
            onPress={() => router.push('/approvals/bulk')}
            style={({ pressed }) => ({
              flex: 1,
              paddingVertical: 11,
              backgroundColor: T.bgCard,
              borderWidth: 1,
              borderColor: T.border,
              borderRadius: 11,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <MIcon name="check_box" size={16} color={T.textSecondary} />
            <Text
              style={{
                color: T.textPrimary,
                fontSize: 13,
                fontWeight: '600',
                letterSpacing: -0.1,
              }}
            >
              Select multiple
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/approvals/bulk')}
            style={({ pressed }) => ({
              flex: 1.4,
              paddingVertical: 11,
              backgroundColor: T.aiTint,
              borderWidth: 1,
              borderColor: T.aiBorder,
              borderRadius: 11,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <MIcon name="auto_awesome_motion" size={15} color={T.ai} fill={1} />
            <Text
              style={{
                color: T.aiDark,
                fontSize: 13,
                fontWeight: '600',
                letterSpacing: -0.1,
              }}
            >
              Bulk approve ({count})
            </Text>
          </Pressable>
        </View>
      ) : null}
    </Screen>
  );
}

// ─── tabs ─────────────────────────────────────────────────────────────────

export type ApprovalTab = 'pending' | 'history' | 'auto';

export function ApprovalTabs({
  active,
  pendingCount,
  onChange,
}: {
  active: ApprovalTab;
  pendingCount?: number;
  onChange: (t: ApprovalTab) => void;
}) {
  const tabs: { id: ApprovalTab; label: string; count?: number; suffix?: string }[] = [
    { id: 'pending', label: 'Pending', count: pendingCount },
    { id: 'history', label: 'History' },
    { id: 'auto', label: 'Auto-approved' },
  ];
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 4,
        paddingHorizontal: 18,
        paddingTop: 4,
        borderBottomWidth: 0.5,
        borderBottomColor: T.rowDivider,
      }}
    >
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <Pressable
            key={t.id}
            onPress={() => onChange(t.id)}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 10,
              borderBottomWidth: 2.5,
              borderBottomColor: isActive ? T.ai : 'transparent',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Text
              style={{
                fontSize: 13.5,
                fontWeight: isActive ? '700' : '500',
                color: isActive ? T.textPrimary : T.textSecondary,
                letterSpacing: -0.1,
              }}
            >
              {t.label}
            </Text>
            {t.count != null && t.count > 0 ? (
              <View
                style={{
                  paddingHorizontal: 6,
                  paddingVertical: 1.5,
                  borderRadius: 999,
                  backgroundColor: isActive ? T.aiSoft : T.bgChip,
                }}
              >
                <Text
                  style={{
                    fontSize: 10.5,
                    fontWeight: '700',
                    color: isActive ? T.aiDark : T.textTertiary,
                  }}
                >
                  {t.count}
                  {t.suffix ?? ''}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────

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
      <Text
        style={{
          marginTop: 12,
          fontSize: 15,
          color: T.textPrimary,
          fontWeight: '600',
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          marginTop: 4,
          fontSize: 13,
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
 * Re-shape a `PendingChangeRow` from the portal into the legacy `Approval`
 * mock shape so the existing `ApprovalRow` component keeps working. The
 * scope is inferred from `entityType + operation` (e.g.
 * `crm_deals + create` → `crm.write`).
 */
export function toMockApproval(row: PendingChangeRow): Approval {
  const scope = entityToScope(row.entityType, row.operation);
  return {
    id: String(row.id),
    scope,
    tool: `${row.entityType}_${row.operation}`,
    description: row.summary ?? `${row.operation} ${row.entityType}`,
    meta: row.keyName ? `from ${row.keyName}` : 'from automation',
    time: shortAgo(row.createdAt),
    tint: T.iosBlue,
    destructive: row.operation === 'delete',
    warn: row.entityType === 'email_campaigns' && row.operation === 'send',
  };
}

function entityToScope(entityType: string, operation: string): ApprovalScope {
  const verb = operation === 'send' ? 'send' : operation === 'list' || operation === 'get' ? 'read' : 'write';
  if (entityType.startsWith('crm') || entityType.startsWith('deals') || entityType.startsWith('contacts')) {
    return `crm.${verb === 'send' ? 'write' : verb}` as ApprovalScope;
  }
  if (entityType.startsWith('email')) return 'email.send';
  if (entityType.startsWith('posts')) return 'posts.write';
  if (entityType.startsWith('brain')) return `brain.${verb === 'send' ? 'write' : verb}` as ApprovalScope;
  if (entityType.startsWith('tickets')) return 'tickets.write';
  if (entityType.startsWith('kanban')) return 'kanban.write';
  if (entityType.startsWith('media')) return 'media.write';
  if (entityType.startsWith('store')) return 'store.write';
  return 'crm.write';
}

function shortAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
