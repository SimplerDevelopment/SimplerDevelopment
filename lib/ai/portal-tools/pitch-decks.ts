/**
 * Pitch-deck AI tools.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { db } from '@/lib/db';
import { pitchDecks } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export const pitchDeckTools: Anthropic.Tool[] = [
  {
    name: 'get_my_pitch_decks',
    description: 'Get all pitch decks for this client with status and slide count.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'create_pitch_deck',
    description: 'Create a new empty pitch deck. Confirm with client first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Deck title' },
        description: { type: 'string', description: 'Deck description' },
      },
      required: ['title'],
    },
  },
  {
    name: 'get_pitch_deck_slides',
    description: 'Get the full slide content for a specific pitch deck.',
    input_schema: {
      type: 'object' as const,
      properties: { deck_id: { type: 'number', description: 'The pitch deck ID' } },
      required: ['deck_id'],
    },
  },
  {
    name: 'update_pitch_deck_slide',
    description: 'Update a specific slide in a pitch deck by slide index. Pass only the fields to change — they will be merged into the existing slide.',
    input_schema: {
      type: 'object' as const,
      properties: {
        deck_id: { type: 'number', description: 'The pitch deck ID' },
        slide_index: { type: 'number', description: 'Zero-based slide index' },
        updates: { type: 'string', description: 'JSON string of fields to merge into the slide' },
      },
      required: ['deck_id', 'slide_index', 'updates'],
    },
  },
];

export type PitchDeckHandler = (
  input: Record<string, unknown>,
  clientId: number,
  userId: number,
) => Promise<unknown>;

export const pitchDeckHandlers: Record<string, PitchDeckHandler> = {
  get_my_pitch_decks: async (_input, clientId, _userId) => {
    const rows = await db.select({
      id: pitchDecks.id,
      title: pitchDecks.title,
      slug: pitchDecks.slug,
      description: pitchDecks.description,
      status: pitchDecks.status,
      slides: pitchDecks.slides,
      createdAt: pitchDecks.createdAt,
      updatedAt: pitchDecks.updatedAt,
    }).from(pitchDecks).where(eq(pitchDecks.clientId, clientId)).orderBy(desc(pitchDecks.updatedAt));

    return rows.map(d => ({
      id: d.id,
      title: d.title,
      slug: d.slug,
      description: d.description,
      status: d.status,
      slideCount: Array.isArray(d.slides) ? d.slides.length : 0,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }));
  },

  create_pitch_deck: async (input, clientId, _userId) => {
    const title = input.title as string;
    const description = input.description as string | undefined;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const [deck] = await db.insert(pitchDecks).values({
      clientId,
      title,
      slug,
      description: description ?? null,
      status: 'draft',
      slides: [],
      formatVersion: 2,
    }).returning();

    return { success: true, deckId: deck.id, message: `Pitch deck "${title}" created.` };
  },

  get_pitch_deck_slides: async (input, clientId, _userId) => {
    const deckId = input.deck_id as number;
    const [deck] = await db.select().from(pitchDecks)
      .where(and(eq(pitchDecks.id, deckId), eq(pitchDecks.clientId, clientId))).limit(1);
    if (!deck) return { error: 'Pitch deck not found' };

    return {
      id: deck.id,
      title: deck.title,
      status: deck.status,
      slideCount: Array.isArray(deck.slides) ? deck.slides.length : 0,
      slides: deck.slides,
    };
  },

  update_pitch_deck_slide: async (input, clientId, _userId) => {
    const deckId = input.deck_id as number;
    const slideIndex = input.slide_index as number;
    const updatesStr = input.updates as string;

    const [deck] = await db.select().from(pitchDecks)
      .where(and(eq(pitchDecks.id, deckId), eq(pitchDecks.clientId, clientId))).limit(1);
    if (!deck) return { error: 'Pitch deck not found' };

    let updates: Record<string, unknown>;
    try { updates = JSON.parse(updatesStr); } catch { return { error: 'Invalid JSON in updates' }; }

    const slides = Array.isArray(deck.slides) ? [...deck.slides] : [];
    if (slideIndex < 0 || slideIndex >= slides.length) {
      return { error: `Slide index ${slideIndex} out of range (deck has ${slides.length} slides)` };
    }

    slides[slideIndex] = { ...slides[slideIndex], ...updates };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.update(pitchDecks).set({ slides: slides as any, updatedAt: new Date() })
      .where(eq(pitchDecks.id, deckId));

    return { success: true, message: `Slide ${slideIndex + 1} of "${deck.title}" updated.` };
  },
};
