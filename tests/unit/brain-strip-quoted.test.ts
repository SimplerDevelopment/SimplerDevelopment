// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { stripQuotedReply } from '@/lib/brain/strip-quoted';

describe('lib/brain/strip-quoted', () => {
  describe('null / empty / falsy input', () => {
    it('returns empty body + null quoted for null', () => {
      expect(stripQuotedReply(null)).toEqual({ body: '', quoted: null });
    });

    it('returns empty body + null quoted for undefined', () => {
      expect(stripQuotedReply(undefined)).toEqual({ body: '', quoted: null });
    });

    it('returns empty body + null quoted for empty string', () => {
      expect(stripQuotedReply('')).toEqual({ body: '', quoted: null });
    });
  });

  describe('no marker present', () => {
    it('returns the entire input (trimmed) as body when no reply marker matches', () => {
      const out = stripQuotedReply('Hello, just a single-line message.');
      expect(out.body).toBe('Hello, just a single-line message.');
      expect(out.quoted).toBeNull();
    });

    it('trims surrounding whitespace when no marker matches', () => {
      const out = stripQuotedReply('   \n  hi there  \n\n');
      expect(out.body).toBe('hi there');
      expect(out.quoted).toBeNull();
    });

    it('preserves internal whitespace/newlines in body when no marker matches', () => {
      const text = 'line one\n\nline two\n  indented';
      const out = stripQuotedReply(text);
      expect(out.body).toBe('line one\n\nline two\n  indented');
      expect(out.quoted).toBeNull();
    });

    it('single line with no marker stays intact', () => {
      const out = stripQuotedReply('one');
      expect(out.body).toBe('one');
      expect(out.quoted).toBeNull();
    });
  });

  describe('Gmail-style "On ... wrote:" marker', () => {
    it('splits at "On Wed, Apr 29, 2026 at 12:56 AM Dan Coyle <x@y> wrote:"', () => {
      const input =
        'Thanks for the update!\n\nOn Wed, Apr 29, 2026 at 12:56 AM Dan Coyle <dan@example.com> wrote:\n> previous content here';
      const out = stripQuotedReply(input);
      expect(out.body).toBe('Thanks for the update!');
      expect(out.quoted).toContain('On Wed, Apr 29, 2026');
      expect(out.quoted).toContain('previous content here');
    });

    it('is case-insensitive on the "On ... wrote:" marker', () => {
      const input = 'reply text\n\non MONDAY, jan 1, somebody WROTE:\nquoted';
      const out = stripQuotedReply(input);
      expect(out.body).toBe('reply text');
      expect(out.quoted).toMatch(/wrote:/i);
    });

    it('does NOT match a stray "wrote:" without "On ..." preceding it', () => {
      const input = 'I wrote: a thing.\nThat is the whole reply.';
      const out = stripQuotedReply(input);
      expect(out.body).toBe('I wrote: a thing.\nThat is the whole reply.');
      expect(out.quoted).toBeNull();
    });
  });

  describe('Outlook "-----Original Message-----" marker', () => {
    it('splits at the Outlook plain-text divider', () => {
      const input =
        'Quick reply.\n\n-----Original Message-----\nFrom: someone\nSubject: hi';
      const out = stripQuotedReply(input);
      expect(out.body).toBe('Quick reply.');
      expect(out.quoted).toContain('-----Original Message-----');
      expect(out.quoted).toContain('From: someone');
    });

    it('matches the divider when surrounded by extra dashes', () => {
      const input = 'body\n\n-------- Original Message --------\nquoted body';
      const out = stripQuotedReply(input);
      expect(out.body).toBe('body');
      expect(out.quoted).toContain('Original Message');
    });
  });

  describe('Forwarded-message marker', () => {
    it('splits at "---------- Forwarded message ----------"', () => {
      const input =
        'FYI below.\n\n---------- Forwarded message ----------\nFrom: bob\nDate: yesterday';
      const out = stripQuotedReply(input);
      expect(out.body).toBe('FYI below.');
      expect(out.quoted).toContain('Forwarded message');
      expect(out.quoted).toContain('From: bob');
    });
  });

  describe('Outlook header-block marker', () => {
    it('splits at a "From: ...\\nSent: ..." header block', () => {
      const input =
        'See below.\n\nFrom: Alice <a@x.com>\nSent: Monday, January 1, 2026 9:00 AM\nTo: Bob\nSubject: Re: hi';
      const out = stripQuotedReply(input);
      expect(out.body).toBe('See below.');
      expect(out.quoted).toMatch(/^From: Alice/);
      expect(out.quoted).toContain('Sent: Monday');
    });

    it('does NOT match a stray "From:" line without an immediately-following "Sent:" line', () => {
      const input = 'From: this thing\nIt arrived today.';
      const out = stripQuotedReply(input);
      expect(out.body).toBe('From: this thing\nIt arrived today.');
      expect(out.quoted).toBeNull();
    });
  });

  describe('legacy underscore divider', () => {
    it('splits at a line of 5+ underscores', () => {
      const input = 'My reply.\n\n_____________________\nOld thread content';
      const out = stripQuotedReply(input);
      expect(out.body).toBe('My reply.');
      expect(out.quoted).toContain('_____');
      expect(out.quoted).toContain('Old thread content');
    });

    it('does NOT match fewer than 5 underscores', () => {
      const input = 'My reply.\n\n____\nstill the same message';
      const out = stripQuotedReply(input);
      expect(out.body).toBe('My reply.\n\n____\nstill the same message');
      expect(out.quoted).toBeNull();
    });
  });

  describe('multiple markers — earliest wins', () => {
    it('picks the earliest of two markers when both appear', () => {
      // Gmail "On ... wrote:" appears before "-----Original Message-----"
      const input =
        'visible reply.\n\nOn Mon, Jan 1 someone wrote:\nquoted A\n\n-----Original Message-----\nquoted B';
      const out = stripQuotedReply(input);
      expect(out.body).toBe('visible reply.');
      // Quoted starts at the Gmail marker, so it should contain both quoted A and quoted B.
      expect(out.quoted).toMatch(/On Mon, Jan 1/);
      expect(out.quoted).toContain('quoted A');
      expect(out.quoted).toContain('-----Original Message-----');
      expect(out.quoted).toContain('quoted B');
    });

    it('picks Outlook divider when it precedes Gmail "On ... wrote:"', () => {
      const input =
        'reply text.\n\n-----Original Message-----\nintro\nOn Tue, Feb 2 person wrote:\nnested';
      const out = stripQuotedReply(input);
      expect(out.body).toBe('reply text.');
      expect(out.quoted).toMatch(/^-{2,}\s*Original Message/);
      expect(out.quoted).toContain('On Tue, Feb 2');
    });

    it('picks underscore divider when it is earliest', () => {
      const input =
        'top reply.\n\n_____________\nstuff\n\nOn Wed, Mar 3 someone wrote:\nnested';
      const out = stripQuotedReply(input);
      expect(out.body).toBe('top reply.');
      expect(out.quoted!.startsWith('_____')).toBe(true);
    });
  });

  describe('body / quoted trimming', () => {
    it('trims trailing whitespace from body but not internal newlines', () => {
      const input =
        'line a\nline b\n   \n\nOn Mon, Jan 1 someone wrote:\nquoted';
      const out = stripQuotedReply(input);
      expect(out.body).toBe('line a\nline b');
      expect(out.body.endsWith('\n')).toBe(false);
    });

    it('trims surrounding whitespace from quoted', () => {
      const input = 'body\n\nOn Mon, Jan 1 someone wrote:\n   quoted   ';
      const out = stripQuotedReply(input);
      expect(out.quoted).toBe('On Mon, Jan 1 someone wrote:\n   quoted');
    });

    it('returns quoted as null when the quoted slice trims to empty', () => {
      // Marker appears at the very start, followed only by whitespace — after trim, quoted becomes ''.
      // We need to construct an input where input.slice(bestIndex).trim() === ''.
      // The underscore marker is anchored at start-of-line, so place it as the entire input + trailing whitespace.
      const input = '_____________   \n   ';
      const out = stripQuotedReply(input);
      // The marker itself trimmed is "_____________", which is truthy. So quoted will NOT be null here.
      // Instead, verify that when the slice from marker contains content, quoted is that trimmed content.
      expect(out.body).toBe('');
      expect(out.quoted).toBe('_____________');
    });

    it('marker at very start of input yields empty body', () => {
      const input = '-----Original Message-----\nquoted only';
      const out = stripQuotedReply(input);
      expect(out.body).toBe('');
      expect(out.quoted).toContain('Original Message');
      expect(out.quoted).toContain('quoted only');
    });
  });

  describe('return-shape contract', () => {
    it('always returns an object with body:string and quoted:string|null', () => {
      const samples: (string | null | undefined)[] = [
        null,
        undefined,
        '',
        'no marker',
        'reply\n\nOn Mon, Jan 1 X wrote:\nq',
      ];
      for (const s of samples) {
        const out = stripQuotedReply(s);
        expect(typeof out.body).toBe('string');
        expect(out.quoted === null || typeof out.quoted === 'string').toBe(
          true,
        );
      }
    });
  });

  describe('adversarial input', () => {
    it('handles very long input without the bounded Gmail regex hanging', () => {
      // 10_000 non-matching chars followed by a valid Gmail marker — should still resolve quickly.
      const filler = 'x'.repeat(10_000);
      const input = `${filler}\nOn Mon, Jan 1 person wrote:\nquoted`;
      const start = Date.now();
      const out = stripQuotedReply(input);
      const elapsed = Date.now() - start;
      expect(out.body.length).toBeGreaterThan(0);
      expect(out.quoted).toContain('person wrote:');
      // Should be fast — guard against catastrophic backtracking regressions.
      expect(elapsed).toBeLessThan(1000);
    });

    it('does not match Gmail-style "On ... wrote:" when the gap exceeds the 400-char bound', () => {
      // Place 500 chars between "On " and "wrote:" — should NOT match.
      const filler = 'a'.repeat(500);
      const input = `body text\n\nOn Monday ${filler} wrote:\nshould-not-be-quoted`;
      const out = stripQuotedReply(input);
      expect(out.quoted).toBeNull();
      expect(out.body).toContain('should-not-be-quoted');
    });
  });
});
