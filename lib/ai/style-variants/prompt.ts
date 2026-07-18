/**
 * Prompt builder for the AI Style Picker.
 *
 * Takes a block + brand context + 3 philosophy hints and returns a system /
 * user prompt pair the API route can hand to Anthropic. Pure: no DB, no
 * network, no React. Mirrors the shape of lib/branding/copy-prompt.ts so
 * tests work the same way.
 *
 * Output the model is asked to produce:
 *   {
 *     "variants": [
 *       {
 *         "philosophyId": "editorial",
 *         "label": "Editorial",
 *         "rationale": "one short sentence on what this variant does",
 *         "propsDelta": {
 *           "style": { ...BlockStyle keys allowed by the surface... },
 *           "elementStyles": { title: {...}, cta: {...}, ... }
 *         }
 *       },
 *       ...
 *     ]
 *   }
 *
 * The model never returns content props (title, ctaText, etc.) — only style.
 */

import type { Block, BlockStyle } from '@/types/blocks';
import type { BrandMessagingContext } from '@/lib/branding/block-defaults';
import type { BlockStyleSurface, StyleKeySpec } from './style-surface';
import type { DesignPhilosophy } from './philosophies';

export interface BrandStyleContext {
  /** Hex color, e.g. '#0066ff'. */
  primaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  /** CSS font-family value, e.g. '"Inter", sans-serif'. */
  headingFont?: string;
  bodyFont?: string;
  /** CSS length, e.g. '8px'. */
  borderRadius?: string;
  /** Optional messaging — included so the model understands the brand's voice/feel even when it isn't editing copy. */
  messaging?: BrandMessagingContext;
}

export interface StyleVariantsRequest {
  block: Block;
  surface: BlockStyleSurface;
  brand: BrandStyleContext;
  philosophies: ReadonlyArray<DesignPhilosophy>;
  /** When false (default), the model must respect brand colors, fonts, radius. */
  exploreOutsideBrand?: boolean;
}

// ─── System prompt ───────────────────────────────────────────────────────────
//
// Embeds the anti-AI-slop principles borrowed from huashu-design. Kept short:
// every rule here is one the model regularly breaks without it, not generic
// "be a good designer" advice.

export function buildStyleVariantsSystemPrompt(): string {
  return `You are an expert visual designer producing style variants for a website block. You modify presentation only — never content.

Output rules:
- Respond with ONLY a JSON object matching the schema in the user prompt. No markdown fences. No commentary.
- Every variant's propsDelta uses ONLY the keys listed in the style surface. Unknown keys will be rejected.
- Every value matches the type / enum constraints in the style surface. Out-of-range values will be rejected.
- Do not return content fields (title, subtitle, description, ctaText, ctaLink, image URLs). Style only.

Design rules — these are non-negotiable, the model frequently breaks them without being told:
- The three variants must be visibly DIFFERENT directions, not three shades of the same idea. If two variants share the same philosophy energy, the user gets no real choice.
- No generic "AI tech startup" gradients (purple→blue, teal→cyan). If you reach for a gradient, justify it with the philosophy's directive.
- Restraint over decoration. A variant with one strong typographic move beats one with a gradient AND a shadow AND a border AND uppercase tracking. Pick one.
- Hierarchy through size, weight, and whitespace before color. Color is for accents and CTAs, not for shouting hierarchy.
- Buttons (cta, secondaryCta) must remain readable: contrast >= 4.5:1 against their background. Solid black text on a saturated brand color is usually wrong — invert.
- When the brand-respect mode is on (default), do NOT introduce colors outside the brand palette and neutrals (whites/blacks/grays). Do NOT introduce font-families outside the brand's heading/body fonts. Do NOT change borderRadius beyond ±50% of the brand radius. Omitting a key is always safe.
- Avoid changes that would damage layout: do not set width/height/position/zIndex; do not zero out padding entirely; do not set minHeight below 50vh on a hero.

Each variant's "rationale" is one sentence — what the variant does and why it fits the block's purpose. Not a sales pitch.`;
}

// ─── User prompt ─────────────────────────────────────────────────────────────

