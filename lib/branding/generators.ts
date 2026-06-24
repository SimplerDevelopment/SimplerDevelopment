/**
 * Brand-generation prompt cores (DB-free).
 *
 * The model-call logic for the branding generators used to live inline in their
 * API routes. Extracted here so the routes AND the eval harness call the same
 * path with just an Anthropic key — the route keeps auth / plan-gate / key
 * resolution / usage recording; this owns prompt + call + parse.
 */
import Anthropic from '@anthropic-ai/sdk';
import { resolvePrompt } from '@/lib/ai/prompt-registry';

const MODEL = 'claude-sonnet-4-6';

export const MESSAGING_SYSTEM = `You are an expert brand strategist and copywriter. Given a description of a company or brand, generate comprehensive company messaging content.

You MUST respond with valid JSON only — no markdown, no code fences, no explanation.

{
  "companyName": "The company name",
  "tagline": "A memorable, concise tagline",
  "missionStatement": "1-3 sentences describing the company's mission and purpose",
  "visionStatement": "1-3 sentences describing the long-term vision",
  "valueProposition": "2-3 sentences explaining the unique value delivered to customers",
  "toneOfVoice": "3-5 comma-separated tone descriptors (e.g. Professional, Approachable, Innovative)",
  "brandPersonality": "2-3 sentences describing how the brand should come across",
  "writingStyle": "2-3 sentences of writing style guidelines",
  "elevatorPitch": "A compelling 2-3 sentence elevator pitch",
  "boilerplate": "A standard 3-4 sentence company description for press and proposals",
  "keyDifferentiators": ["differentiator 1", "differentiator 2", "differentiator 3"],
  "targetAudience": "2-3 sentences describing the ideal customers, their needs, and pain points",
  "industry": "Industry category",
  "yearFounded": "",
  "companySize": "",
  "headquarters": "",
  "websiteUrl": "",
  "socialProof": "",
  "keyClients": "",
  "certifications": "",
  "additionalContext": ""
}

Guidelines:
- Write in the brand's own voice based on the description
- Make the tagline punchy and memorable, not generic
- The elevator pitch should be conversational and compelling
- Key differentiators should be specific and concrete, not vague — generate 3-5 items
- The boilerplate should be polished enough to use in a press release
- Target audience should identify specific pain points the brand solves
- Tone descriptors should be specific (avoid generic words like "good" or "nice")
- Keep all content authentic to the brand description provided
- For factual fields (yearFounded, companySize, headquarters, websiteUrl), only fill if clearly stated in the description — never fabricate facts
- For socialProof, keyClients, certifications — only fill if mentioned, otherwise leave empty`;

export const THEME_SYSTEM = `You are an expert brand designer. Given a brand description, generate a complete visual identity.

You MUST respond with valid JSON only — no markdown, no code fences, no explanation.

{
  "primaryColor": "#hex - main brand color",
  "secondaryColor": "#hex - supporting color",
  "accentColor": "#hex - highlight/accent color",
  "backgroundColor": "#hex - page background",
  "textColor": "#hex - body text color",
  "navBackground": "#hex - navigation bar background",
  "navTextColor": "#hex - navigation text color",
  "headingFont": "Google Font family name for headings",
  "bodyFont": "Google Font family name for body text",
  "borderRadius": "CSS value (e.g. 0px, 4px, 8px, 12px, 9999px)",
  "linkColor": "#hex - inline link color",
  "linkHoverColor": "#hex - link hover color",
  "buttonStyle": {
    "primaryBg": "#hex - primary button background",
    "primaryText": "#hex - primary button text",
    "primaryHoverBg": "#hex - primary button hover",
    "secondaryBg": "#hex - secondary button background",
    "secondaryText": "#hex - secondary button text",
    "secondaryHoverBg": "#hex - secondary button hover",
    "borderRadius": "CSS value or empty to inherit global",
    "variant": "filled or outline"
  },
  "darkMode": {
    "primaryColor": "#hex",
    "secondaryColor": "#hex",
    "accentColor": "#hex",
    "backgroundColor": "#hex - dark background",
    "textColor": "#hex - light text for dark bg",
    "navBackground": "#hex",
    "navTextColor": "#hex"
  }
}

Guidelines:
- Choose colors that evoke the described brand personality
- Ensure sufficient contrast between text and background (WCAG AA minimum)
- Pick Google Fonts that match the brand tone (e.g. geometric sans for tech, serif for luxury)
- The heading font should have personality; the body font should be highly readable
- Dark mode should be a cohesive inversion, not just swapped values
- Border radius should match brand personality (sharp = corporate, rounded = friendly, pill = playful)
- Button styles should be consistent with the overall color scheme`;

/** Strip ```json fences the model sometimes adds despite "JSON only". */
function unfence(text: string): string {
  return text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
}

async function runJsonPrompt(
  system: string,
  userContent: string,
  apiKey: string,
  maxTokens: number,
): Promise<{ json: unknown; inputTokens: number; outputTokens: number }> {
  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: userContent }],
  });
  const text = unfence(
    response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join(''),
  );
  return {
    json: JSON.parse(text),
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  };
}

export async function generateBrandMessaging(
  description: string,
  apiKey: string,
  systemPromptOverride?: string,
): Promise<{ messaging: Record<string, unknown>; inputTokens: number; outputTokens: number }> {
  const system = systemPromptOverride ?? await resolvePrompt('branding-messaging', MESSAGING_SYSTEM);
  const { json, inputTokens, outputTokens } = await runJsonPrompt(
    system,
    `Company/brand description: ${description.trim()}`,
    apiKey,
    4096,
  );
  return { messaging: json as Record<string, unknown>, inputTokens, outputTokens };
}

export async function generateBrandTheme(
  description: string,
  apiKey: string,
  systemPromptOverride?: string,
): Promise<{ theme: Record<string, unknown>; inputTokens: number; outputTokens: number }> {
  const system = systemPromptOverride ?? await resolvePrompt('branding-theme', THEME_SYSTEM);
  const { json, inputTokens, outputTokens } = await runJsonPrompt(
    system,
    `Brand description: ${description.trim()}`,
    apiKey,
    2048,
  );
  return { theme: json as Record<string, unknown>, inputTokens, outputTokens };
}
