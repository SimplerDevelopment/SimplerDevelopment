import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// 1) lib/security/sanitize-html.ts
// ---------------------------------------------------------------------------
describe('lib/security/sanitize-html', () => {
  it('sanitizeHtml strips script tags and event handlers', async () => {
    const { sanitizeHtml } = await import('@/lib/security/sanitize-html');
    const input = '<p>hello</p><script>alert(1)</script>';
    const out = sanitizeHtml(input);
    expect(out).toContain('<p>hello</p>');
    expect(out).not.toContain('<script>');
    expect(out).not.toContain('alert(1)');
  });

  it('sanitizeHtml strips forbidden tags: iframe, form, object, embed, style', async () => {
    const { sanitizeHtml } = await import('@/lib/security/sanitize-html');
    const out = sanitizeHtml(
      '<style>.x{}</style><iframe src="x"></iframe><form></form><object></object><embed />',
    );
    expect(out).not.toMatch(/<iframe/i);
    expect(out).not.toMatch(/<form/i);
    expect(out).not.toMatch(/<object/i);
    expect(out).not.toMatch(/<embed/i);
    expect(out).not.toMatch(/<style/i);
  });

  it('sanitizeHtml strips onerror/onclick handler attributes', async () => {
    const { sanitizeHtml } = await import('@/lib/security/sanitize-html');
    const out = sanitizeHtml('<img src="x" onerror="alert(1)" onclick="x()" />');
    expect(out).not.toMatch(/onerror/i);
    expect(out).not.toMatch(/onclick/i);
  });

  it('sanitizeHtml accepts safe http/mailto/tel links', async () => {
    const { sanitizeHtml } = await import('@/lib/security/sanitize-html');
    const out = sanitizeHtml('<a href="https://example.com">x</a>');
    expect(out).toContain('href="https://example.com"');
    const mail = sanitizeHtml('<a href="mailto:a@b.com">x</a>');
    expect(mail).toContain('mailto:a@b.com');
  });

  it('sanitizeHtml handles null/undefined as empty', async () => {
    const { sanitizeHtml } = await import('@/lib/security/sanitize-html');
    expect(sanitizeHtml(undefined as unknown as string)).toBe('');
    expect(sanitizeHtml(null as unknown as string)).toBe('');
    expect(sanitizeHtml('')).toBe('');
  });

  it('sanitizeRichHtml keeps inline styles but strips iframes and handlers', async () => {
    const { sanitizeRichHtml } = await import('@/lib/security/sanitize-html');
    const out = sanitizeRichHtml(
      '<p style="color:red" class="x">a</p><iframe></iframe><img onerror="x"/>',
    );
    expect(out).toContain('style="color:red"');
    expect(out).toContain('class="x"');
    expect(out).not.toMatch(/<iframe/i);
    expect(out).not.toMatch(/onerror/i);
  });

  it('sanitizeRichHtml allows data: URIs (unlike strict sanitizeHtml)', async () => {
    const { sanitizeRichHtml } = await import('@/lib/security/sanitize-html');
    const out = sanitizeRichHtml('<img src="data:image/png;base64,AAA" />');
    expect(out).toMatch(/data:image\/png/);
  });

  it('sanitizeRichHtml handles undefined', async () => {
    const { sanitizeRichHtml } = await import('@/lib/security/sanitize-html');
    expect(sanitizeRichHtml(undefined as unknown as string)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 2) lib/oauth/scopes.ts
// ---------------------------------------------------------------------------
describe('lib/oauth/scopes', () => {
  it('SUPPORTED_SCOPES includes wildcard and core read/write scopes', async () => {
    const { SUPPORTED_SCOPES } = await import('@/lib/oauth/scopes');
    expect(SUPPORTED_SCOPES).toContain('*');
    expect(SUPPORTED_SCOPES).toContain('profile:read');
    expect(SUPPORTED_SCOPES).toContain('profile:write');
    expect(SUPPORTED_SCOPES).toContain('sites:read');
    expect(SUPPORTED_SCOPES).toContain('ai:read');
  });

  it('DEFAULT_GRANTED_SCOPES is all read scopes and excludes writes and wildcard', async () => {
    const { DEFAULT_GRANTED_SCOPES } = await import('@/lib/oauth/scopes');
    expect(DEFAULT_GRANTED_SCOPES.length).toBeGreaterThan(0);
    expect(DEFAULT_GRANTED_SCOPES).not.toContain('*');
    for (const s of DEFAULT_GRANTED_SCOPES) {
      expect(s.endsWith(':read')).toBe(true);
    }
    expect(DEFAULT_GRANTED_SCOPES).toContain('profile:read');
    expect(DEFAULT_GRANTED_SCOPES).toContain('billing:read');
  });

  it('parseRequestedScopes returns [] for empty/null/undefined', async () => {
    const { parseRequestedScopes } = await import('@/lib/oauth/scopes');
    expect(parseRequestedScopes(null)).toEqual([]);
    expect(parseRequestedScopes(undefined)).toEqual([]);
    expect(parseRequestedScopes('')).toEqual([]);
  });

  it('parseRequestedScopes splits on whitespace and filters to supported scopes', async () => {
    const { parseRequestedScopes } = await import('@/lib/oauth/scopes');
    const out = parseRequestedScopes('profile:read sites:read crm:write');
    expect(out).toEqual(['profile:read', 'sites:read', 'crm:write']);
  });

  it('parseRequestedScopes silently drops unknown scopes', async () => {
    const { parseRequestedScopes } = await import('@/lib/oauth/scopes');
    const out = parseRequestedScopes('profile:read bogus:scope another_bad');
    expect(out).toEqual(['profile:read']);
  });

  it('parseRequestedScopes handles tabs and multiple spaces', async () => {
    const { parseRequestedScopes } = await import('@/lib/oauth/scopes');
    const out = parseRequestedScopes('  profile:read\tsites:read   crm:read  ');
    expect(out).toEqual(['profile:read', 'sites:read', 'crm:read']);
  });

  it('parseRequestedScopes accepts wildcard *', async () => {
    const { parseRequestedScopes } = await import('@/lib/oauth/scopes');
    expect(parseRequestedScopes('*')).toEqual(['*']);
  });
});

// ---------------------------------------------------------------------------
// 3) lib/brain/meeting-sources/paste.ts
// ---------------------------------------------------------------------------
vi.mock('crypto', async (orig) => {
  const actual = (await orig()) as typeof import('crypto');
  return {
    ...actual,
    randomUUID: () => 'uuid-stub-1234',
  };
});

describe('lib/brain/meeting-sources/paste', () => {
  it('exports the adapter metadata', async () => {
    const { pasteAdapter } = await import('@/lib/brain/meeting-sources/paste');
    expect(pasteAdapter.id).toBe('paste');
    expect(pasteAdapter.label).toBe('Paste transcript');
    expect(pasteAdapter.icon).toBe('content_paste');
    expect(typeof pasteAdapter.description).toBe('string');
  });

  it('enabledFor always returns true', async () => {
    const { pasteAdapter } = await import('@/lib/brain/meeting-sources/paste');
    expect(pasteAdapter.enabledFor({} as never)).toBe(true);
  });

  it('fetch throws when transcript is empty / whitespace', async () => {
    const { pasteAdapter } = await import('@/lib/brain/meeting-sources/paste');
    await expect(
      pasteAdapter.fetch({ transcript: '' }, {} as never),
    ).rejects.toThrow(/Transcript is required/);
    await expect(
      pasteAdapter.fetch({ transcript: '   \n\t  ' }, {} as never),
    ).rejects.toThrow(/Transcript is required/);
  });

  it('fetch trims transcript and returns NormalizedMeetingInput with minimal input', async () => {
    const { pasteAdapter } = await import('@/lib/brain/meeting-sources/paste');
    const out = await pasteAdapter.fetch({ transcript: '  hello world  ' }, {} as never);
    expect(out.transcript).toBe('hello world');
    expect(out.title).toBeUndefined();
    expect(out.meetingDate).toBeUndefined();
    expect(out.participants).toEqual([]);
    expect(out.sourceRef).toMatch(/^paste:/);
    expect(out.sourceMetadata).toEqual({ byteCount: 'hello world'.length });
  });

  it('fetch normalizes title, meetingDate, and participants', async () => {
    const { pasteAdapter } = await import('@/lib/brain/meeting-sources/paste');
    const out = await pasteAdapter.fetch(
      {
        transcript: 'A transcript',
        title: '  Standup  ',
        meetingDate: '2026-05-01T10:00:00.000Z',
        participants: [
          { name: '  Alice  ', email: '  alice@example.com  ' },
          { name: 'Bob' },
          { name: '   ', email: 'ghost@example.com' }, // dropped (empty name)
        ],
      },
      {} as never,
    );
    expect(out.title).toBe('Standup');
    expect(out.meetingDate).toBeInstanceOf(Date);
    expect(out.meetingDate?.toISOString()).toBe('2026-05-01T10:00:00.000Z');
    expect(out.participants).toEqual([
      { name: 'Alice', email: 'alice@example.com' },
      { name: 'Bob', email: undefined },
    ]);
  });

  it('fetch treats empty/whitespace title as undefined', async () => {
    const { pasteAdapter } = await import('@/lib/brain/meeting-sources/paste');
    const out = await pasteAdapter.fetch({ transcript: 'x', title: '   ' }, {} as never);
    expect(out.title).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4) lib/branding/button-presets.ts
// ---------------------------------------------------------------------------
describe('lib/branding/button-presets', () => {
  it('presetToStyle resolves brand sentinels and copies through other props', async () => {
    const { presetToStyle } = await import('@/lib/branding/button-presets');
    const style = presetToStyle({
      id: 'p1',
      name: 'P',
      backgroundColor: 'brand.primary',
      color: '#fff',
      borderColor: 'brand.accent',
      borderWidth: '2px',
      borderStyle: 'solid',
      borderRadius: 'brand.btnRadius',
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      paddingX: '12px',
      paddingY: '8px',
    });
    expect(style.backgroundColor).toBe('var(--brand-primary)');
    expect(style.color).toBe('#fff');
    expect(style.borderColor).toBe('var(--brand-accent)');
    expect(style.borderWidth).toBe('2px');
    expect(style.borderStyle).toBe('solid');
    expect(style.borderRadius).toBe('var(--brand-btn-border-radius)');
    expect(style.fontWeight).toBe('600');
    expect(style.textTransform).toBe('uppercase');
    expect(style.letterSpacing).toBe('0.05em');
    expect(style.paddingTop).toBe('8px');
    expect(style.paddingBottom).toBe('8px');
    expect(style.paddingLeft).toBe('12px');
    expect(style.paddingRight).toBe('12px');
  });

  it('presetToStyle returns empty object for minimal preset', async () => {
    const { presetToStyle } = await import('@/lib/branding/button-presets');
    const style = presetToStyle({ id: 'p', name: 'P' });
    expect(style).toEqual({});
  });

  it('presetToStyle handles paddingX alone (paddingY undefined)', async () => {
    const { presetToStyle } = await import('@/lib/branding/button-presets');
    const style = presetToStyle({ id: 'p', name: 'P', paddingX: '16px' });
    expect(style.paddingLeft).toBe('16px');
    expect(style.paddingRight).toBe('16px');
    expect(style.paddingTop).toBeUndefined();
    expect(style.paddingBottom).toBeUndefined();
  });

  it('findPreset returns matching preset by id', async () => {
    const { findPreset } = await import('@/lib/branding/button-presets');
    const presets = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ];
    expect(findPreset(presets, 'b')).toEqual({ id: 'b', name: 'B' });
  });

  it('findPreset returns undefined when presets list missing/empty/no match', async () => {
    const { findPreset } = await import('@/lib/branding/button-presets');
    expect(findPreset(undefined, 'a')).toBeUndefined();
    expect(findPreset([], 'a')).toBeUndefined();
    expect(findPreset([{ id: 'a', name: 'A' }], undefined)).toBeUndefined();
    expect(findPreset([{ id: 'a', name: 'A' }], 'z')).toBeUndefined();
  });

  it('newPresetId returns crypto.randomUUID() when available', async () => {
    const { newPresetId } = await import('@/lib/branding/button-presets');
    const id = newPresetId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(5);
  });

  it('newPresetId falls back to preset_<rand> when crypto.randomUUID is absent', async () => {
    const originalCrypto = globalThis.crypto;
    // Replace global crypto with one lacking randomUUID
    Object.defineProperty(globalThis, 'crypto', {
      value: {},
      configurable: true,
      writable: true,
    });
    try {
      // Force a fresh module so the runtime crypto check evaluates again
      vi.resetModules();
      const { newPresetId } = await import('@/lib/branding/button-presets');
      const id = newPresetId();
      expect(id).toMatch(/^preset_/);
    } finally {
      Object.defineProperty(globalThis, 'crypto', {
        value: originalCrypto,
        configurable: true,
        writable: true,
      });
      vi.resetModules();
    }
  });

  it('createDefaultPreset names first preset "Primary" and uses brand sentinels', async () => {
    const { createDefaultPreset } = await import('@/lib/branding/button-presets');
    const first = createDefaultPreset(0);
    expect(first.name).toBe('Primary');
    expect(first.backgroundColor).toBe('brand.primary');
    expect(first.color).toBe('#ffffff');
    expect(first.borderRadius).toBe('brand.btnRadius');
    expect(typeof first.id).toBe('string');
    expect(first.id.length).toBeGreaterThan(0);
  });

  it('createDefaultPreset names subsequent presets "Preset N"', async () => {
    const { createDefaultPreset } = await import('@/lib/branding/button-presets');
    expect(createDefaultPreset(1).name).toBe('Preset 2');
    expect(createDefaultPreset(4).name).toBe('Preset 5');
  });
});
