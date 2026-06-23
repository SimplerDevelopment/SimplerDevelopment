import { describe, it, expect } from 'vitest';
import {
  applyBrandDefaults,
  messagingRowToContext,
  type BrandDefaultsContext,
  type BrandMessagingContext,
  type ToneAxes,
  type VoiceSample,
} from '@/lib/branding/block-defaults';
import type { Block } from '@/types/blocks';

// Minimal helpers to construct blocks. The brand-defaults module only reads a
// handful of fields, so we cast to Block to avoid pulling in every required
// field of every block type while still exercising real switch-case branches.
function makeBlock<T extends Record<string, unknown>>(b: T): Block {
  return b as unknown as Block;
}

const FULL_MESSAGING: BrandMessagingContext = {
  companyName: 'Acme Corp',
  tagline: 'Build delightful things',
  valueProposition: 'Ship faster with confidence',
  elevatorPitch: 'We help teams launch in days, not months.',
  boilerplate: 'Acme Corp helps people make stuff. Founded 2020.',
  missionStatement: 'Empower builders',
  visionStatement: 'A world of makers',
  socialProof: 'This product changed our lives — Jane Doe',
  toneOfVoice: 'warm',
  brandPersonality: 'curious',
  writingStyle: 'plainspoken',
  targetAudience: 'founders',
};

