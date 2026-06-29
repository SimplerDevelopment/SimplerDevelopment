import { describe, it, expect } from 'vitest';
import { escapeHtml } from '@/lib/utils/html';

describe('escapeHtml', () => {
  it('escapes & < > " and \' characters', () => {
    expect(escapeHtml('& < > " \'')).toBe('&amp; &lt; &gt; &quot; &#39;');
  });

  it('escapes ampersand first (no double-encoding)', () => {
    // If & were not escaped first, &lt; would become &amp;lt; on a second pass.
    // Confirm a raw & followed by lt; is encoded correctly.
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('escapes a realistic HTML attribute value', () => {
    expect(escapeHtml('<a href="x">&\'')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });

  it('returns empty string unchanged', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('leaves plain text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});
