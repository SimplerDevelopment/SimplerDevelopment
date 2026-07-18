/**
 * Dynamic System Prompt Builder for AI Slide Editing
 *
 * Assembles the system prompt at request time by introspecting all available
 * block types, their properties, the style system, and the current theme.
 * New block types added to block-schemas.ts automatically appear in the prompt.
 */

import type { PitchDeckTheme, PitchDeckSlideV2 } from '@/lib/db/schema';
import { type BlockSchema, type PropertySchema, getAllBlockSchemas } from './block-schemas';
import type { ComponentManifestEntry } from '@/types/visual-editor';

interface DeckContext {
  title: string;
  allSlides: Array<{ index: number; label: string; contentSummary?: string; notes?: string }>;
  currentSlideIndex: number;
  description?: string | null;
  brandInfo?: { headingFont?: string; bodyFont?: string; primaryColor?: string; accentColor?: string; logoText?: string } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatProperty(name: string, prop: PropertySchema): string {
  let line = `      "${name}": `;
  const parts: string[] = [];

  if (prop.type === 'enum' && prop.enumValues) {
    parts.push(prop.enumValues.map((v) => `"${v}"`).join(' | '));
  } else if (prop.type === 'array') {
    parts.push('[...]');
  } else if (prop.type === 'color') {
    parts.push('"#hex"');
  } else if (prop.type === 'url' || prop.type === 'image') {
    parts.push('"https://..."');
  } else if (prop.type === 'number') {
    parts.push('number');
  } else if (prop.type === 'boolean') {
    parts.push('true | false');
  } else {
    parts.push('"string"');
  }

  line += parts.join('');

  const meta: string[] = [];
  if (prop.required) meta.push('REQUIRED');
  if (prop.default !== undefined) meta.push(`default: ${JSON.stringify(prop.default)}`);
  if (prop.description) meta.push(prop.description);
  if (meta.length) line += `  // ${meta.join(', ')}`;

  return line;
}

function formatBlockSchema(schema: BlockSchema): string {
  const propLines = Object.entries(schema.properties).map(([name, prop]) =>
    formatProperty(name, prop)
  );

  let block = `  ## ${schema.type} (${schema.label}) — ${schema.description}\n`;
  block += `    Category: ${schema.category}\n`;
  block += `    {\n`;
  block += `      "type": "${schema.type}",\n`;
  block += propLines.join(',\n') + '\n';
  block += `    }`;

  if (schema.styledElements?.length) {
    block += `\n    Styleable elements (via elementStyles): ${schema.styledElements.join(', ')}`;
  }

  return block;
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildSlideEditPrompt(
  theme: PitchDeckTheme,
  deckContext: DeckContext,
  customManifests?: ComponentManifestEntry[],
): string {
  const schemas = getAllBlockSchemas(customManifests);

  // Group schemas by category
  const byCategory = new Map<string, BlockSchema[]>();
  for (const s of schemas) {
    const list = byCategory.get(s.category) || [];
    list.push(s);
    byCategory.set(s.category, list);
  }

  // Build block catalog
  const catalogSections: string[] = [];
  for (const [category, items] of byCategory) {
    catalogSections.push(`\n### ${category} Blocks\n`);
    for (const item of items) {
      catalogSections.push(formatBlockSchema(item));
    }
  }

  // Build slide outline with content summaries
  const slideOutline = deckContext.allSlides
    .map((s) => {
      let line = `  ${s.index + 1}. ${s.label}${s.index === deckContext.currentSlideIndex ? ' ← (CURRENT)' : ''}`;
      if (s.contentSummary) line += `\n     Content: ${s.contentSummary}`;
      if (s.notes) line += `\n     Notes: ${s.notes.slice(0, 150)}${s.notes.length > 150 ? '...' : ''}`;
      return line;
    })
    .join('\n');

  // Brand context
  let brandSection = '';
  if (deckContext.brandInfo) {
    const b = deckContext.brandInfo;
    const parts: string[] = [];
    if (b.logoText) parts.push(`Company: ${b.logoText}`);
    if (b.primaryColor) parts.push(`Brand Primary: ${b.primaryColor}`);
    if (b.accentColor) parts.push(`Brand Accent: ${b.accentColor}`);
    if (parts.length) brandSection = `\n# Brand Identity\n${parts.join('\n')}\n`;
  }

  return `You are an expert pitch deck editor with full control over slide content, structure, and styling.
You modify individual slides based on natural language instructions. You can do EVERYTHING a human editor can do.
Your edits should fit naturally within the deck's overall narrative flow.

Respond with valid JSON only — no markdown fences, no explanation, no commentary.

# Deck Context
Title: "${deckContext.title}"${deckContext.description ? `\nDescription: ${deckContext.description}` : ''}
Slides:
${slideOutline}
${brandSection}

# Current Theme
- Primary Color: ${theme.primaryColor}
- Accent Color: ${theme.accentColor}
- Background Color: ${theme.backgroundColor}
- Text Color: ${theme.textColor}
- Heading Font: ${theme.headingFont}
- Body Font: ${theme.bodyFont}

Use these theme values when styling. For example, use the primary color for emphasis, accent for highlights.

# Slide Structure
{
  "id": "keep-the-same-id",
  "label": "Slide Label",
  "blocks": [ ...block objects... ],
  "notes": "optional speaker notes"
}

Every block MUST have: "id" (unique string), "type" (from catalog below), "order" (sequential 1-based integer).

# Block Catalog
${catalogSections.join('\n')}

# Styling System

Every block supports an optional "style" object for visual customization:
{
  "style": {
    "backgroundColor": "#hex or rgba()",
    "color": "#hex",
    "fontSize": "18px",
    "fontFamily": "Font Name",
    "fontWeight": "bold | 400 | 700",
    "lineHeight": "1.5",
    "letterSpacing": "0.05em",
    "textAlign": "left | center | right | justify",
    "textTransform": "uppercase | lowercase | capitalize | none",
    "textDecoration": "underline | line-through | none",
    "padding": "20px",
    "margin": "10px 0",
    "borderRadius": "8px",
    "borderWidth": "1px",
    "borderColor": "#hex",
    "borderStyle": "solid | dashed | dotted",
    "boxShadow": "0 4px 12px rgba(0,0,0,0.15)",
    "opacity": "0.9",
    "width": "100%",
    "maxWidth": "800px",
    "backgroundGradient": "linear-gradient(135deg, #color1, #color2)",
    "backgroundImage": "url-to-image",
    "backgroundSize": "cover | contain",
    "backgroundPosition": "center",
    "display": "flex | grid | block",
    "flexDirection": "row | column",
    "justifyContent": "center | space-between | flex-start | flex-end",
    "alignItems": "center | flex-start | flex-end | stretch",
    "gap": "16px"
  }
}

Blocks with multiple visual elements (hero, cta, stats, card-grid, testimonial) support "elementStyles" for per-element styling:
{
  "elementStyles": {
    "title": { "fontSize": "48px", "color": "${theme.primaryColor}", "fontWeight": "800" },
    "subtitle": { "fontSize": "20px", "opacity": "0.8" }
  }
}

# Rules
1. ALWAYS keep the same slide "id"
2. PRESERVE user edits: Only modify content and styling that the user explicitly asks to change. If the user asks to change a title, keep all other text, images, colors, fonts, spacing, and layout exactly as they are. Treat the current slide as the source of truth for anything not mentioned in the instruction.
3. PRESERVE styling: If a block already has custom "style" or "elementStyles", carry those values forward unchanged unless the user's instruction specifically targets that styling (e.g. "change the color", "make it bigger").
4. PRESERVE content: Do not rewrite, rephrase, or shorten text that the user did not ask to change. Keep existing headings, descriptions, labels, button text, image URLs, and other content verbatim.
5. You can add, remove, reorder, or change blocks — but ONLY when the user's instruction calls for it
6. Update the label if the slide's purpose changes
7. Keep slides focused — prefer 1-5 blocks per slide
8. Generate unique IDs for new blocks (format: "block-{timestamp}-{random}")
9. When the user says "make it bigger/smaller/red/bold/etc.", use the style system — but only on the targeted element
10. When the user says "change the layout", use columns, sections, or reorder blocks
11. For color references like "brand color" or "primary color", use the theme values above
12. For nested blocks (columns, sections, tabs), include valid child blocks
13. Preserve existing block IDs when modifying (don't regenerate IDs for blocks you're keeping)
14. When in doubt about whether something should change, keep it as-is`;
}
