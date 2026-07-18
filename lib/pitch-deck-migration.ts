import type { PitchDeckSlide, PitchDeckSlideV2, PitchDeckTheme } from '@/lib/db/schema';
import type { Block } from '@/types/blocks';

let blockCounter = 0;
function uid(): string {
  return `block-${Date.now()}-${++blockCounter}-${Math.random().toString(36).slice(2, 6)}`;
}

const SLIDE_LABELS: Record<PitchDeckSlide['type'], string> = {
  cover: 'Cover',
  problem: 'Problem',
  solution: 'Solution',
  features: 'Features',
  process: 'Process',
  metrics: 'Metrics',
  testimonial: 'Testimonial',
  team: 'Team',
  pricing: 'Pricing',
  cta: 'Call to Action',
  custom: 'Custom',
};

export function convertV1SlideToV2(slide: PitchDeckSlide): PitchDeckSlideV2 {
  const blocks: Block[] = [];
  let order = 0;

  switch (slide.type) {
    case 'cover':
      blocks.push({
        id: uid(), type: 'hero', order: order++,
        title: slide.headline || '',
        subtitle: slide.subheadline,
        description: slide.body,
      });
      break;

    case 'problem':
    case 'solution':
      if (slide.headline) {
        blocks.push({
          id: uid(), type: 'heading', order: order++,
          content: slide.headline, level: 2, alignment: 'center',
        });
      }
      if (slide.body) {
        blocks.push({
          id: uid(), type: 'text', order: order++,
          content: slide.body, alignment: 'center',
        });
      }
      if (slide.bullets?.length) {
        blocks.push({
          id: uid(), type: 'card-grid', order: order++,
          cards: slide.bullets.map((b, i) => ({
            id: uid(), title: b, description: '', icon: slide.type === 'problem' ? 'warning' : 'check_circle',
          })),
          columns: (slide.columns || Math.min(slide.bullets.length, 3)) as 2 | 3 | 4,
        });
      }
      break;

    case 'features':
      if (slide.headline) {
        blocks.push({
          id: uid(), type: 'heading', order: order++,
          content: slide.headline, level: 2, alignment: 'center',
        });
      }
      if (slide.bullets?.length) {
        blocks.push({
          id: uid(), type: 'card-grid', order: order++,
          cards: slide.bullets.map(b => ({
            id: uid(), title: b, description: '', icon: 'star',
          })),
          columns: (slide.columns || Math.min(slide.bullets.length, 3)) as 2 | 3 | 4,
        });
      }
      break;

    case 'process':
      if (slide.headline) {
        blocks.push({
          id: uid(), type: 'heading', order: order++,
          content: slide.headline, level: 2, alignment: 'center',
        });
      }
      if (slide.steps?.length) {
        blocks.push({
          id: uid(), type: 'card-grid', order: order++,
          cards: slide.steps.map((s, i) => ({
            id: uid(), title: `${i + 1}. ${s.title}`, description: s.description,
          })),
          columns: (slide.columns || Math.min(slide.steps.length, 3)) as 2 | 3 | 4,
        });
      }
      break;

    case 'metrics':
      if (slide.headline) {
        blocks.push({
          id: uid(), type: 'heading', order: order++,
          content: slide.headline, level: 2, alignment: 'center',
        });
      }
      if (slide.stats?.length) {
        blocks.push({
          id: uid(), type: 'stats', order: order++,
          stats: slide.stats.map(s => ({ id: uid(), value: s.value, label: s.label })),
          columns: (slide.columns || Math.min(slide.stats.length, 4)) as 2 | 3 | 4,
        });
      }
      break;

    case 'testimonial':
      blocks.push({
        id: uid(), type: 'testimonial', order: order++,
        quote: slide.body || slide.headline || '',
        author: slide.subheadline || 'Unknown',
      });
      break;

    case 'team':
      if (slide.headline) {
        blocks.push({
          id: uid(), type: 'heading', order: order++,
          content: slide.headline, level: 2, alignment: 'center',
        });
      }
      if (slide.members?.length) {
        blocks.push({
          id: uid(), type: 'card-grid', order: order++,
          cards: slide.members.map(m => ({
            id: uid(), title: m.name, description: m.role, image: m.image,
          })),
          columns: (slide.columns || Math.min(slide.members.length, 3)) as 2 | 3 | 4,
        });
      }
      break;

    case 'pricing':
      if (slide.headline) {
        blocks.push({
          id: uid(), type: 'heading', order: order++,
          content: slide.headline, level: 2, alignment: 'center',
        });
      }
      if (slide.tiers?.length) {
        blocks.push({
          id: uid(), type: 'card-grid', order: order++,
          cards: slide.tiers.map(t => ({
            id: uid(),
            title: `${t.name} — ${t.price}`,
            description: t.features.join(' | '),
          })),
          columns: (slide.columns || Math.min(slide.tiers.length, 3)) as 2 | 3 | 4,
        });
      }
      break;

    case 'cta':
      blocks.push({
        id: uid(), type: 'cta', order: order++,
        title: slide.headline || '',
        description: slide.body || slide.subheadline,
        primaryButtonText: 'Get Started',
        primaryButtonUrl: '#',
      });
      break;

    case 'custom':
    default:
      if (slide.headline) {
        blocks.push({
          id: uid(), type: 'heading', order: order++,
          content: slide.headline, level: 2, alignment: 'center',
        });
      }
      if (slide.body) {
        blocks.push({
          id: uid(), type: 'text', order: order++,
          content: slide.body, alignment: 'center',
        });
      }
      if (slide.bullets?.length) {
        blocks.push({
          id: uid(), type: 'card-grid', order: order++,
          cards: slide.bullets.map(b => ({
            id: uid(), title: b, description: '',
          })),
          columns: (slide.columns || Math.min(slide.bullets.length, 3)) as 2 | 3 | 4,
        });
      }
      if (slide.stats?.length) {
        blocks.push({
          id: uid(), type: 'stats', order: order++,
          stats: slide.stats.map(s => ({ id: uid(), value: s.value, label: s.label })),
          columns: (slide.columns || Math.min(slide.stats.length, 4)) as 2 | 3 | 4,
        });
      }
      break;
  }

  return {
    id: slide.id,
    label: SLIDE_LABELS[slide.type] || 'Custom',
    blocks,
    notes: slide.notes,
  };
}

/**
 * Convert an entire v1 deck's slides to v2 format.
 */
export function convertAllSlidesToV2(
  slides: PitchDeckSlide[],
): PitchDeckSlideV2[] {
  blockCounter = 0;
  return slides.map(convertV1SlideToV2);
}

/**
 * Type guard: is this a v2 slide array?
 */
export function isV2Slides(slides: unknown[]): slides is PitchDeckSlideV2[] {
  if (!slides.length) return true;
  return 'blocks' in (slides[0] as Record<string, unknown>);
}
