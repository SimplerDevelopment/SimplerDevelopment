/**
 * Build prompts for on-brand block copy generation.
 *
 * Pure: no DB, no network. Takes messaging + block context and returns a
 * system + user prompt pair that can be sent to any LLM. Extracted so it
 * can be tested without hitting the Anthropic API.
 */

import type { BrandMessagingContext, ToneAxes, VoiceSample } from './block-defaults';

export interface BlockCopyRequest {
  /** Block type — informs which fields we ask for (hero, cta, testimonial, etc.). */
  blockType: string;
  /** Free-form context from the caller (page purpose, audience, angle). */
  context?: string;
  /** When set, asks the model to generate this many variants. Default 1. */
  variants?: number;
}

/** Expected JSON shape the model should return for a given block type. */
export function blockCopyShape(blockType: string): Record<string, string> {
  switch (blockType) {
    case 'hero':
      return { title: 'short bold title', subtitle: 'supporting subtitle', description: '1-2 sentence description', ctaText: 'action-oriented button label' };
    case 'cta':
      return { title: 'punchy call-to-action headline', description: 'why the reader should act', primaryButtonText: 'button label' };
    case 'testimonial':
      return { quote: 'authentic-sounding customer quote (1-3 sentences)', author: 'full name', role: 'job title', company: 'company name' };
    case 'stats':
      return { title: 'section heading above the numbers' };
    case 'featured-content':
      return { title: 'section heading', description: 'supporting body', buttonText: 'CTA label' };
    default:
      return { title: 'section heading', description: 'supporting copy' };
  }
}

function describeAxis(name: string, value: number | undefined, low: string, high: string): string | null {
  if (value === undefined || value === null) return null;
  const abs = Math.abs(value);
  if (abs < 0.2) return `${name}: neutral (balanced between ${low} and ${high})`;
  const side = value > 0 ? high : low;
  const intensity = abs > 0.66 ? 'strongly' : abs > 0.33 ? 'moderately' : 'slightly';
  return `${name}: ${intensity} ${side}`;
}

function toneAxesDescription(axes: ToneAxes | undefined): string[] {
  if (!axes) return [];
  const lines: string[] = [];
  const formal = describeAxis('Formality', axes.formal, 'casual', 'formal');
  const playful = describeAxis('Playfulness', axes.playful, 'serious', 'playful');
  const traditional = describeAxis('Tradition', axes.traditional, 'innovative', 'traditional');
  const authoritative = describeAxis('Authority', axes.authoritative, 'friendly', 'authoritative');
  for (const l of [formal, playful, traditional, authoritative]) {
    if (l) lines.push(`- ${l}`);
  }
  return lines;
}

function voiceSamplesDescription(samples: VoiceSample[] | undefined): string[] {
  if (!samples || samples.length === 0) return [];
  const top = samples.slice(0, 5);
  return [
    'Voice exemplars — match this writing style:',
    ...top.map((s) => `  • (${s.context}) "${s.text}"`),
  ];
}

export function buildBlockCopySystemPrompt(): string {
  return `You are an expert brand copywriter. You write on-brand copy for website blocks.

Rules:
- Respond with ONLY a JSON object. No markdown, no prose, no explanation.
- Match the brand's tone exactly — use the tone axes, voice exemplars, and writing style guidelines provided.
- Be specific and concrete — avoid generic marketing speak.
- Keep field lengths reasonable: titles under 80 chars, subtitles under 140, descriptions under 280.
- Draw from the brand's value proposition and key differentiators rather than inventing new claims.
- When variants > 1, respond with { "variants": [obj, obj, ...] } where each obj has the requested shape.`;
}

export function buildBlockCopyUserPrompt(
  request: BlockCopyRequest,
  messaging: BrandMessagingContext | undefined,
): string {
  const shape = blockCopyShape(request.blockType);
  const variants = request.variants && request.variants > 1 ? request.variants : 1;

  const lines: string[] = [];
  lines.push(`Generate copy for a ${request.blockType} block.`);
  lines.push('');
  lines.push(`Expected JSON ${variants > 1 ? `with "variants" array of ${variants}` : 'shape'}:`);
  lines.push(JSON.stringify(shape, null, 2));
  lines.push('');

  if (messaging) {
    lines.push('── Brand context ──');
    if (messaging.companyName) lines.push(`Company: ${messaging.companyName}`);
    if (messaging.tagline) lines.push(`Tagline: ${messaging.tagline}`);
    if (messaging.valueProposition) lines.push(`Value proposition: ${messaging.valueProposition}`);
    if (messaging.elevatorPitch) lines.push(`Elevator pitch: ${messaging.elevatorPitch}`);
    if (messaging.targetAudience) lines.push(`Target audience: ${messaging.targetAudience}`);
    if (messaging.keyDifferentiators?.length) {
      lines.push('Key differentiators:');
      for (const d of messaging.keyDifferentiators) lines.push(`  - ${d}`);
    }
    if (messaging.toneOfVoice) lines.push(`Tone of voice: ${messaging.toneOfVoice}`);
    if (messaging.brandPersonality) lines.push(`Brand personality: ${messaging.brandPersonality}`);
    if (messaging.writingStyle) lines.push(`Writing style: ${messaging.writingStyle}`);

    const axisLines = toneAxesDescription(messaging.toneAxes);
    if (axisLines.length) {
      lines.push('Tone axes:');
      lines.push(...axisLines);
    }

    const voiceLines = voiceSamplesDescription(messaging.voiceSamples);
    if (voiceLines.length) {
      lines.push('');
      lines.push(...voiceLines);
    }
  } else {
    lines.push('── No brand messaging configured — use reasonable defaults ──');
  }

  if (request.context) {
    lines.push('');
    lines.push('── Page / caller context ──');
    lines.push(request.context);
  }

  if (variants > 1) {
    lines.push('');
    lines.push(`Produce ${variants} distinct variants.`);
  }

  return lines.join('\n');
}

/** Detect contradictions in a tone-axes configuration. */
export function auditToneAxes(axes: ToneAxes | undefined): Array<{ id: string; message: string }> {
  if (!axes) return [];
  const issues: Array<{ id: string; message: string }> = [];

  // Formal + playful = mild tension; flag when both are strong
  if (
    axes.formal !== undefined && axes.playful !== undefined &&
    axes.formal > 0.5 && axes.playful > 0.5
  ) {
    issues.push({
      id: 'tone-formal-vs-playful',
      message: 'Tone axes are both strongly formal AND strongly playful — pick one emphasis to avoid mixed signals.',
    });
  }

  // Traditional + innovative contradiction
  if (
    axes.traditional !== undefined && axes.traditional > 0.5 &&
    axes.playful !== undefined && axes.playful > 0.5
  ) {
    // Not a hard contradiction, but worth flagging
    issues.push({
      id: 'tone-traditional-vs-playful',
      message: 'Traditional + playful is an unusual pairing — confirm it matches the brand intentionally.',
    });
  }

  return issues;
}
