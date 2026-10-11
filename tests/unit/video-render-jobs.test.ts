import { describe, expect, it } from 'vitest';
import { buildRenderJob, renderJobId } from '@/lib/video/render-jobs';
import { buildShortPlan } from '@/lib/video/short-plan';

const plan = buildShortPlan({
  title: 'Cómo vender más',
  blogMarkdown: '## Uno\nTexto.\n## Dos\nTexto.',
  linkedinText: 'Post',
});

describe('render-jobs', () => {
  it('jobId determinista por plan+aspect', () => {
    expect(renderJobId(plan, '16x9')).toBe(renderJobId(plan, '16x9'));
    expect(renderJobId(plan, '16x9')).not.toBe(renderJobId(plan, '4x5'));
    expect(renderJobId(plan, '16x9')).toMatch(/^[0-9a-f]{12}$/);
  });

  it('driver local-script disponible con pasos y artefactos', () => {
    const job = buildRenderJob({ plan });
    expect(job.available).toBe(true);
    expect(job.driver).toBe('local-script');
    expect(job.steps.length).toBeGreaterThanOrEqual(8);
    expect(job.artifacts.linkedinCaption).toContain('Cómo vender más');
    expect(job.artifacts.videoBlock.type).toBe('video');
    expect(job.sceneCount).toBe(plan.scenes.length);
  });

  it('driver server se reporta no disponible en vez de fingir', () => {
    const job = buildRenderJob({ plan, driver: 'server' });
    expect(job.available).toBe(false);
    expect(job.unavailableReason).toMatch(/ffmpeg/);
    expect(job.steps).toEqual([]);
  });
});
