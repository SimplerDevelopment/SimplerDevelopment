import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, Text, View } from 'react-native';

import { Avatar, IconTile, MIcon } from '@/components/atoms';
import { ActionsSheet, type Action } from '@/components/brain/ActionsSheet';
import { RelatedGraph } from '@/components/brain';
import { EntitlementUpsell, Screen } from '@/components/ui';
import { api } from '@/lib/api/client';
import { useBrainGlossaryTerm } from '@/lib/api/brain';
import { ApiError } from '@/lib/api/client';
import { Gradients, T, linearGradientProps } from '@/lib/theme';

/**
 * Glossary term — backed by `GET /api/portal/brain/glossary/[id]`. The route
 * param is named `[term]` for legacy URL reasons; the value is actually the
 * numeric glossary term id (what list rows expose).
 */
export default function GlossaryTerm() {
  const { term: termParam } = useLocalSearchParams<{ term: string }>();
  const router = useRouter();
  const detailQ = useBrainGlossaryTerm(termParam);
  const [actionsOpen, setActionsOpen] = useState(false);

  const entry = detailQ.data?.term;
  const related = detailQ.data?.relatedTerms ?? [];

  const glossaryActions = useMemo<Action[]>(() => {
    if (!entry) return [];
    const portalUrl = `${api.baseUrl}/portal/brain/glossary/${entry.id}`;
    return [
      {
        id: 'share',
        label: 'Share',
        icon: 'ios_share',
        accessibilityLabel: `Share the ${entry.term} glossary entry`,
        onPress: async () => {
          try {
            await Share.share({
              title: entry.term,
              message: `Glossary: ${entry.term}`,
              url: portalUrl,
            });
          } catch (err) {
            console.warn('[glossary-actions] share failed', err);
          }
          setActionsOpen(false);
        },
      },
      {
        id: 'edit',
        label: 'Edit',
        icon: 'edit',
        accessibilityLabel: `Edit ${entry.term} in the portal`,
        onPress: async () => {
          try {
            await WebBrowser.openBrowserAsync(portalUrl);
          } catch (err) {
            console.warn('[glossary-actions] open portal failed', err);
          }
          setActionsOpen(false);
        },
      },
      {
        id: 'open-portal',
        label: 'Open in portal',
        icon: 'open_in_new',
        accessibilityLabel: `Open ${entry.term} in the portal`,
        onPress: async () => {
          try {
            await WebBrowser.openBrowserAsync(portalUrl);
          } catch (err) {
            console.warn('[glossary-actions] open portal failed', err);
          }
          setActionsOpen(false);
        },
      },
    ];
  }, [entry]);

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
            Glossary
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
          Term
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
      ) : detailQ.isError || !entry ? (
        <ErrorState
          message={
            detailQ.error instanceof Error ? detailQ.error.message : 'Term not found'
          }
          onRetry={() => detailQ.refetch()}
        />
      ) : (
        <>
          <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
            {/* Term display */}
            <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6 }}>
              <Text
                style={{
                  fontSize: 38,
                  fontWeight: '800',
                  color: T.textPrimary,
                  letterSpacing: -1,
                  lineHeight: 40,
                }}
              >
                {entry.term}
              </Text>
              {entry.shortDefinition || entry.category ? (
                <Text
                  style={{ fontSize: 13, color: T.textSecondary, marginTop: 6 }}
                >
                  {entry.shortDefinition ? (
                    <Text style={{ fontWeight: '600', color: T.textPrimary }}>
                      {entry.shortDefinition}
                    </Text>
                  ) : null}
                  {entry.category ? (
                    <Text style={{ color: T.textTertiary }}>
                      {entry.shortDefinition ? ' · ' : ''}
                      {entry.category}
                    </Text>
                  ) : null}
                </Text>
              ) : null}
              {entry.aliases.length > 0 ? (
                <Text style={{ fontSize: 11, color: T.textTertiary, marginTop: 6 }}>
                  Also called: {entry.aliases.join(', ')}
                </Text>
              ) : null}
            </View>

            {/* Definition card */}
            <View
              style={{
                marginHorizontal: 16,
                marginTop: 12,
                backgroundColor: T.bgCard,
                borderRadius: 14,
                padding: 14,
                borderWidth: 0.5,
                borderColor: T.rowDivider,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '700',
                  letterSpacing: 0.5,
                  color: T.textTertiary,
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}
              >
                Definition
              </Text>
              <Text
                style={{
                  fontSize: 13.5,
                  color: T.textPrimary,
                  lineHeight: 21,
                }}
              >
                {entry.definition}
              </Text>
            </View>

            {/* Status + slug meta */}
            <View
              style={{
                marginHorizontal: 16,
                marginTop: 10,
                backgroundColor: T.aiTint,
                borderWidth: 1,
                borderColor: T.aiBorder,
                borderRadius: 14,
                padding: 12,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 7,
                  marginBottom: 6,
                }}
              >
                <IconTile
                  name="auto_awesome"
                  size={20}
                  iconSize={12}
                  gradient={Gradients.ai}
                  fill={1}
                />
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: '700',
                    letterSpacing: 0.5,
                    color: T.aiDark,
                    textTransform: 'uppercase',
                  }}
                >
                  Term metadata
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 12.5,
                  color: T.textPrimary,
                  lineHeight: 19,
                }}
              >
                Status: {entry.status} · Source: {entry.source} · Slug: {entry.slug}
              </Text>
            </View>

            {related.length > 0 ? (
              <>
                <GroupLabel>Related terms</GroupLabel>
                <RelatedGraph
                  term={entry.term}
                  satellites={related.map((r) => r.term)}
                />
              </>
            ) : null}

            <GroupLabel>Owner</GroupLabel>
            <Group>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingHorizontal: 16,
                  paddingVertical: 11,
                }}
              >
                <Avatar id={entry.ownerId ?? 0} size={32} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      color: T.textPrimary,
                      fontWeight: '600',
                    }}
                  >
                    {entry.ownerId ? `User #${entry.ownerId}` : 'Unassigned'}
                  </Text>
                  <Text
                    style={{ fontSize: 11, color: T.textTertiary, marginTop: 1 }}
                  >
                    Owns the canonical definition
                  </Text>
                </View>
                <MIcon name="chevron_right" size={18} color={T.textTertiary} />
              </View>
            </Group>
          </ScrollView>

          {/* Sticky Ask CTA — parity with note + person detail. Pre-fills the
              composer with "Tell me about <term>." in a new chat. */}
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
              accessibilityLabel={`Ask the assistant about ${entry.term}`}
              onPress={() => {
                router.push({
                  pathname: '/chat/[id]',
                  params: {
                    id: 'new',
                    prompt: `Tell me about ${entry.term}.`,
                    autoSend: '1',
                  },
                });
              }}
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
                  Ask the assistant about {entry.term}
                </Text>
              </LinearGradient>
            </Pressable>
            <Pressable
              accessibilityLabel="More glossary actions"
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
            title={entry.term}
            actions={glossaryActions}
          />
        </>
      )}
    </Screen>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        fontSize: 11,
        color: T.textTertiary,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        fontWeight: '600',
        marginTop: 18,
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
      <View style={{ height: 40, width: '40%', borderRadius: 6, backgroundColor: T.bgSubtle }} />
      <View style={{ height: 14, width: '60%', borderRadius: 4, backgroundColor: T.bgSubtle, marginTop: 4 }} />
      <View style={{ height: 100, width: '100%', borderRadius: 12, backgroundColor: T.bgSubtle, marginTop: 16 }} />
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
