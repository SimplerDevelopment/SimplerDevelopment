import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, Text, View } from 'react-native';

import { Avatar, MIcon } from '@/components/atoms';
import { ActionsSheet, type Action } from '@/components/brain/ActionsSheet';
import { EntitlementUpsell, Screen } from '@/components/ui';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/client';
import { useBrainDecision } from '@/lib/api/brain';
import type { BrainDecisionChainNode } from '@/lib/api/types/brain';
import { Gradients, T, linearGradientProps } from '@/lib/theme';

/**
 * Decision record — backed by `GET /api/portal/brain/decisions/[id]`.
 * Renders the portal's decision row + ancestors/descendants chain. The
 * "Anchors" + "Comments" + "Alternatives" rows from the mockup are stubbed
 * out unless the row actually carries that data (`alternativesConsidered`
 * text + `meetingId/noteId/companyId/dealId` anchor ids).
 */
export default function DecisionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const detailQ = useBrainDecision(id);
  const [actionsOpen, setActionsOpen] = useState(false);

  const decision = detailQ.data?.decision;
  const ancestors = detailQ.data?.ancestors ?? [];
  const descendants = detailQ.data?.descendants ?? [];

  const isAccepted = decision?.status === 'accepted';
  const isSuperseded = decision?.status === 'superseded';

  // Sheet actions are computed lazily so we don't recreate them every render
  // (the array identity changing would re-key the bottom-sheet rows).
  const decisionActions = useMemo<Action[]>(() => {
    if (!decision) return [];
    const portalUrl = `${api.baseUrl}/portal/brain/decisions/${decision.id}`;
    return [
      {
        id: 'share',
        label: 'Share',
        icon: 'ios_share',
        accessibilityLabel: 'Share this decision',
        onPress: async () => {
          try {
            await Share.share({
              title: decision.title,
              message: `Decision: ${decision.title}`,
              url: portalUrl,
            });
          } catch (err) {
            console.warn('[decision-actions] share failed', err);
          }
          setActionsOpen(false);
        },
      },
      {
        id: 'supersede',
        label: 'Supersede',
        icon: 'edit_note',
        accessibilityLabel: 'Supersede this decision',
        // Placeholder: opens the portal supersede flow until a native
        // create-superseding-decision modal lands. The portal page handles
        // the actual POST + provenance linking.
        onPress: async () => {
          try {
            await WebBrowser.openBrowserAsync(portalUrl);
          } catch (err) {
            console.warn('[decision-actions] open portal failed', err);
          }
          setActionsOpen(false);
        },
      },
      {
        id: 'open-portal',
        label: 'Open in portal',
        icon: 'open_in_new',
        accessibilityLabel: 'Open this decision in the portal',
        onPress: async () => {
          try {
            await WebBrowser.openBrowserAsync(portalUrl);
          } catch (err) {
            console.warn('[decision-actions] open portal failed', err);
          }
          setActionsOpen(false);
        },
      },
    ];
  }, [decision]);

  return (
    <Screen bg={T.bgApp}>
      {/* Nav row */}
      <View style={{ paddingHorizontal: 8, paddingTop: 4, paddingBottom: 6 }}>
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
            Decisions
          </Text>
        </Pressable>
        <Text
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            textAlign: 'center',
            fontSize: 17,
            fontWeight: '600',
            color: T.textPrimary,
            top: 12,
          }}
        >
          Decision
        </Text>
      </View>

      {detailQ.isLoading ? (
        <DetailSkeleton />
      ) : detailQ.isError &&
        detailQ.error instanceof ApiError &&
        detailQ.error.code === 'BRAIN_NOT_ENTITLED' ? (
        <EntitlementUpsell
          variant="brain"
          upsellUrl={detailQ.error.upsellUrl}
          secondaryLabel="Retry"
          onSecondaryPress={() => detailQ.refetch()}
        />
      ) : detailQ.isError || !decision ? (
        <ErrorState
          message={
            detailQ.error instanceof Error ? detailQ.error.message : 'Decision not found'
          }
          onRetry={() => detailQ.refetch()}
        />
      ) : (
        <>
          <ScrollView contentContainerStyle={{ paddingBottom: 96 }}>
            {/* Header card */}
            <View
              style={{
                marginHorizontal: 16,
                marginTop: 12,
                backgroundColor: T.bgCard,
                borderRadius: 16,
                padding: 16,
                borderWidth: 0.5,
                borderColor: T.rowDivider,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <View
                  style={{
                    backgroundColor: isAccepted
                      ? T.success
                      : isSuperseded
                      ? T.textTertiary
                      : T.warning,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 4,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '700',
                      letterSpacing: 0.8,
                      color: 'white',
                    }}
                  >
                    {decision.status.toUpperCase()}
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 11,
                    color: T.textTertiary,
                    fontWeight: '500',
                  }}
                >
                  DR-{decision.id}
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 19,
                  fontWeight: '700',
                  color: T.textPrimary,
                  letterSpacing: -0.3,
                  lineHeight: 23,
                }}
              >
                {decision.title}
              </Text>
              <View
                style={{
                  marginTop: 5,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {decision.decisionMakerId != null ? (
                  <Avatar id={decision.decisionMakerId} size={18} />
                ) : decision.createdBy != null ? (
                  <Avatar id={decision.createdBy} size={18} />
                ) : (
                  <View
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      backgroundColor: T.aiSoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <MIcon name="gavel" size={10} color={T.ai} fill={1} />
                  </View>
                )}
                <Text style={{ fontSize: 12, color: T.textSecondary }}>
                  Decided {formatDate(decision.decidedAt)}
                </Text>
              </View>
              <View style={{ marginTop: 10, flexDirection: 'row' }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    backgroundColor: '#FEF3C7',
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 999,
                  }}
                >
                  <MIcon name="undo" size={11} color={T.warning} />
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '600',
                      color: T.warning,
                    }}
                  >
                    {decision.reversibility === 'two_way' ? 'Reversible' : 'One-way door'}
                  </Text>
                </View>
              </View>
            </View>

            {decision.context ? (
              <>
                <GroupLabel mt={16}>Context</GroupLabel>
                <Group>
                  <Text
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      fontSize: 13,
                      color: T.textPrimary,
                      lineHeight: 20,
                    }}
                  >
                    {decision.context}
                  </Text>
                </Group>
              </>
            ) : null}

            <GroupLabel mt={decision.context ? 16 : 16}>Decision</GroupLabel>
            <Group>
              <Text
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  fontSize: 13,
                  color: T.textPrimary,
                  lineHeight: 20,
                }}
              >
                {decision.decision}
              </Text>
            </Group>

            <GroupLabel>Rationale</GroupLabel>
            <Group>
              <Text
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  fontSize: 13,
                  color: T.textPrimary,
                  lineHeight: 20,
                }}
              >
                {decision.rationale}
              </Text>
            </Group>

            {decision.alternativesConsidered ? (
              <>
                <GroupLabel>Alternatives considered</GroupLabel>
                <Group>
                  <Text
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      fontSize: 13,
                      color: T.textPrimary,
                      lineHeight: 20,
                    }}
                  >
                    {decision.alternativesConsidered}
                  </Text>
                </Group>
              </>
            ) : null}

            {ancestors.length > 0 ? (
              <>
                <GroupLabel>Supersedes</GroupLabel>
                <Group>
                  {ancestors.map((d, i, arr) => (
                    <ChainRow key={d.id} node={d} last={i === arr.length - 1} />
                  ))}
                </Group>
              </>
            ) : null}

            {descendants.length > 0 ? (
              <>
                <GroupLabel>Superseded by</GroupLabel>
                <Group>
                  {descendants.map((d, i, arr) => (
                    <ChainRow key={d.id} node={d} last={i === arr.length - 1} />
                  ))}
                </Group>
              </>
            ) : null}
          </ScrollView>

          {/* Action bar — simplified to [Ask, More] to match the note detail
              pattern. Supersede + Open in portal now live in the bottom sheet
              behind the ⋯ button. */}
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              paddingHorizontal: 14,
              paddingTop: 10,
              paddingBottom: 18,
              backgroundColor: 'rgba(255,255,255,0.94)',
              borderTopWidth: 0.5,
              borderTopColor: T.rowDivider,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Pressable
              accessibilityLabel="Ask the assistant about this decision"
              onPress={() =>
                router.push({
                  pathname: '/chat/[id]',
                  params: {
                    id: 'new',
                    prompt: `Tell me about the "${decision.title}" decision.`,
                    autoSend: '1',
                  },
                })
              }
              style={{ flex: 1, borderRadius: 999, overflow: 'hidden' }}
            >
              <LinearGradient
                {...linearGradientProps(Gradients.ai)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                }}
              >
                <MIcon name="auto_awesome" size={15} color="white" fill={1} />
                <Text style={{ color: 'white', fontSize: 13, fontWeight: '600' }}>
                  Ask the assistant about this decision
                </Text>
              </LinearGradient>
            </Pressable>
            <Pressable
              accessibilityLabel="More decision actions"
              onPress={() => setActionsOpen(true)}
              style={{
                width: 42,
                height: 42,
                borderRadius: 999,
                backgroundColor: T.bgCard,
                borderWidth: 0.5,
                borderColor: T.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MIcon name="more_horiz" size={20} color={T.textSecondary} />
            </Pressable>
          </View>

          <ActionsSheet
            visible={actionsOpen}
            onClose={() => setActionsOpen(false)}
            title={decision.title}
            actions={decisionActions}
          />
        </>
      )}
    </Screen>
  );
}

function ChainRow({ node, last }: { node: BrainDecisionChainNode; last: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: T.rowDivider,
      }}
    >
      <MIcon name="gavel" size={14} color={T.ai} fill={1} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 13, color: T.textPrimary, fontWeight: '500' }}>
          {node.title}
        </Text>
        <Text style={{ fontSize: 11, color: T.textTertiary, marginTop: 1 }}>
          {node.status} · {formatDate(node.decidedAt)}
        </Text>
      </View>
      <MIcon name="chevron_right" size={16} color={T.textTertiary} />
    </View>
  );
}

function GroupLabel({
  children,
  mt = 24,
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

function DetailSkeleton() {
  return (
    <View style={{ padding: 20, gap: 12 }}>
      <View style={{ height: 24, width: '50%', borderRadius: 6, backgroundColor: T.bgSubtle }} />
      <View style={{ height: 18, width: '90%', borderRadius: 4, backgroundColor: T.bgSubtle, marginTop: 4 }} />
      <View style={{ height: 80, width: '100%', borderRadius: 12, backgroundColor: T.bgSubtle, marginTop: 16 }} />
      <View style={{ height: 80, width: '100%', borderRadius: 12, backgroundColor: T.bgSubtle, marginTop: 8 }} />
    </View>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
