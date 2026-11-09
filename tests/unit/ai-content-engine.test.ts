import { describe, expect, it } from 'vitest';
import {
  buildPostContent,
  slugifyTitle,
  truncateBrief,
} from '@/lib/ai/content-engine';

describe('content-engine helpers', () => {
  it('slugifyTitle genera slug url-safe', () => {
    expect(slugifyTitle('Cómo vender más en 2026!!')).toBe('como-vender-mas-en-2026');
    expect(slugifyTitle('')).toBe('contenido-ia');
  });

  it('truncateBrief corta contexto largo y marca truncated', () => {
    const long = 'x'.repeat(7000);
    const { brief, truncated } = truncateBrief({ topic: 'Test', context: long });
    expect(truncated).toBe(true);
    expect(brief.context!.length).toBeLessThanOrEqual(6000);
  });

  it('truncateBrief no marca cuando cabe', () => {
    const { truncated } = truncateBrief({ topic: 'Test', context: 'corto' });
    expect(truncated).toBe(false);
  });

  it('buildPostContent envuelve markdown en bloques JSON', () => {
    const content = buildPostContent({ blogMarkdown: '# Hola\nTexto' });
    const blocks = JSON.parse(content);
    expect(blocks).toEqual([{ type: 'markdown', text: '# Hola\nTexto' }]);
  });
});
