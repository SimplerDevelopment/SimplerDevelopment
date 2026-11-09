import { describe, expect, it } from 'vitest';
import { buildShortPlan, extractPoints } from '@/lib/video/short-plan';

describe('short-plan', () => {
  it('extrae H2s como puntos', () => {
    const points = extractPoints('## Uno\ntexto\n## Dos\ntexto\n## Tres');
    expect(points).toEqual(['Uno', 'Dos', 'Tres']);
  });

  it('construye plan texto-first 20-40s con hook + cta', () => {
    const plan = buildShortPlan({
      title: 'Cómo vender más',
      blogMarkdown: '## Uno\nTexto.\n## Dos\nTexto.\n## Tres\nTexto.',
      linkedinText: 'Post de LinkedIn',
    });
    expect(plan.scenes[0].kind).toBe('hook');
    expect(plan.scenes[plan.scenes.length - 1].kind).toBe('cta');
    expect(plan.totalDurationSec).toBeGreaterThanOrEqual(15);
    expect(plan.totalDurationSec).toBeLessThanOrEqual(45);
    expect(plan.videoBlock.type).toBe('video');
    expect(plan.linkedinCaption).toContain('Cómo vender más');
  });
});
