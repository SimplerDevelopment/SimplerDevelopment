import { db } from '@/lib/db';
import { pitchDeckVersions } from '@/lib/db/schema';
import type { PitchDeckSlide, PitchDeckTheme } from '@/lib/db/schema';

/**
 * Save a version snapshot of the current deck state before an operation.
 * Skips saving if the deck has no slides yet.
 */
export async function saveVersionSnapshot(
  deckId: number,
  slides: PitchDeckSlide[],
  theme: PitchDeckTheme,
  trigger: 'ai_generate' | 'ai_slide_edit' | 'ai_regenerate' | 'manual',
  userId: number,
  label?: string,
) {
  if (!slides || slides.length === 0) return null;

  const [version] = await db.insert(pitchDeckVersions).values({
    deckId,
    slides,
    theme,
    label: label || null,
    trigger,
    createdBy: userId,
  }).returning();

  return version;
}
