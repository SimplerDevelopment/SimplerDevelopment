import { describe, it, expect } from 'vitest';
import {
  blockCopyShape,
  buildBlockCopySystemPrompt,
  buildBlockCopyUserPrompt,
  auditToneAxes,
} from '@/lib/branding/copy-prompt';
import type { BrandMessagingContext } from '@/lib/branding/block-defaults';

describe('blockCopyShape', () => {
  it('returns hero-specific fields for hero', () => {
    expect(blockCopyShape('hero')).toHaveProperty('title');
    expect(blockCopyShape('hero')).toHaveProperty('subtitle');
    expect(blockCopyShape('hero')).toHaveProperty('ctaText');
  });

  it('returns testimonial-specific fields', () => {
    const shape = blockCopyShape('testimonial');
    expect(shape).toHaveProperty('quote');
    expect(shape).toHaveProperty('author');
  });

  it('falls back to generic shape for unknown block types', () => {
    const shape = blockCopyShape('something-new');
    expect(shape).toHaveProperty('title');
    expect(shape).toHaveProperty('description');
  });
});

describe('buildBlockCopySystemPrompt', () => {
  it('includes JSON-only directive', () => {
    const p = buildBlockCopySystemPrompt();
    expect(p).toContain('JSON');
    expect(p.toLowerCase()).toContain('no markdown');
  });
});

describe('buildBlockCopyUserPrompt', () => {
  const messaging: BrandMessagingContext = {
    companyName: 'Acme',
    tagline: 'Build faster.',
    valueProposition: 'We cut dev cycles in half.',
    elevatorPitch: 'Acme pairs you with AI coders.',
    targetAudience: 'Engineering leaders at startups',
    keyDifferentiators: ['speed', 'reliability', 'support'],
    toneOfVoice: 'Professional but warm',
    toneAxes: { formal: 0.3, playful: -0.2, traditional: -0.6 },
    voiceSamples: [
      { context: 'email subject', text: 'Shipped: the async compiler is live' },
      { context: 'tweet', text: 'Ship it. We\'ll debug later.' },
    ],
  };

  it('includes block type in prompt', () => {
    const p = buildBlockCopyUserPrompt({ blockType: 'hero' }, messaging);
    expect(p).toContain('hero block');
  });

  it('surfaces company name + tagline + value prop', () => {
    const p = buildBlockCopyUserPrompt({ blockType: 'hero' }, messaging);
    expect(p).toContain('Acme');
    expect(p).toContain('Build faster.');
    expect(p).toContain('We cut dev cycles in half.');
  });

  it('includes key differentiators', () => {
    const p = buildBlockCopyUserPrompt({ blockType: 'hero' }, messaging);
    expect(p).toContain('speed');
    expect(p).toContain('reliability');
  });

  it('translates tone axes into human descriptions', () => {
    const p = buildBlockCopyUserPrompt({ blockType: 'hero' }, messaging);
    // formal 0.3 → slightly formal
    expect(p).toMatch(/Formality.*slightly formal/);
    // traditional -0.6 → moderately innovative
    expect(p).toMatch(/Tradition.*moderately innovative/);
  });

  it('includes voice samples', () => {
    const p = buildBlockCopyUserPrompt({ blockType: 'hero' }, messaging);
    expect(p).toContain('async compiler is live');
    expect(p).toContain('email subject');
  });

  it('requests multiple variants when variants > 1', () => {
    const p = buildBlockCopyUserPrompt({ blockType: 'cta', variants: 3 }, messaging);
    expect(p).toContain('3 distinct variants');
    expect(p).toContain('"variants"');
  });

  it('handles missing messaging gracefully', () => {
    const p = buildBlockCopyUserPrompt({ blockType: 'hero' }, undefined);
    expect(p).toContain('No brand messaging configured');
  });

  it('includes caller context when provided', () => {
    const p = buildBlockCopyUserPrompt(
      { blockType: 'hero', context: 'For the pricing page, emphasize ROI.' },
      messaging,
    );
    expect(p).toContain('pricing page');
    expect(p).toContain('ROI');
  });
});

describe('auditToneAxes', () => {
  it('flags strongly formal + strongly playful', () => {
    const issues = auditToneAxes({ formal: 0.8, playful: 0.8 });
    expect(issues.some((i) => i.id === 'tone-formal-vs-playful')).toBe(true);
  });

  it('does not flag moderate values', () => {
    const issues = auditToneAxes({ formal: 0.3, playful: 0.3 });
    expect(issues.some((i) => i.id === 'tone-formal-vs-playful')).toBe(false);
  });

  it('flags traditional + playful as unusual', () => {
    const issues = auditToneAxes({ traditional: 0.7, playful: 0.7 });
    expect(issues.some((i) => i.id === 'tone-traditional-vs-playful')).toBe(true);
  });

  it('returns empty when axes undefined', () => {
    expect(auditToneAxes(undefined)).toEqual([]);
  });
});
