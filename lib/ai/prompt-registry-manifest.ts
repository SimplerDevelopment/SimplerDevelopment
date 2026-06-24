/**
 * Prompt registry manifest — the list of code prompts managed by the registry.
 *
 * Each entry maps a stable `key` (matches the eval suite id + the
 * `resolvePrompt(key, …)` call in the core) to its current in-code constant,
 * which the seed registers as version 1 / active. Adding a prompt to the
 * registry = wire its core to `resolvePrompt(key, CONSTANT)` + add it here.
 *
 * Phase 1 covers the four cleanly-extracted, static-string prompts. The
 * dynamic/templated prompts (note classifier `buildSystemPrompt`, automation
 * parser built from PORTAL_TOOLS) need a templating model before they can be
 * registry-managed — tracked as a follow-up.
 */
import { SYSTEM_PROMPT as MEETING_SYSTEM } from './meeting-processor';
import { MESSAGING_SYSTEM, THEME_SYSTEM } from '@/lib/branding/generators';
import { GENERATE_SYSTEM as DECK_SYSTEM } from './pitch-deck-generate';

export interface PromptManifestEntry {
  /** Stable registry key — matches the eval suite id and the resolvePrompt call. */
  key: string;
  title: string;
  description: string;
  /** Current in-code constant; seeded as v1 + active, and the runtime fallback. */
  body: string;
}

export const PROMPT_MANIFEST: PromptManifestEntry[] = [
  {
    key: 'meeting-extractor',
    title: 'Meeting transcript extractor',
    description: 'Extracts summary, decisions, commitments, tasks, and compliance warnings from a meeting transcript.',
    body: MEETING_SYSTEM,
  },
  {
    key: 'branding-messaging',
    title: 'Brand messaging generator',
    description: 'Generates comprehensive brand messaging (tagline, mission, value prop, differentiators, …) from a description.',
    body: MESSAGING_SYSTEM,
  },
  {
    key: 'branding-theme',
    title: 'Brand theme generator',
    description: 'Generates a visual identity (colors, fonts, button styles, dark mode) from a brand description.',
    body: THEME_SYSTEM,
  },
  {
    key: 'deck-generator',
    title: 'Pitch deck generator',
    description: 'Generates an 8-12 slide pitch deck in block JSON from a prompt + optional brand context.',
    body: DECK_SYSTEM,
  },
];

export function getManifestEntry(key: string): PromptManifestEntry | undefined {
  return PROMPT_MANIFEST.find((e) => e.key === key);
}
