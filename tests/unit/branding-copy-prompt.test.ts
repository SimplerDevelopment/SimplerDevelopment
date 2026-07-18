import { describe, it, expect } from 'vitest';
import {
  blockCopyShape,
  buildBlockCopySystemPrompt,
  buildBlockCopyUserPrompt,
  auditToneAxes,
} from '@/lib/branding/copy-prompt';
import type { BrandMessagingContext, VoiceSample } from '@/lib/branding/block-defaults';

// Complementary tests to tests/unit/brandCopyPrompt.test.ts — cover branches not
// already exercised: cta/stats/featured-content shapes, authoritative axis,
// intensity boundaries, voice-sample truncation, optional messaging fields,
// system prompt rules, and auditToneAxes edge cases.

describe('blockCopyShape — all block types', () => {
  it('returns cta-specific fields', () => {
    const shape = blockCopyShape('cta');
    expect(shape).toHaveProperty('title');
    expect(shape).toHaveProperty('description');
    expect(shape).toHaveProperty('primaryButtonText');
    // cta shape does NOT have ctaText (that's hero)
    expect(shape).not.toHaveProperty('ctaText');
  });

  it('returns stats-specific fields (title only)', () => {
    const shape = blockCopyShape('stats');
    expect(shape).toEqual({ title: 'section heading above the numbers' });
  });

  it('returns featured-content-specific fields', () => {
    const shape = blockCopyShape('featured-content');
    expect(shape).toHaveProperty('title');
    expect(shape).toHaveProperty('description');
    expect(shape).toHaveProperty('buttonText');
  });

  it('hero shape has description field', () => {
    const shape = blockCopyShape('hero');
    expect(shape).toHaveProperty('description');
  });

  it('testimonial shape includes role and company', () => {
    const shape = blockCopyShape('testimonial');
    expect(shape).toHaveProperty('role');
    expect(shape).toHaveProperty('company');
  });

  it('default shape for empty string', () => {
    const shape = blockCopyShape('');
    expect(shape).toEqual({ title: 'section heading', description: 'supporting copy' });
  });

  it('shape values are non-empty hint strings', () => {
    for (const type of ['hero', 'cta', 'testimonial', 'stats', 'featured-content', 'unknown']) {
      const shape = blockCopyShape(type);
      for (const [, hint] of Object.entries(shape)) {
        expect(typeof hint).toBe('string');
        expect(hint.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('buildBlockCopySystemPrompt — rules', () => {
  it('forbids prose / markdown / explanation', () => {
    const p = buildBlockCopySystemPrompt();
    expect(p.toLowerCase()).toContain('no markdown');
    expect(p.toLowerCase()).toContain('no prose');
    expect(p.toLowerCase()).toContain('no explanation');
  });

  it('mentions tone axes / voice exemplars', () => {
    const p = buildBlockCopySystemPrompt();
    expect(p.toLowerCase()).toContain('tone axes');
    expect(p.toLowerCase()).toContain('voice exemplars');
  });

  it('encodes length budgets', () => {
    const p = buildBlockCopySystemPrompt();
    expect(p).toContain('80');
    expect(p).toContain('140');
    expect(p).toContain('280');
  });

  it('describes variants schema', () => {
    const p = buildBlockCopySystemPrompt();
    expect(p).toContain('variants');
  });

  it('is deterministic / stable across calls', () => {
    expect(buildBlockCopySystemPrompt()).toBe(buildBlockCopySystemPrompt());
  });
});

describe('buildBlockCopyUserPrompt — JSON shape rendering', () => {
  it('embeds the requested JSON shape verbatim', () => {
    const p = buildBlockCopyUserPrompt({ blockType: 'hero' }, undefined);
    // Pretty-printed JSON keys for hero shape should appear
    expect(p).toContain('"title"');
    expect(p).toContain('"subtitle"');
    expect(p).toContain('"description"');
    expect(p).toContain('"ctaText"');
  });

  it('says "shape" when variants <= 1, "variants array" otherwise', () => {
    const single = buildBlockCopyUserPrompt({ blockType: 'hero' }, undefined);
    expect(single).toContain('Expected JSON shape:');
    const multi = buildBlockCopyUserPrompt({ blockType: 'hero', variants: 4 }, undefined);
    expect(multi).toContain('"variants" array of 4');
  });

  it('treats variants === 1 as single', () => {
    const p = buildBlockCopyUserPrompt({ blockType: 'hero', variants: 1 }, undefined);
    expect(p).toContain('Expected JSON shape:');
    expect(p).not.toContain('distinct variants');
  });

  it('treats variants === 0 / negative as single', () => {
    const zero = buildBlockCopyUserPrompt({ blockType: 'hero', variants: 0 }, undefined);
    expect(zero).toContain('Expected JSON shape:');
    const neg = buildBlockCopyUserPrompt({ blockType: 'hero', variants: -2 }, undefined);
    expect(neg).toContain('Expected JSON shape:');
  });
});

describe('buildBlockCopyUserPrompt — messaging field coverage', () => {
  it('includes brandPersonality + writingStyle + toneOfVoice when present', () => {
    const messaging: BrandMessagingContext = {
      brandPersonality: 'pragmatic optimist',
      writingStyle: 'second-person active voice',
      toneOfVoice: 'confident but not arrogant',
    };
    const p = buildBlockCopyUserPrompt({ blockType: 'hero' }, messaging);
    expect(p).toContain('pragmatic optimist');
    expect(p).toContain('second-person active voice');
    expect(p).toContain('confident but not arrogant');
  });

  it('includes target audience', () => {
    const p = buildBlockCopyUserPrompt(
      { blockType: 'hero' },
      { targetAudience: 'CTOs at Series B startups' },
    );
    expect(p).toContain('CTOs at Series B startups');
  });

  it('omits missing messaging fields entirely (no leftover labels)', () => {
    const p = buildBlockCopyUserPrompt({ blockType: 'hero' }, { companyName: 'Solo' });
    expect(p).toContain('Solo');
    expect(p).not.toContain('Tagline:');
    expect(p).not.toContain('Value proposition:');
    expect(p).not.toContain('Elevator pitch:');
    expect(p).not.toContain('Target audience:');
    expect(p).not.toContain('Tone of voice:');
    expect(p).not.toContain('Brand personality:');
    expect(p).not.toContain('Writing style:');
  });

  it('omits empty differentiator array (no leftover header)', () => {
    const p = buildBlockCopyUserPrompt(
      { blockType: 'hero' },
      { companyName: 'Solo', keyDifferentiators: [] },
    );
    expect(p).not.toContain('Key differentiators:');
  });

  it('renders differentiators as bullet list', () => {
    const p = buildBlockCopyUserPrompt(
      { blockType: 'hero' },
      { keyDifferentiators: ['alpha', 'beta', 'gamma'] },
    );
    expect(p).toContain('  - alpha');
    expect(p).toContain('  - beta');
    expect(p).toContain('  - gamma');
  });

  it('renders "Brand context" header only when messaging is present', () => {
    const withMsg = buildBlockCopyUserPrompt({ blockType: 'hero' }, { companyName: 'X' });
    expect(withMsg).toContain('── Brand context ──');
    const noMsg = buildBlockCopyUserPrompt({ blockType: 'hero' }, undefined);
    expect(noMsg).not.toContain('── Brand context ──');
    expect(noMsg).toContain('No brand messaging configured');
  });
});

describe('buildBlockCopyUserPrompt — tone axes intensity bands', () => {
  it('marks |axis| < 0.2 as neutral', () => {
    const p = buildBlockCopyUserPrompt(
      { blockType: 'hero' },
      { toneAxes: { formal: 0.1 } },
    );
    expect(p).toMatch(/Formality.*neutral/);
    expect(p).toMatch(/balanced between casual and formal/);
  });

  it('marks |axis| in [0.2, 0.33] as slightly', () => {
    const p = buildBlockCopyUserPrompt(
      { blockType: 'hero' },
      { toneAxes: { playful: 0.25 } },
    );
    expect(p).toMatch(/Playfulness.*slightly playful/);
  });

  it('marks |axis| in (0.33, 0.66] as moderately', () => {
    const p = buildBlockCopyUserPrompt(
      { blockType: 'hero' },
      { toneAxes: { playful: 0.5 } },
    );
    expect(p).toMatch(/Playfulness.*moderately playful/);
  });

  it('marks |axis| > 0.66 as strongly', () => {
    const p = buildBlockCopyUserPrompt(
      { blockType: 'hero' },
      { toneAxes: { formal: 0.9 } },
    );
    expect(p).toMatch(/Formality.*strongly formal/);
  });

  it('uses low-end label for negative values', () => {
    const p = buildBlockCopyUserPrompt(
      { blockType: 'hero' },
      { toneAxes: { formal: -0.8, playful: -0.5, traditional: -0.4, authoritative: -0.9 } },
    );
    expect(p).toMatch(/Formality.*strongly casual/);
    expect(p).toMatch(/Playfulness.*moderately serious/);
    expect(p).toMatch(/Tradition.*moderately innovative/);
    expect(p).toMatch(/Authority.*strongly friendly/);
  });

  it('renders authoritative axis (not covered in existing test)', () => {
    const p = buildBlockCopyUserPrompt(
      { blockType: 'hero' },
      { toneAxes: { authoritative: 0.7 } },
    );
    expect(p).toMatch(/Authority.*strongly authoritative/);
  });

  it('omits undefined axes from output', () => {
    const p = buildBlockCopyUserPrompt(
      { blockType: 'hero' },
      { toneAxes: { formal: 0.5 } },
    );
    expect(p).toMatch(/Formality.*moderately formal/);
    expect(p).not.toContain('Playfulness');
    expect(p).not.toContain('Tradition');
    expect(p).not.toContain('Authority');
  });

  it('omits "Tone axes:" header when all axes are undefined', () => {
    const p = buildBlockCopyUserPrompt(
      { blockType: 'hero' },
      { companyName: 'A', toneAxes: {} },
    );
    expect(p).not.toContain('Tone axes:');
  });

  it('omits "Tone axes:" header when toneAxes itself is absent', () => {
    const p = buildBlockCopyUserPrompt(
      { blockType: 'hero' },
      { companyName: 'A' },
    );
    expect(p).not.toContain('Tone axes:');
  });

  it('treats axis value of 0 as neutral', () => {
    const p = buildBlockCopyUserPrompt(
      { blockType: 'hero' },
      { toneAxes: { formal: 0 } },
    );
    expect(p).toMatch(/Formality.*neutral/);
  });
});

describe('buildBlockCopyUserPrompt — voice samples', () => {
  it('truncates to first 5 samples', () => {
    const samples: VoiceSample[] = Array.from({ length: 8 }, (_, i) => ({
      context: `ctx${i}`,
      text: `sample-text-${i}`,
    }));
    const p = buildBlockCopyUserPrompt({ blockType: 'hero' }, { voiceSamples: samples });
    expect(p).toContain('sample-text-0');
    expect(p).toContain('sample-text-4');
    expect(p).not.toContain('sample-text-5');
    expect(p).not.toContain('sample-text-7');
  });

  it('omits voice section header when samples array is empty', () => {
    const p = buildBlockCopyUserPrompt({ blockType: 'hero' }, { voiceSamples: [] });
    expect(p).not.toContain('Voice exemplars');
  });

  it('omits voice section when voiceSamples is undefined', () => {
    const p = buildBlockCopyUserPrompt({ blockType: 'hero' }, { companyName: 'X' });
    expect(p).not.toContain('Voice exemplars');
  });

  it('formats each sample with context + quoted text', () => {
    const p = buildBlockCopyUserPrompt(
      { blockType: 'hero' },
      { voiceSamples: [{ context: 'landing hero', text: 'Launch in minutes.' }] },
    );
    expect(p).toContain('(landing hero)');
    expect(p).toContain('"Launch in minutes."');
  });
});

describe('buildBlockCopyUserPrompt — caller context placement', () => {
  it('omits caller context section when not provided', () => {
    const p = buildBlockCopyUserPrompt({ blockType: 'hero' }, { companyName: 'X' });
    expect(p).not.toContain('Page / caller context');
  });

  it('includes the section header when context provided', () => {
    const p = buildBlockCopyUserPrompt(
      { blockType: 'hero', context: 'targeted at K-12 admins' },
      undefined,
    );
    expect(p).toContain('── Page / caller context ──');
    expect(p).toContain('K-12 admins');
  });

  it('places caller context after brand context', () => {
    const p = buildBlockCopyUserPrompt(
      { blockType: 'hero', context: 'PAGE-CTX-MARKER' },
      { companyName: 'BRAND-CO-MARKER' },
    );
    expect(p.indexOf('BRAND-CO-MARKER')).toBeLessThan(p.indexOf('PAGE-CTX-MARKER'));
  });
});

describe('auditToneAxes — additional cases', () => {
  it('returns empty array when axes object is empty', () => {
    expect(auditToneAxes({})).toEqual([]);
  });

  it('does not flag when only formal is high', () => {
    const issues = auditToneAxes({ formal: 0.9 });
    expect(issues).toEqual([]);
  });

  it('does not flag when only playful is high', () => {
    const issues = auditToneAxes({ playful: 0.9 });
    expect(issues).toEqual([]);
  });

  it('does not flag when formal high but playful negative', () => {
    const issues = auditToneAxes({ formal: 0.9, playful: -0.9 });
    expect(issues.some((i) => i.id === 'tone-formal-vs-playful')).toBe(false);
  });

  it('does not flag when traditional high but playful negative', () => {
    const issues = auditToneAxes({ traditional: 0.9, playful: -0.9 });
    expect(issues.some((i) => i.id === 'tone-traditional-vs-playful')).toBe(false);
  });

  it('treats 0.5 as boundary (not flagged — uses strict >)', () => {
    const issues = auditToneAxes({ formal: 0.5, playful: 0.5 });
    expect(issues.some((i) => i.id === 'tone-formal-vs-playful')).toBe(false);
  });

  it('flags both contradictions simultaneously when applicable', () => {
    const issues = auditToneAxes({ formal: 0.8, playful: 0.8, traditional: 0.8 });
    const ids = issues.map((i) => i.id);
    expect(ids).toContain('tone-formal-vs-playful');
    expect(ids).toContain('tone-traditional-vs-playful');
  });

  it('each issue has an id and a message string', () => {
    const issues = auditToneAxes({ formal: 0.8, playful: 0.8 });
    expect(issues.length).toBeGreaterThan(0);
    for (const i of issues) {
      expect(typeof i.id).toBe('string');
      expect(i.id.length).toBeGreaterThan(0);
      expect(typeof i.message).toBe('string');
      expect(i.message.length).toBeGreaterThan(0);
    }
  });

  it('does not flag traditional-vs-playful when traditional undefined', () => {
    const issues = auditToneAxes({ playful: 0.9 });
    expect(issues.some((i) => i.id === 'tone-traditional-vs-playful')).toBe(false);
  });

  it('does not flag traditional-vs-playful when playful undefined', () => {
    const issues = auditToneAxes({ traditional: 0.9 });
    expect(issues.some((i) => i.id === 'tone-traditional-vs-playful')).toBe(false);
  });
});
