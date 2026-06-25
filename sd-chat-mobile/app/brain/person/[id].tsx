import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, Share, Text, View } from 'react-native';

import { Avatar, MIcon } from '@/components/atoms';
import { ActionsSheet, type Action } from '@/components/brain/ActionsSheet';
import { EntitlementUpsell, Screen } from '@/components/ui';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/client';
import { useBrainPerson } from '@/lib/api/brain';
import { Gradients, T, linearGradientProps } from '@/lib/theme';

/**
 * Person profile — backed by `GET /api/portal/brain/people/[id]`. Renders
 * the portal's person row + manager + direct reports + org units +
 * expertise tags. The mockup's "Recent activity" + "Knows about" cards
 * are not represented in the people endpoint, so they're omitted; expertise
 * + org units take their place.
 */
export default function PersonDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const detailQ = useBrainPerson(id);
  const [actionsOpen, setActionsOpen] = useState(false);

  const detail = detailQ.data;
  const person = detail?.person;
  const firstName = person?.fullName.split(' ')[0] ?? '';

  const personActions = useMemo<Action[]>(() => {
    if (!person) return [];
    const portalUrl = `${api.baseUrl}/portal/brain/people/${person.id}`;
    const actions: Action[] = [
      {
        id: 'share',
        label: 'Share',
        icon: 'ios_share',
        accessibilityLabel: `Share ${person.fullName}`,
        onPress: async () => {
          try {
            await Share.share({
              title: person.fullName,
              message: `Brain person: ${person.fullName}`,
              url: portalUrl,
            });
          } catch (err) {
            console.warn('[person-actions] share failed', err);
          }
          setActionsOpen(false);
        },
      },
    ];
    // Mailto only makes sense when the row actually has an email — falling
    // through to a `mailto:` with an empty address opens the user's mail app
    // with a blank To, which is worse than not showing the action.
    if (person.email) {
      actions.push({
        id: 'email',
        label: `Email ${firstName || 'them'}`,
        icon: 'mail',
        accessibilityLabel: `Email ${person.fullName}`,
        onPress: async () => {
          try {
            await Linking.openURL(`mailto:${person.email}`);
          } catch (err) {
            console.warn('[person-actions] mailto failed', err);
          }
          setActionsOpen(false);
        },
      });
    }
    actions.push({
      id: 'open-portal',
      label: 'Open in portal',
      icon: 'open_in_new',
      accessibilityLabel: `Open ${person.fullName} in the portal`,
      onPress: async () => {
        try {
          await WebBrowser.openBrowserAsync(portalUrl);
        } catch (err) {
          console.warn('[person-actions] open portal failed', err);
        }
        setActionsOpen(false);
      },
    });
    return actions;
  }, [person, firstName]);

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
            People
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
          Person
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
      ) : detailQ.isError || !detail || !person ? (
        <ErrorState
          message={
            detailQ.error instanceof Error ? detailQ.error.message : 'Person not found'
          }
          onRetry={() => detailQ.refetch()}
        />
      ) : (
        <>
          <ScrollView contentContainerStyle={{ paddingBottom: 96 }}>
            {/* Profile header */}
            <View
              style={{
                paddingHorizontal: 20,
                paddingTop: 20,
                paddingBottom: 12,
                alignItems: 'center',
              }}
            >
              <View style={{ position: 'relative' }}>
                <Avatar id={person.id} size={88} />
                <View
                  style={{
                    position: 'absolute',
                    bottom: 2,
                    right: 2,
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor:
                      person.status === 'active' ? T.success : T.textTertiary,
                    borderWidth: 2.5,
                    borderColor: 'white',
                  }}
                />
              </View>
              <Text
                style={{
                  fontSize: 21,
                  fontWeight: '700',
                  color: T.textPrimary,
                  letterSpacing: -0.4,
                  marginTop: 12,
                }}
              >
                {person.fullName}
              </Text>
              <Text
                style={{ fontSize: 13, color: T.textSecondary, marginTop: 2 }}
              >
                {[person.title, detail.orgUnits[0]?.name].filter(Boolean).join(' · ') || '—'}
              </Text>
              {person.email ? (
                <Text style={{ fontSize: 12, color: T.textTertiary, marginTop: 4 }}>
                  {person.email}
                </Text>
              ) : null}
            </View>

            {/* Quick actions */}
            <View
              style={{
                flexDirection: 'row',
                gap: 8,
                paddingHorizontal: 20,
                paddingBottom: 12,
              }}
            >
              {[
                { i: 'chat_bubble', t: 'Message' },
                { i: 'event_available', t: 'Find time' },
                { i: 'add_circle', t: 'Add to deal' },
              ].map((a) => (
                <Pressable
                  key={a.t}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    paddingHorizontal: 6,
                    borderRadius: 999,
                    backgroundColor: T.bgCard,
                    borderWidth: 0.5,
                    borderColor: T.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 5,
                  }}
                >
                  <MIcon name={a.i} size={14} color={T.ai} fill={1} />
                  <Text style={{ color: T.ai, fontSize: 12, fontWeight: '600' }}>
                    {a.t}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Expertise chips */}
            {detail.expertise.length > 0 ? (
              <View
                style={{
                  paddingHorizontal: 20,
                  paddingBottom: 10,
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 6,
                }}
              >
                {detail.expertise.map((e) => (
                  <View
                    key={e.tagId}
                    style={{
                      backgroundColor: T.aiSoft,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 999,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '600',
                        color: T.aiDark,
                      }}
                    >
                      #{e.name}
                      {e.level !== null ? ` · L${e.level}` : ''}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Stat strip — derived from arrays we have in detail. */}
            <View
              style={{
                marginHorizontal: 16,
                marginTop: 6,
                marginBottom: 4,
                backgroundColor: T.bgCard,
                borderRadius: 14,
                paddingHorizontal: 8,
                paddingVertical: 14,
                flexDirection: 'row',
              }}
            >
              {[
                { v: detail.directReports.length, l: 'Direct reports' },
                { v: detail.orgUnits.length, l: 'Org units' },
                { v: detail.expertise.length, l: 'Expertise tags' },
              ].map((s, i, arr) => (
                <View
                  key={s.l}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    borderRightWidth: i < arr.length - 1 ? 0.5 : 0,
                    borderRightColor: T.rowDivider,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 19,
                      fontWeight: '700',
                      color: T.textPrimary,
                      letterSpacing: -0.4,
                    }}
                  >
                    {s.v}
                  </Text>
                  <Text
                    style={{
                      fontSize: 10,
                      color: T.textTertiary,
                      letterSpacing: 0.3,
                      textTransform: 'uppercase',
                      fontWeight: '600',
                      marginTop: 2,
                    }}
                  >
                    {s.l}
                  </Text>
                </View>
              ))}
            </View>

            {detail.manager ? (
              <>
                <GroupLabel>Reports to</GroupLabel>
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
                    <Avatar id={detail.manager.id} size={32} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={{
                          fontSize: 14,
                          color: T.textPrimary,
                          fontWeight: '600',
                        }}
                      >
                        {detail.manager.fullName}
                      </Text>
                      {detail.manager.title ? (
                        <Text style={{ fontSize: 11, color: T.textTertiary, marginTop: 1 }}>
                          {detail.manager.title}
                        </Text>
                      ) : null}
                    </View>
                    <MIcon name="chevron_right" size={18} color={T.textTertiary} />
                  </View>
                </Group>
              </>
            ) : null}

            {detail.directReports.length > 0 ? (
              <>
                <GroupLabel>Direct reports ({detail.directReports.length})</GroupLabel>
                <Group>
                  {detail.directReports.map((r, i, arr) => (
                    <View
                      key={r.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        borderBottomWidth: i < arr.length - 1 ? 0.5 : 0,
                        borderBottomColor: T.rowDivider,
                      }}
                    >
                      <Avatar id={r.id} size={28} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 13, color: T.textPrimary, fontWeight: '600' }}>
                          {r.fullName}
                        </Text>
                        {r.title ? (
                          <Text style={{ fontSize: 11, color: T.textTertiary, marginTop: 1 }}>
                            {r.title}
                          </Text>
                        ) : null}
                      </View>
                      <MIcon name="chevron_right" size={16} color={T.textTertiary} />
                    </View>
                  ))}
                </Group>
              </>
            ) : null}

            {detail.orgUnits.length > 0 ? (
              <>
                <GroupLabel>Org units</GroupLabel>
                <Group>
                  {detail.orgUnits.map((u, i, arr) => (
                    <View
                      key={u.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        borderBottomWidth: i < arr.length - 1 ? 0.5 : 0,
                        borderBottomColor: T.rowDivider,
                      }}
                    >
                      <View
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          backgroundColor: T.iosBlue + '22',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <MIcon name="corporate_fare" size={15} color={T.iosBlue} fill={1} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 13, color: T.textPrimary, fontWeight: '500' }}>
                          {u.name}
                          {u.primary ? (
                            <Text style={{ color: T.textTertiary, fontWeight: '400' }}> · primary</Text>
                          ) : null}
                        </Text>
                        {u.roleInUnit ? (
                          <Text style={{ fontSize: 11, color: T.textTertiary, marginTop: 1 }}>
                            {u.roleInUnit}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </Group>
              </>
            ) : null}

            {person.notes ? (
              <>
                <GroupLabel>Notes</GroupLabel>
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
                    {person.notes}
                  </Text>
                </Group>
              </>
            ) : null}
          </ScrollView>

          {/* Sticky CTA — Ask gradient pill + ⋯ More button (mirrors the
              note / decision detail screens). */}
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
              accessibilityLabel={`Ask the assistant about ${firstName || 'this person'}`}
              onPress={() => {
                const name = person?.fullName || firstName || 'this person';
                router.push({
                  pathname: '/chat/[id]',
                  params: {
                    id: 'new',
                    prompt: `Tell me about ${name}.`,
                    autoSend: '1',
                  },
                });
              }}
              style={{ flex: 1, borderRadius: 999, overflow: 'hidden' }}
            >
              <LinearGradient
                {...linearGradientProps(Gradients.ai)}
                style={{
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <MIcon name="auto_awesome" size={15} color="white" fill={1} />
                <Text style={{ color: 'white', fontSize: 13, fontWeight: '600' }}>
                  Ask the assistant about {firstName || 'this person'}
                </Text>
              </LinearGradient>
            </Pressable>
            <Pressable
              accessibilityLabel="More person actions"
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
            title={person?.fullName}
            actions={personActions}
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
    <View style={{ padding: 20, alignItems: 'center', gap: 12 }}>
      <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: T.bgSubtle }} />
      <View style={{ height: 18, width: '40%', borderRadius: 4, backgroundColor: T.bgSubtle, marginTop: 8 }} />
      <View style={{ height: 12, width: '60%', borderRadius: 4, backgroundColor: T.bgSubtle }} />
      <View style={{ height: 80, width: '100%', borderRadius: 12, backgroundColor: T.bgSubtle, marginTop: 16 }} />
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