function describeStyleSurface(surface: BlockStyleSurface): string {
  const lines: string[] = [];
  lines.push(`Style surface for block type "${surface.blockType}":`);
  lines.push('');
  lines.push('  propsDelta.style — wrapper-level keys (each optional):');
  for (const [key, spec] of Object.entries(surface.wrapperStyle) as Array<[string, StyleKeySpec]>) {
    lines.push(`    ${key}: ${formatSpec(spec)}`);
  }
  lines.push('');
  for (const [element, keys] of Object.entries(surface.elementStyles)) {
    lines.push(`  propsDelta.elementStyles.${element} — keys (each optional):`);
    for (const [key, spec] of Object.entries(keys) as Array<[string, StyleKeySpec]>) {
      lines.push(`    ${key}: ${formatSpec(spec)}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function formatSpec(spec: StyleKeySpec): string {
  const parts: string[] = [];
  if (spec.enumValues) {
    parts.push(spec.enumValues.map((v) => `"${v}"`).join(' | '));
  } else if (spec.type) {
    parts.push(spec.type);
  } else {
    parts.push('string');
  }
  if (spec.brandManaged) parts.push('[brand-managed]');
  if (spec.description) parts.push(`— ${spec.description}`);
  return parts.join(' ');
}

function describeBrand(brand: BrandStyleContext, exploreOutsideBrand: boolean): string {
  const lines: string[] = [];
  lines.push(`Brand context (mode: ${exploreOutsideBrand ? 'EXPLORE OUTSIDE BRAND — palette/fonts may deviate' : 'RESPECT BRAND — palette/fonts/radius must match'}):`);
  if (brand.primaryColor) lines.push(`  primary: ${brand.primaryColor}`);
  if (brand.accentColor) lines.push(`  accent: ${brand.accentColor}`);
  if (brand.backgroundColor) lines.push(`  background: ${brand.backgroundColor}`);
  if (brand.textColor) lines.push(`  text: ${brand.textColor}`);
  if (brand.headingFont) lines.push(`  heading font: ${brand.headingFont}`);
  if (brand.bodyFont) lines.push(`  body font: ${brand.bodyFont}`);
  if (brand.borderRadius) lines.push(`  radius: ${brand.borderRadius}`);

  const m = brand.messaging;
  if (m) {
    if (m.brandPersonality) lines.push(`  personality: ${m.brandPersonality}`);
    if (m.toneOfVoice) lines.push(`  tone: ${m.toneOfVoice}`);
    if (m.companyName) lines.push(`  company: ${m.companyName}`);
  }
  return lines.join('\n');
}

function describePhilosophies(philosophies: ReadonlyArray<DesignPhilosophy>): string {
  const lines: string[] = [];
  lines.push('Three differentiated philosophies for the three variants. Each variant must visibly embody its assigned philosophy:');
  philosophies.forEach((p, i) => {
    lines.push('');
    lines.push(`  Variant ${i + 1} — ${p.label} (id: "${p.id}")`);
    lines.push(`    Brief: ${p.blurb}`);
    lines.push(`    Directive: ${p.promptDirective}`);
  });
  return lines.join('\n');
}

function describeCurrentBlock(block: Block): string {
  const safe: { type: string; style?: BlockStyle; elementStyles?: Block['elementStyles'] } = {
    type: block.type,
    style: block.style,
    elementStyles: block.elementStyles,
  };
  return `Current block style (your propsDelta replaces these keys when set):\n${JSON.stringify(safe, null, 2)}`;
}

export function buildStyleVariantsUserPrompt(req: StyleVariantsRequest): string {
  const explore = req.exploreOutsideBrand ?? false;
  const sections: string[] = [];

  sections.push(`Generate THREE style variants for a "${req.surface.blockType}" block.`);
  sections.push('');
  sections.push('Required JSON output schema:');
  sections.push(`{
  "variants": [
    {
      "philosophyId": "<one of the ids below>",
      "label": "<the philosophy's label>",
      "rationale": "<one sentence>",
      "propsDelta": {
        "style": { ... },           // optional; only keys from the style surface
        "elementStyles": {           // optional; only listed elements
          "title": { ... },
          "subtitle": { ... },
          "description": { ... },
          "cta": { ... },
          "secondaryCta": { ... }
        }
      }
    },
    { ...variant 2... },
    { ...variant 3... }
  ]
}`);
  sections.push('');
  sections.push(describeStyleSurface(req.surface));
  sections.push(describeBrand(req.brand, explore));
  sections.push('');
  sections.push(describePhilosophies(req.philosophies));
  sections.push('');
  sections.push(describeCurrentBlock(req.block));

  return sections.join('\n');
}