describe('applyBrandDefaults', () => {
  describe('hero block', () => {
    it('replaces "Hero Title" placeholder with tagline when messaging present', () => {
      const block = makeBlock({
        id: 'h1',
        type: 'hero',
        order: 0,
        title: 'Hero Title',
        subtitle: 'Subtitle',
        description: 'Description',
      });
      const out = applyBrandDefaults(block, { messaging: FULL_MESSAGING });
      expect((out as any).title).toBe('Build delightful things');
      expect((out as any).subtitle).toBe('Ship faster with confidence');
      expect((out as any).description).toBe('We help teams launch in days, not months.');
    });

    it('falls back to companyName when tagline missing', () => {
      const messaging: BrandMessagingContext = { companyName: 'Acme' };
      const block = makeBlock({
        id: 'h2',
        type: 'hero',
        order: 0,
        title: 'Hero Title',
      });
      const out = applyBrandDefaults(block, { messaging });
      expect((out as any).title).toBe('Acme');
    });

    it('leaves title alone when not the placeholder', () => {
      const block = makeBlock({
        id: 'h3',
        type: 'hero',
        order: 0,
        title: 'Custom title from user',
        subtitle: 'Custom subtitle',
        description: 'Custom desc',
      });
      const out = applyBrandDefaults(block, { messaging: FULL_MESSAGING });
      expect((out as any).title).toBe('Custom title from user');
      expect((out as any).subtitle).toBe('Custom subtitle');
      expect((out as any).description).toBe('Custom desc');
    });

    it('fills subtitle when empty string (not only when "Subtitle")', () => {
      const block = makeBlock({
        id: 'h4',
        type: 'hero',
        order: 0,
        title: 'Hero Title',
        subtitle: '',
        description: '',
      });
      const out = applyBrandDefaults(block, { messaging: FULL_MESSAGING });
      expect((out as any).subtitle).toBe('Ship faster with confidence');
      expect((out as any).description).toBe('We help teams launch in days, not months.');
    });

    it('does not mutate input', () => {
      const block = makeBlock({
        id: 'h5',
        type: 'hero',
        order: 0,
        title: 'Hero Title',
      });
      const out = applyBrandDefaults(block, { messaging: FULL_MESSAGING });
      expect((block as any).title).toBe('Hero Title');
      expect(out).not.toBe(block);
    });

    it('returns block unchanged when no messaging', () => {
      const block = makeBlock({
        id: 'h6',
        type: 'hero',
        order: 0,
        title: 'Hero Title',
      });
      const out = applyBrandDefaults(block, {});
      expect((out as any).title).toBe('Hero Title');
    });

    it('keeps placeholder when messaging has no usable fields', () => {
      const block = makeBlock({
        id: 'h7',
        type: 'hero',
        order: 0,
        title: 'Hero Title',
        subtitle: 'Subtitle',
        description: 'Description',
      });
      const out = applyBrandDefaults(block, { messaging: { toneOfVoice: 'warm' } });
      // No tagline/companyName/valueProp/pitch → fields stay as placeholders.
      expect((out as any).title).toBe('Hero Title');
      expect((out as any).subtitle).toBe('Subtitle');
      expect((out as any).description).toBe('Description');
    });

    it('useSentinels passes style through (no-op currently)', () => {
      const style = { backgroundColor: '#fff' };
      const block = makeBlock({
        id: 'h8',
        type: 'hero',
        order: 0,
        title: 'Hero Title',
        style,
      });
      const out = applyBrandDefaults(block, {
        messaging: FULL_MESSAGING,
        useSentinels: true,
      });
      expect((out as any).style).toEqual(style);
    });
  });

  describe('cta block', () => {
    it('replaces placeholder title with valueProposition', () => {
      const block = makeBlock({
        id: 'c1',
        type: 'cta',
        order: 0,
        title: 'Ready to get started?',
        description: 'Join thousands of satisfied customers',
        primaryButtonText: 'Go',
        primaryButtonUrl: '/go',
      });
      const out = applyBrandDefaults(block, { messaging: FULL_MESSAGING });
      expect((out as any).title).toBe('Ship faster with confidence');
      expect((out as any).description).toBe('We help teams launch in days, not months.');
    });

    it('falls back to tagline for description when no elevatorPitch', () => {
      const messaging: BrandMessagingContext = {
        valueProposition: 'VP',
        tagline: 'Tag',
      };
      const block = makeBlock({
        id: 'c2',
        type: 'cta',
        order: 0,
        title: 'Ready to get started?',
        description: 'Join thousands of satisfied customers',
        primaryButtonText: 'Go',
        primaryButtonUrl: '/go',
      });
      const out = applyBrandDefaults(block, { messaging });
      expect((out as any).description).toBe('Tag');
    });

    it('leaves customized title alone', () => {
      const block = makeBlock({
        id: 'c3',
        type: 'cta',
        order: 0,
        title: 'Custom CTA',
        description: 'Custom Desc',
        primaryButtonText: 'Go',
        primaryButtonUrl: '/go',
      });
      const out = applyBrandDefaults(block, { messaging: FULL_MESSAGING });
      expect((out as any).title).toBe('Custom CTA');
      expect((out as any).description).toBe('Custom Desc');
    });

    it('returns block unchanged when no messaging', () => {
      const block = makeBlock({
        id: 'c4',
        type: 'cta',
        order: 0,
        title: 'Ready to get started?',
        primaryButtonText: 'Go',
        primaryButtonUrl: '/go',
      });
      const out = applyBrandDefaults(block, {});
      expect((out as any).title).toBe('Ready to get started?');
    });
  });

  describe('testimonial block', () => {
    it('replaces placeholder quote with socialProof', () => {
      const block = makeBlock({
        id: 't1',
        type: 'testimonial',
        order: 0,
        quote: 'This is an amazing product!',
        author: 'Anon',
      });
      const out = applyBrandDefaults(block, { messaging: FULL_MESSAGING });
      expect((out as any).quote).toBe('This product changed our lives — Jane Doe');
    });

    it('truncates long socialProof to 280 chars with ellipsis', () => {
      const longProof = 'x'.repeat(500);
      const messaging: BrandMessagingContext = { socialProof: longProof };
      const block = makeBlock({
        id: 't2',
        type: 'testimonial',
        order: 0,
        quote: 'This is an amazing product!',
        author: 'Anon',
      });
      const out = applyBrandDefaults(block, { messaging });
      const q = (out as any).quote as string;
      expect(q.length).toBe(280); // 279 chars + 1-char ellipsis
      expect(q.endsWith('…')).toBe(true);
      expect(q.startsWith('x'.repeat(279))).toBe(true);
    });

    it('does not truncate at exactly 280 chars', () => {
      const exact = 'y'.repeat(280);
      const messaging: BrandMessagingContext = { socialProof: exact };
      const block = makeBlock({
        id: 't3',
        type: 'testimonial',
        order: 0,
        quote: 'This is an amazing product!',
        author: 'Anon',
      });
      const out = applyBrandDefaults(block, { messaging });
      expect((out as any).quote).toBe(exact);
    });

    it('leaves customized quote alone', () => {
      const block = makeBlock({
        id: 't4',
        type: 'testimonial',
        order: 0,
        quote: 'My own custom quote',
        author: 'Me',
      });
      const out = applyBrandDefaults(block, { messaging: FULL_MESSAGING });
      expect((out as any).quote).toBe('My own custom quote');
    });

    it('does nothing when socialProof is empty string', () => {
      const messaging: BrandMessagingContext = { socialProof: '   ' };
      const block = makeBlock({
        id: 't5',
        type: 'testimonial',
        order: 0,
        quote: 'This is an amazing product!',
        author: 'Anon',
      });
      const out = applyBrandDefaults(block, { messaging });
      expect((out as any).quote).toBe('This is an amazing product!');
    });

    it('returns block unchanged when no messaging', () => {
      const block = makeBlock({
        id: 't6',
        type: 'testimonial',
        order: 0,
        quote: 'This is an amazing product!',
        author: 'Anon',
      });
      const out = applyBrandDefaults(block, {});
      expect((out as any).quote).toBe('This is an amazing product!');
    });
  });

  describe('email-footer block', () => {
    it('fills companyName when empty', () => {
      const block = makeBlock({
        id: 'ef1',
        type: 'email-footer',
        order: 0,
      });
      const out = applyBrandDefaults(block, { messaging: FULL_MESSAGING });
      expect((out as any).companyName).toBe('Acme Corp');
    });

    it('preserves existing companyName', () => {
      const block = makeBlock({
        id: 'ef2',
        type: 'email-footer',
        order: 0,
        companyName: 'Existing Co',
      });
      const out = applyBrandDefaults(block, { messaging: FULL_MESSAGING });
      expect((out as any).companyName).toBe('Existing Co');
    });

    it('does not set companyName when messaging lacks it', () => {
      const block = makeBlock({
        id: 'ef3',
        type: 'email-footer',
        order: 0,
      });
      const out = applyBrandDefaults(block, { messaging: { tagline: 'x' } });
      expect((out as any).companyName).toBeUndefined();
    });
  });

  describe('email-header block', () => {
    it('fills logoUrl when missing', () => {
      const block = makeBlock({
        id: 'eh1',
        type: 'email-header',
        order: 0,
      });
      const out = applyBrandDefaults(block, { logoUrl: 'https://cdn/logo.png' });
      expect((out as any).logoUrl).toBe('https://cdn/logo.png');
    });

    it('preserves existing logoUrl', () => {
      const block = makeBlock({
        id: 'eh2',
        type: 'email-header',
        order: 0,
        logoUrl: 'https://existing/img.png',
      });
      const out = applyBrandDefaults(block, { logoUrl: 'https://cdn/logo.png' });
      expect((out as any).logoUrl).toBe('https://existing/img.png');
    });

    it('does nothing when no logoUrl provided', () => {
      const block = makeBlock({
        id: 'eh3',
        type: 'email-header',
        order: 0,
      });
      const out = applyBrandDefaults(block, {});
      expect((out as any).logoUrl).toBeUndefined();
    });
  });

  describe('site-footer block', () => {
    it('builds copyright with current year and companyName', () => {
      const year = new Date().getFullYear();
      const block = makeBlock({
        id: 'sf1',
        type: 'site-footer',
        order: 0,
        linkGroups: [],
      });
      const out = applyBrandDefaults(block, { messaging: FULL_MESSAGING });
      expect((out as any).copyright).toBe(`© ${year} Acme Corp`);
    });

    it('preserves existing copyright', () => {
      const block = makeBlock({
        id: 'sf2',
        type: 'site-footer',
        order: 0,
        linkGroups: [],
        copyright: 'Already set',
      });
      const out = applyBrandDefaults(block, { messaging: FULL_MESSAGING });
      expect((out as any).copyright).toBe('Already set');
    });

    it('fills tagline from boilerplate', () => {
      const block = makeBlock({
        id: 'sf3',
        type: 'site-footer',
        order: 0,
        linkGroups: [],
      });
      const out = applyBrandDefaults(block, { messaging: FULL_MESSAGING });
      expect((out as any).tagline).toBe('Acme Corp helps people make stuff. Founded 2020.');
    });

    it('truncates boilerplate >200 chars with ellipsis', () => {
      const longBoiler = 'z'.repeat(400);
      const messaging: BrandMessagingContext = { boilerplate: longBoiler, companyName: 'Acme' };
      const block = makeBlock({
        id: 'sf4',
        type: 'site-footer',
        order: 0,
        linkGroups: [],
      });
      const out = applyBrandDefaults(block, { messaging });
      const tagline = (out as any).tagline as string;
      expect(tagline.length).toBe(198); // 197 chars + 1-char ellipsis
      expect(tagline.endsWith('…')).toBe(true);
      expect(tagline.startsWith('z'.repeat(197))).toBe(true);
    });

    it('preserves existing tagline', () => {
      const block = makeBlock({
        id: 'sf5',
        type: 'site-footer',
        order: 0,
        linkGroups: [],
        tagline: 'Existing tagline',
      });
      const out = applyBrandDefaults(block, { messaging: FULL_MESSAGING });
      expect((out as any).tagline).toBe('Existing tagline');
    });

    it('fills logoUrl when missing', () => {
      const block = makeBlock({
        id: 'sf6',
        type: 'site-footer',
        order: 0,
        linkGroups: [],
      });
      const out = applyBrandDefaults(block, {
        messaging: FULL_MESSAGING,
        logoUrl: 'https://cdn/site.png',
      });
      expect((out as any).logoUrl).toBe('https://cdn/site.png');
    });

    it('preserves existing logoUrl', () => {
      const block = makeBlock({
        id: 'sf7',
        type: 'site-footer',
        order: 0,
        linkGroups: [],
        logoUrl: 'https://existing/logo.png',
      });
      const out = applyBrandDefaults(block, {
        messaging: FULL_MESSAGING,
        logoUrl: 'https://cdn/site.png',
      });
      expect((out as any).logoUrl).toBe('https://existing/logo.png');
    });

    it('skips copyright when no companyName', () => {
      const block = makeBlock({
        id: 'sf8',
        type: 'site-footer',
        order: 0,
        linkGroups: [],
      });
      const out = applyBrandDefaults(block, { messaging: { tagline: 'x' } });
      expect((out as any).copyright).toBeUndefined();
    });

    it('does nothing without messaging or logoUrl', () => {
      const block = makeBlock({
        id: 'sf9',
        type: 'site-footer',
        order: 0,
        linkGroups: [],
      });
      const out = applyBrandDefaults(block, {});
      expect((out as any).copyright).toBeUndefined();
      expect((out as any).tagline).toBeUndefined();
      expect((out as any).logoUrl).toBeUndefined();
    });
  });

  describe('button block', () => {
    it('returns block unchanged when useSentinels is false', () => {
      const block = makeBlock({
        id: 'b1',
        type: 'button',
        order: 0,
        text: 'Click',
        url: '/x',
        style: { color: '#000' },
      });
      const out = applyBrandDefaults(block, { useSentinels: false });
      expect(out).toBe(block);
    });

    it('returns block unchanged when useSentinels is undefined', () => {
      const block = makeBlock({
        id: 'b2',
        type: 'button',
        order: 0,
        text: 'Click',
        url: '/x',
      });
      const out = applyBrandDefaults(block, {});
      expect(out).toBe(block);
    });

    it('applies sentinel styles when useSentinels true', () => {
      const block = makeBlock({
        id: 'b3',
        type: 'button',
        order: 0,
        text: 'Click',
        url: '/x',
        style: {},
      });
      const out = applyBrandDefaults(block, { useSentinels: true });
      expect((out as any).style.backgroundColor).toBe('brand.btnPrimaryBg');
      expect((out as any).style.color).toBe('brand.btnPrimaryText');
      expect((out as any).style.borderRadius).toBe('brand.btnRadius');
    });

    it('preserves caller-supplied style overrides', () => {
      const block = makeBlock({
        id: 'b4',
        type: 'button',
        order: 0,
        text: 'Click',
        url: '/x',
        style: {
          backgroundColor: '#ff0000',
          color: '#ffffff',
          borderRadius: '12px',
        },
      });
      const out = applyBrandDefaults(block, { useSentinels: true });
      expect((out as any).style.backgroundColor).toBe('#ff0000');
      expect((out as any).style.color).toBe('#ffffff');
      expect((out as any).style.borderRadius).toBe('12px');
    });

    it('works when block.style is undefined', () => {
      const block = makeBlock({
        id: 'b5',
        type: 'button',
        order: 0,
        text: 'Click',
        url: '/x',
      });
      const out = applyBrandDefaults(block, { useSentinels: true });
      expect((out as any).style.backgroundColor).toBe('brand.btnPrimaryBg');
      expect((out as any).style.color).toBe('brand.btnPrimaryText');
      expect((out as any).style.borderRadius).toBe('brand.btnRadius');
    });

    it('does not mutate input style', () => {
      const style = {};
      const block = makeBlock({
        id: 'b6',
        type: 'button',
        order: 0,
        text: 'Click',
        url: '/x',
        style,
      });
      applyBrandDefaults(block, { useSentinels: true });
      expect(style).toEqual({});
    });
  });

  describe('default branch (unknown block type)', () => {
    it('returns block reference unchanged for unknown type', () => {
      const block = makeBlock({
        id: 'u1',
        type: 'rich-text',
        order: 0,
        content: 'whatever',
      });
      const out = applyBrandDefaults(block, { messaging: FULL_MESSAGING, useSentinels: true });
      expect(out).toBe(block);
    });

    it('returns same reference for type the function does not handle', () => {
      const block = makeBlock({
        id: 'u2',
        type: 'image',
        order: 0,
        src: 'x.png',
      });
      const out = applyBrandDefaults(block, {});
      expect(out).toBe(block);
    });
  });
});

