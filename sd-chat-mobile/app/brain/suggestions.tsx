import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { MIcon } from '@/components/atoms';
import { SuggestionCard } from '@/components/brain';
import { EntitlementUpsell, LargeTitle, Screen } from '@/components/ui';
import {
  useBrainSuggestions,
  useMarkNoteFollowupsDone,
  useTouchDecision,
} from '@/lib/api/brain';
import { ApiError } from '@/lib/api/client';
import type { BrainSuggestion } from '@/lib/mock/brain';
import { Gradients, T, linearGradientProps } from '@/lib/theme';

function navigateForSuggestion(
  s: BrainSuggestion,
  router: ReturnType<typeof useRouter>,
) {
  if (!s.entityType || s.entityId == null) return;
  switch (s.entityType) {
    case 'decision':
      router.push(`/brain/decision/${s.entityId}`);
      break;
    case 'note':
      router.push(`/brain/note/${s.entityId}`);
      break;
    case 'glossary_term':
      router.push(`/brain/glossary/${s.entityId}`);
      break;
  }
}

/**
 * Resolve the primary CTA on a suggestion to an actual action when one exists.
 * "Still accepted" on a decision_stale suggestion patches decidedAt=now so the
 * decision drops out of the stale-list — much better UX than navigating to a
 * detail screen and asking the user to figure it out themselves.
 */
function handlePrimaryAction(
  s: BrainSuggestion,
  router: ReturnType<typeof useRouter>,
  touchDecision: ReturnType<typeof useTouchDecision>,
) {
  if (s.cta1 === 'Still accepted' && s.entityType === 'decision' && s.entityId != null) {
    touchDecision.mutate(s.entityId);
    return;
  }
  navigateForSuggestion(s, router);
}

/**
 * Resolve the secondary CTA. "Mark done" on a note_followup_stale suggestion
 * flips every `- [ ]` in the note body to `- [x]` and refreshes suggestions
 * so the card drops out. Defaults to the same navigation as primary.
 */
function handleSecondaryAction(
  s: BrainSuggestion,
  router: ReturnType<typeof useRouter>,
  markFollowupsDone: ReturnType<typeof useMarkNoteFollowupsDone>,
) {
  if (s.cta2 === 'Mark done' && s.entityType === 'note' && s.entityId != null) {
    markFollowupsDone.mutate(s.entityId);
    return;
  }
  navigateForSuggestion(s, router);
}

/**
 * AI suggestions feed. Backed by `useBrainSuggestions()` →
 * `GET /api/portal/brain/suggestions`. The hook adapts the server's
 * presentation-agnostic payload into the visual `BrainSuggestion` shape.
 * 402 BRAIN_NOT_ENTITLED → render the upsell card instead of the generic
 * empty state.
 */
export default function BrainSuggestions() {
  const router = useRouter();
  const suggestionsQ = useBrainSuggestions();
  const touchDecision = useTouchDecision();
  const markFollowupsDone = useMarkNoteFollowupsDone();
  const suggestions = suggestionsQ.data ?? [];
  const isNotEntitled =
    suggestionsQ.isError &&
    suggestionsQ.error instanceof ApiError &&
    suggestionsQ.error.code === 'BRAIN_NOT_ENTITLED';

  return (
    <Screen bg={T.bgApp}>
      {/* Nav row */}
      <View style={{ paddingHorizontal: 8, paddingTop: 4 }}>
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
            Brain
          </Text>
        </Pressable>
      </View>

      <LargeTitle
        title="While you're here"
        right={
          <Pressable
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
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
              <MIcon name="auto_awesome" size={17} color="white" fill={1} />
            </LinearGradient>
          </Pressable>
        }
      />

      <View
        style={{
          paddingHorizontal: 20,
          paddingBottom: 6,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <MIcon name="psychology_alt" size={15} color={T.ai} fill={1} />
        <Text style={{ fontSize: 13, color: T.textSecondary }}>
          <Text style={{ color: T.textPrimary, fontWeight: '600' }}>
            {suggestions.length} things
          </Text>{' '}
          your assistant noticed in your Brain
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 32,
          gap: 10,
        }}
      >
        {suggestionsQ.isLoading ? (
          <SuggestionsSkeleton />
        ) : isNotEntitled ? (
          <EntitlementUpsell
            variant="brain"
            upsellUrl={
              suggestionsQ.error instanceof ApiError
                ? suggestionsQ.error.upsellUrl
                : undefined
            }
            secondaryLabel="Retry"
            onSecondaryPress={() => suggestionsQ.refetch()}
          />
        ) : suggestions.length === 0 ? (
          <EmptyState />
        ) : (
          suggestions.map((s) => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              onPrimary={() => handlePrimaryAction(s, router, touchDecision)}
              onSecondary={() =>
                handleSecondaryAction(s, router, markFollowupsDone)
              }
            />
          ))
        )}

        {/* Run again */}
        <View style={{ alignItems: 'center', marginTop: 4 }}>
          <Pressable
            onPress={() => suggestionsQ.refetch()}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: T.bgCard,
              borderWidth: 0.5,
              borderColor: T.border,
            }}
          >
            <MIcon name="refresh" size={14} color={T.textSecondary} />
            <Text
              style={{
                color: T.textSecondary,
                fontSize: 12,
                fontWeight: '600',
              }}
            >
              Run all checks again
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

function SuggestionsSkeleton() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <View
          key={i}
          style={{
            height: 120,
            borderRadius: 14,
            backgroundColor: T.bgSubtle,
          }}
        />
      ))}
    </>
  );
}

function EmptyState() {
  return (
    <View style={{ alignItems: 'center', paddingTop: 32 }}>
      <MIcon name="psychology_alt" size={32} color={T.textTertiary} />
      <Text
        style={{
          marginTop: 12,
          fontSize: 14,
          color: T.textSecondary,
          fontWeight: '600',
        }}
      >
        Nothing to suggest yet
      </Text>
      <Text
        style={{
          marginTop: 4,
          fontSize: 12,
          color: T.textTertiary,
          textAlign: 'center',
          paddingHorizontal: 24,
        }}
      >
        As you add notes and decisions, your assistant will surface stale
        records, missing owners, and possible duplicates here.
      </Text>
    </View>
  );
}
