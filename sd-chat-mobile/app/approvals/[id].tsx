import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { AiAvatar, MIcon } from '@/components/atoms';
import { ScopeChip } from '@/components/approvals';
import { Group, GroupLabel, PushedNav } from '@/components/settings';
import { Screen } from '@/components/ui';
import { useApproval, useApprove, useApprovals, useReject } from '@/lib/api/approvals';
import type { ApprovalDetailResponse } from '@/lib/api/types/approvals';
import { Gradients, T, linearGradientProps } from '@/lib/theme';
import { toMockApproval } from './index';

/**
 * Single approval detail (approvals mockup screen 02). Renders the hero card
 * (scope chip + tool name + "AWAITING YOU" badge), the requested-by strip,
 * the originating channel, an argument table (drawn from the change's raw
 * payload), and a sticky bottom Decline / Approve bar.
 *
 * Approving fires a haptic + inline toast, the optimistic mutation removes
 * the row from the pending list, and the screen routes back. Declining
 * shows a confirm Alert and on confirm reject + route back.
 */
export default function ApprovalDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const detailQuery = useApproval(id);
  const listQuery = useApprovals('pending');
  const approveMutation = useApprove();
  const rejectMutation = useReject();

  // For the "Approval · 03 of 12" header — derive index/total from the
  // pending list (cached from the inbox).
  const { index, total } = useMemo(() => {
    const idNum = Number(id);
    const list = listQuery.data ?? [];
    const found = list.findIndex((c) => c.id === idNum);
    return {
      index: found >= 0 ? found + 1 : 1,
      total: list.length || 1,
    };
  }, [id, listQuery.data]);

  const approval = useMemo(() => {
    if (!detailQuery.data) return null;
    return toMockApproval({
      id: detailQuery.data.change.id,
      entityType: detailQuery.data.change.entityType,
      entityId: detailQuery.data.change.entityId,
      operation: detailQuery.data.change.operation,
      summary: detailQuery.data.change.summary,
      status: detailQuery.data.change.status,
      keyId: detailQuery.data.change.keyId,
      keyName: detailQuery.data.keyName,
      submitterName: detailQuery.data.submitterName,
      reviewerId: detailQuery.data.change.reviewerId,
      reviewedAt: detailQuery.data.change.reviewedAt,
      reviewNote: detailQuery.data.change.reviewNote,
      appliedAt: detailQuery.data.change.appliedAt,
      errorMessage: detailQuery.data.change.errorMessage,
      createdAt: detailQuery.data.change.createdAt,
    });
  }, [detailQuery.data]);

  const args = useMemo(() => payloadToArgs(detailQuery.data), [detailQuery.data]);

  const onApprove = async () => {
    const idNum = Number(id);
    if (Number.isNaN(idNum)) return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await approveMutation.mutateAsync({ id: idNum });
      setConfirmation('Approved');
      setTimeout(() => router.back(), 700);
    } catch (err) {
      Alert.alert('Approval failed', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const onDecline = () => {
    const idNum = Number(id);
    if (Number.isNaN(idNum)) return;
    Alert.alert(
      'Decline this approval?',
      'The assistant will be told the action was rejected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            try {
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              await rejectMutation.mutateAsync({ id: idNum });
              router.back();
            } catch (err) {
              Alert.alert('Decline failed', err instanceof Error ? err.message : 'Unknown error');
            }
          },
        },
      ],
    );
  };

  if (detailQuery.isLoading) {
    return (
      <Screen>
        <PushedNav title="Approval" backLabel="Approvals" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={T.ai} />
        </View>
      </Screen>
    );
  }

  if (detailQuery.isError || !approval || !detailQuery.data) {
    return (
      <Screen>
        <PushedNav title="Approval" backLabel="Approvals" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <MIcon name="error_outline" size={36} color={T.textTertiary} />
          <Text style={{ marginTop: 12, fontSize: 15, fontWeight: '600', color: T.textPrimary }}>
            Couldn't load approval
          </Text>
          <Text style={{ marginTop: 4, fontSize: 13, color: T.textSecondary, textAlign: 'center' }}>
            {detailQuery.error?.message ?? 'It may have already been resolved.'}
          </Text>
        </View>
      </Screen>
    );
  }

  const submitterName = detailQuery.data.submitterName ?? 'Automation';
  const submitterEmail = detailQuery.data.submitterEmail;
  const keyName = detailQuery.data.keyName;
  const isPending = detailQuery.data.change.status === 'pending';

  return (
    <Screen>
      <PushedNav
        title={`Approval · ${String(index).padStart(2, '0')} of ${total}`}
        backLabel="Approvals"
        onBack={() => router.back()}
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 140 }}>
        {/* Hero card */}
        <View style={{ marginHorizontal: 16, marginTop: 12 }}>
          <View
            style={{
              backgroundColor: T.bgCard,
              borderRadius: 16,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: T.aiBorder,
            }}
          >
            <LinearGradient
              {...linearGradientProps(Gradients.ai)}
              style={{ height: 4 }}
            />
            <View style={{ padding: 16 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <ScopeChip scope={approval.scope} />
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 999,
                    backgroundColor: T.warning + '22',
                  }}
                >
                  <MIcon name="schedule" size={10} color="#92580E" fill={1} />
                  <Text
                    style={{
                      color: '#92580E',
                      fontSize: 9.5,
                      fontWeight: '700',
                      letterSpacing: 0.5,
                    }}
                  >
                    {isPending
                      ? `AWAITING YOU · ${approval.time.toUpperCase()}`
                      : detailQuery.data.change.status.toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text
                style={{
                  fontFamily: 'Menlo',
                  fontSize: 19,
                  fontWeight: '700',
                  color: T.textPrimary,
                  letterSpacing: -0.4,
                  marginBottom: 4,
                }}
              >
                {approval.tool}
              </Text>
              <Text style={{ fontSize: 12.5, color: T.textSecondary, lineHeight: 18 }}>
                {approval.description}
              </Text>
            </View>

            {/* Requested by */}
            <View
              style={{
                padding: 14,
                borderTopWidth: 0.5,
                borderTopColor: T.rowDivider,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <AiAvatar size={32} ring={false} />
              <View style={{ flex: 1 }}>
                <Text
                  style={{ fontSize: 13, color: T.textPrimary, fontWeight: '600' }}
                >
                  {submitterName}
                </Text>
                <Text style={{ fontSize: 11.5, color: T.textTertiary, marginTop: 1 }}>
                  {submitterEmail ?? (keyName ? `via ${keyName}` : 'via MCP automation')}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 7,
                  paddingVertical: 2.5,
                  borderRadius: 999,
                  backgroundColor: '#DCFCE7',
                }}
              >
                <MIcon name="verified" size={11} color={T.success} fill={1} />
                <Text
                  style={{
                    fontSize: 10.5,
                    color: T.success,
                    fontWeight: '700',
                    letterSpacing: 0.3,
                  }}
                >
                  SCOPE OK
                </Text>
              </View>
            </View>

            {keyName ? (
              <View
                style={{
                  padding: 14,
                  borderTopWidth: 0.5,
                  borderTopColor: T.rowDivider,
                  backgroundColor: T.bgSubtle,
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    color: T.textTertiary,
                    fontWeight: '700',
                    letterSpacing: 0.5,
                    marginBottom: 4,
                  }}
                >
                  FROM
                </Text>
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                >
                  <MIcon name="vpn_key" size={13} color={T.ai} />
                  <Text
                    style={{ fontSize: 12.5, color: T.textPrimary, fontWeight: '600' }}
                  >
                    {keyName}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
        </View>

        {/* Arguments */}
        {args.length > 0 ? (
          <>
            <GroupLabel mt={18}>Arguments</GroupLabel>
            <Group>
              <View style={{ paddingVertical: 4 }}>
                {args.map((a, i) => (
                  <View
                    key={a.key}
                    style={{
                      flexDirection: 'row',
                      gap: 12,
                      paddingVertical: 9,
                      paddingHorizontal: 14,
                      borderBottomWidth: i < args.length - 1 ? 0.5 : 0,
                      borderBottomColor: T.rowDivider,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: 'Menlo',
                        fontSize: 11.5,
                        color: T.ai,
                        fontWeight: '600',
                        width: 92,
                        letterSpacing: -0.2,
                      }}
                    >
                      {a.key}
                    </Text>
                    <Text
                      style={{
                        flex: 1,
                        fontSize: 12.5,
                        color: T.textPrimary,
                        fontWeight: '500',
                        letterSpacing: -0.1,
                      }}
                    >
                      {a.value}
                    </Text>
                  </View>
                ))}
              </View>
            </Group>
          </>
        ) : null}

        {detailQuery.data.change.errorMessage ? (
          <>
            <GroupLabel>Error</GroupLabel>
            <View style={{ marginHorizontal: 16 }}>
              <View
                style={{
                  backgroundColor: '#FEE2E2',
                  borderWidth: 1,
                  borderColor: T.danger + '33',
                  borderRadius: 14,
                  padding: 14,
                }}
              >
                <Text style={{ fontSize: 12.5, color: T.danger, fontFamily: 'Menlo' }}>
                  {detailQuery.data.change.errorMessage}
                </Text>
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>

      {/* Sticky bottom action bar */}
      {isPending ? (
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
          {confirmation ? (
            <View
              style={{
                marginBottom: 8,
                paddingVertical: 8,
                paddingHorizontal: 12,
                backgroundColor: '#DCFCE7',
                borderRadius: 10,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <MIcon name="check_circle" size={16} color={T.success} fill={1} />
              <Text style={{ color: T.success, fontWeight: '700', fontSize: 13 }}>
                {confirmation}
              </Text>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              accessibilityLabel="Decline this approval"
              onPress={onDecline}
              disabled={rejectMutation.isPending || approveMutation.isPending}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 12,
                backgroundColor: T.bgCard,
                borderWidth: 1,
                borderColor: T.border,
                borderRadius: 12,
                alignItems: 'center',
                opacity: pressed || rejectMutation.isPending ? 0.6 : 1,
              })}
            >
              <Text
                style={{ color: T.danger, fontSize: 13.5, fontWeight: '600', letterSpacing: -0.1 }}
              >
                {rejectMutation.isPending ? 'Declining…' : 'Decline'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Approve this request"
              onPress={onApprove}
              disabled={approveMutation.isPending || rejectMutation.isPending}
              style={({ pressed }) => ({
                flex: 1.8,
                borderRadius: 12,
                overflow: 'hidden',
                opacity: pressed || approveMutation.isPending ? 0.7 : 1,
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
                {approveMutation.isPending ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <MIcon name="check_circle" size={16} color="white" fill={1} />
                )}
                <Text style={{ color: 'white', fontSize: 14, fontWeight: '700' }}>
                  {approveMutation.isPending ? 'Approving…' : 'Approve'}
                </Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

/**
 * Walk the change's raw payload and project it into a key/value list for
 * the arguments table. Nested objects/arrays are JSON-stringified.
 */
function payloadToArgs(
  detail: ApprovalDetailResponse | undefined,
): { key: string; value: string }[] {
  if (!detail?.change.payload) return [];
  const payload = detail.change.payload;
  if (typeof payload !== 'object' || payload === null) {
    return [{ key: 'payload', value: String(payload) }];
  }
  const obj = payload as Record<string, unknown>;
  return Object.entries(obj).map(([key, value]) => ({
    key,
    value:
      value === null
        ? 'null'
        : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value),
  }));
}