describe('messagingRowToContext', () => {
  it('returns undefined for null input', () => {
    expect(messagingRowToContext(null)).toBeUndefined();
  });

  it('returns undefined for undefined input', () => {
    expect(messagingRowToContext(undefined)).toBeUndefined();
  });

  it('maps all fields, converting null to undefined', () => {
    const toneAxes: ToneAxes = { formal: 0.5, playful: -0.2, traditional: 0, authoritative: 0.1 };
    const voiceSamples: VoiceSample[] = [{ context: 'email', text: 'Hi there' }];
    const row = {
      companyName: 'Acme',
      tagline: 'Tag',
      valueProposition: null,
      elevatorPitch: 'Pitch',
      boilerplate: null,
      missionStatement: 'Mission',
      visionStatement: null,
      keyDifferentiators: ['fast', 'cheap'],
      socialProof: null,
      toneOfVoice: 'warm',
      brandPersonality: null,
      writingStyle: 'plain',
      targetAudience: null,
      toneAxes,
      voiceSamples,
    };
    const ctx = messagingRowToContext(row);
    expect(ctx).toBeDefined();
    expect(ctx!.companyName).toBe('Acme');
    expect(ctx!.tagline).toBe('Tag');
    expect(ctx!.valueProposition).toBeUndefined();
    expect(ctx!.elevatorPitch).toBe('Pitch');
    expect(ctx!.boilerplate).toBeUndefined();
    expect(ctx!.missionStatement).toBe('Mission');
    expect(ctx!.visionStatement).toBeUndefined();
    expect(ctx!.keyDifferentiators).toEqual(['fast', 'cheap']);
    expect(ctx!.socialProof).toBeUndefined();
    expect(ctx!.toneOfVoice).toBe('warm');
    expect(ctx!.brandPersonality).toBeUndefined();
    expect(ctx!.writingStyle).toBe('plain');
    expect(ctx!.targetAudience).toBeUndefined();
    expect(ctx!.toneAxes).toEqual(toneAxes);
    expect(ctx!.voiceSamples).toEqual(voiceSamples);
  });

  it('handles all-null row', () => {
    const row = {
      companyName: null,
      tagline: null,
      valueProposition: null,
      elevatorPitch: null,
      boilerplate: null,
      missionStatement: null,
      visionStatement: null,
      keyDifferentiators: null,
      socialProof: null,
      toneOfVoice: null,
      brandPersonality: null,
      writingStyle: null,
      targetAudience: null,
      toneAxes: null,
      voiceSamples: null,
    };
    const ctx = messagingRowToContext(row);
    expect(ctx).toBeDefined();
    expect(ctx!.companyName).toBeUndefined();
    expect(ctx!.tagline).toBeUndefined();
    expect(ctx!.keyDifferentiators).toBeUndefined();
    expect(ctx!.toneAxes).toBeUndefined();
    expect(ctx!.voiceSamples).toBeUndefined();
  });

  it('handles empty row (all fields missing)', () => {
    const ctx = messagingRowToContext({});
    expect(ctx).toBeDefined();
    expect(ctx!.companyName).toBeUndefined();
    expect(ctx!.tagline).toBeUndefined();
  });

  it('round-trips with applyBrandDefaults on hero block', () => {
    const row = {
      companyName: 'Round Trip Co',
      tagline: 'Roundtrip tagline',
      valueProposition: 'Roundtrip VP',
      elevatorPitch: 'Roundtrip pitch',
      boilerplate: null,
      missionStatement: null,
      visionStatement: null,
      keyDifferentiators: null,
      socialProof: null,
      toneOfVoice: null,
      brandPersonality: null,
      writingStyle: null,
      targetAudience: null,
      toneAxes: null,
      voiceSamples: null,
    };
    const ctx: BrandDefaultsContext = { messaging: messagingRowToContext(row) };
    const block = makeBlock({
      id: 'rt1',
      type: 'hero',
      order: 0,
      title: 'Hero Title',
      subtitle: 'Subtitle',
      description: 'Description',
    });
    const out = applyBrandDefaults(block, ctx);
    expect((out as any).title).toBe('Roundtrip tagline');
    expect((out as any).subtitle).toBe('Roundtrip VP');
    expect((out as any).description).toBe('Roundtrip pitch');
  });

  it('preserves empty-string fields as empty strings (not undefined)', () => {
    const row = {
      companyName: '',
      tagline: '',
    };
    const ctx = messagingRowToContext(row);
    // Empty strings are not null, so the ?? operator leaves them as ''.
    expect(ctx!.companyName).toBe('');
    expect(ctx!.tagline).toBe('');
  });
});
