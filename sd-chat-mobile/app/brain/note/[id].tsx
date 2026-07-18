import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, Text, View } from 'react-native';

import { Avatar, IconTile, MIcon } from '@/components/atoms';
import { ActionsSheet, type Action } from '@/components/brain/ActionsSheet';
import { Markdown } from '@/components/brain/Markdown';
import { EntitlementUpsell, Screen } from '@/components/ui';
import { useBrainNote, useDeleteNote } from '@/lib/api/brain';
import { ApiError } from '@/lib/api/client';
import { Gradients, T, linearGradientProps } from '@/lib/theme';

/**
 * Note detail — backed by `GET /api/portal/brain/knowledge/[id]`. Shows the
 * portal-stored title + body + tags + author. The "Linked" + "Next steps"
 * + "Decisions" sections in the mockup are not in the portal schema (no
 * polymorphic note → other-entity join), so those blocks render only when
 * the note has anchor IDs set on the row itself (companyId / dealId etc.)
 * — we just show "View linked X" hints; the actual destination screens
 * lookup the entities on tap.
 */
export default function NoteDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const noteQ = useBrainNote(id);
  const deleteMut = useDeleteNote();
  const [actionsOpen, setActionsOpen] = useState(false);

  const note = noteQ.data;
  const headerTitle = note?.title ?? 'Note';

  // Action list for the bottom sheet. Memoised so identity stays stable across
  // unrelated re-renders (the sheet doesn't currently need it but it's cheap
  // and avoids surprising children that may key off the array).
  const noteActions = useMemo<Action[]>(() => {
    if (!note) return [];
    const portalUrl = `/portal/brain/notes/${note.id}`;
    return [
      {
        id: 'share',
        label: 'Share',
        icon: 'ios_share',
        accessibilityLabel: 'Share this note',
        onPress: async () => {
          try {
            await Share.share({
              title: note.title,
              message: `Brain note: ${note.title}`,
              url: portalUrl,
            });
          } catch (err) {
            console.warn('[note-actions] share failed', err);
          }
          setActionsOpen(false);
        },
      },
      {
        id: 'open-portal',
        label: 'Open in portal',
        icon: 'open_in_new',
        accessibilityLabel: 'Open this note in the portal',
        onPress: async () => {
          try {
            await WebBrowser.openBrowserAsync(portalUrl);
          } catch (err) {
            console.warn('[note-actions] openBrowserAsync failed', err);
          }
          setActionsOpen(false);
        },
      },
      {
        id: 'delete',
        label: 'Delete',
        icon: 'delete',
        destructive: true,
        loading: deleteMut.isPending,
        accessibilityLabel: 'Delete this note',
        onPress: async () => {
          await deleteMut.mutateAsync(note.id);
          setActionsOpen(false);
          router.back();
        },
      },
    ];
  }, [note, deleteMut.isPending, deleteMut, router]);

  return (
    <Screen bg={T.bgApp}>
      {/* Nav row */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 8,
          paddingTop: 4,
          paddingBottom: 6,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            padding: 8,
          }}
        >
          <MIcon name="chevron_left" size={22} color={T.ai} />
          <Text style={{ color: T.ai, fontSize: 16, marginLeft: -2 }}>
            Brain
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
          numberOfLines={1}
        >
          Note
        </Text>
      </View>

      {noteQ.isLoading ? (
        <DetailSkeleton />
      ) : noteQ.isError &&
        noteQ.error instanceof ApiError &&
        noteQ.error.code === 'BRAIN_NOT_ENTITLED' ? (
        <EntitlementUpsell
          variant="brain"
          upsellUrl={noteQ.error.upsellUrl}
          secondaryLabel="Retry"
          onSecondaryPress={() => noteQ.refetch()}
        />
      ) : noteQ.isError || !note ? (
        <ErrorState
          message={
            noteQ.error instanceof Error ? noteQ.error.message : 'Note not found'
          }
          onRetry={() => noteQ.refetch()}
        />
      ) : (
        <>
          <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
            {/* Title + author meta */}
            <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8 }}>
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: '700',
                  color: T.textPrimary,
                  letterSpacing: -0.4,
                  lineHeight: 27,
                }}
              >
                {headerTitle}
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 10,
                }}
              >
                <Avatar id={note.createdBy ?? 7} size={24} />
                <Text style={{ fontSize: 12, color: T.textSecondary }}>
                  <Text style={{ color: T.textTertiary }}>
                    Updated {formatRelative(note.updatedAt)}
                  </Text>
                </Text>
              </View>
            </View>

            {/* Body — rendered through a minimal markdown renderer so headers,
                bullets, and checkboxes display correctly instead of raw `#`. */}
            <View style={{ paddingHorizontal: 20, paddingTop: 4, marginBottom: 12 }}>
              {note.body && note.body.trim().length > 0 ? (
                <Markdown source={note.body} />
              ) : (
                <Text
                  style={{
                    fontSize: 14,
                    color: T.textTertiary,
                    fontStyle: 'italic',
                    lineHeight: 22,
                  }}
                >
                  This note has no body yet.
                </Text>
              )}
            </View>

            {/* Attachment, if any */}
            {note.attachmentUrl ? (
              <View
                style={{
                  marginHorizontal: 16,
                  marginTop: 4,
                  marginBottom: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  backgroundColor: T.bgCard,
                  borderRadius: 12,
                  borderWidth: 0.5,
                  borderColor: T.rowDivider,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
              >
                <IconTile name="attach_file" bg={T.iosBlue} fill={1} size={32} iconSize={18} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: T.textPrimary,
                    }}
                  >
                    {note.attachmentFilename ?? 'Attachment'}
                  </Text>
                  {note.attachmentMimeType ? (
                    <Text style={{ fontSize: 11, color: T.textTertiary }}>
                      {note.attachmentMimeType}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* Linked anchors — only show what the row actually has set. */}
            {(note.companyId || note.dealId || note.contactId || note.meetingId) ? (
              <View style={{ paddingHorizontal: 20, marginTop: 8 }}>
                <Text
                  style={{
                    fontSize: 11,
                    color: T.textTertiary,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                    fontWeight: '600',
                    marginBottom: 8,
                  }}
                >
                  Linked
                </Text>
                <View style={{ gap: 6 }}>
                  {note.companyId ? <LinkedCard icon="corporate_fare" iconBg={T.iosBlue} title="Linked company" sub={`Company #${note.companyId}`} /> : null}
                  {note.dealId ? <LinkedCard icon="trending_up" iconBg={T.success} title="Linked deal" sub={`Deal #${note.dealId}`} /> : null}
                  {note.contactId ? <LinkedCard icon="person" iconBg={T.iosPurple} title="Linked contact" sub={`Contact #${note.contactId}`} /> : null}
                  {note.meetingId ? <LinkedCard icon="event_note" iconBg={T.iosOrange} title="Linked meeting" sub={`Meeting #${note.meetingId}`} /> : null}
                </View>
              </View>
            ) : null}

            {/* Tags */}
            {note.tags.length > 0 ? (
              <View
                style={{
                  paddingHorizontal: 20,
                  marginTop: 16,
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 6,
                }}
              >
                {note.tags.map((tag) => (
                  <View
                    key={tag}
                    style={{
                      backgroundColor: T.bgCard,
                      borderWidth: 0.5,
                      borderColor: T.border,
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                    }}
                  >
                    <Text
                      style={{ fontSize: 11, color: T.textSecondary, fontWeight: '600' }}
                    >
                      #{tag}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </ScrollView>

          {/* Sticky AI CTA */}
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
              accessibilityLabel="Ask the assistant about this note"
              onPress={() => {
                // Seed a new chat with a starter prompt naming the note —
                // the chat composer pre-fills, the user can edit or send.
                const draft = `Tell me about my note "${note.title}".`;
                router.push({
                  pathname: '/chat/[id]',
                  params: { id: 'new', prompt: draft, autoSend: '1' },
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
                  Ask the assistant about this note
                </Text>
              </LinearGradient>
            </Pressable>
            <Pressable
              accessibilityLabel="More note actions"
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
            title={note.title}
            actions={noteActions}
          />
        </>
      )}
    </Screen>
  );
}

function LinkedCard({
  icon,
  iconBg,
  title,
  sub,
}: {
  icon: string;
  iconBg: string;
  title: string;
  sub: string;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: T.bgCard,
        borderRadius: 12,
        borderWidth: 0.5,
        borderColor: T.rowDivider,
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
    >
      <IconTile name={icon} bg={iconBg} fill={1} size={32} iconSize={18} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: 13,
            fontWeight: '600',
            color: T.textPrimary,
            letterSpacing: -0.1,
          }}
        >
          {title}
        </Text>
        <Text style={{ fontSize: 11, color: T.textTertiary, marginTop: 1 }}>
          {sub}
        </Text>
      </View>
      <MIcon name="chevron_right" size={18} color={T.textTertiary} />
    </View>
  );
}

function DetailSkeleton() {
  return (
    <View style={{ padding: 20, gap: 12 }}>
      <View style={{ height: 24, width: '70%', borderRadius: 6, backgroundColor: T.bgSubtle }} />
      <View style={{ height: 14, width: '40%', borderRadius: 4, backgroundColor: T.bgSubtle }} />
      <View style={{ height: 12, width: '100%', borderRadius: 4, backgroundColor: T.bgSubtle, marginTop: 8 }} />
      <View style={{ height: 12, width: '95%', borderRadius: 4, backgroundColor: T.bgSubtle }} />
      <View style={{ height: 12, width: '88%', borderRadius: 4, backgroundColor: T.bgSubtle }} />
      <View style={{ height: 12, width: '60%', borderRadius: 4, backgroundColor: T.bgSubtle }} />
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

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Date.now() - then;
  const day = 86_400_000;
  if (diff < day) return 'today';
  if (diff < 2 * day) return 'yesterday';
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  if (diff < 30 * day) return `${Math.floor(diff / (7 * day))}w ago`;
  return new Date(iso).toLocaleDateString();
}
