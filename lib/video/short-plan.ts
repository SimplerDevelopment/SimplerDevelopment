/**
 * AI Content Engine — Fase 3: plan de short-video (productivización de sd-create-short).
 *
 * V1 server-side: determinista y sin dependencias nativas. A partir del pack
 * (título + blog + LinkedIn) genera escenas texto-first (funcionan en mute),
 * caption LinkedIn y el `video` block JSON listo para pegar en un post.
 * El render MP4 (Kokoro TTS + GSAP + ffmpeg) sigue corriendo con el skill
 * local; este plan es el contrato que el futuro worker consumirá.
 */

export interface ShortScene {
  /** Orden 0-based. */
  index: number;
  kind: 'hook' | 'point' | 'demo' | 'cta';
  heading: string;
  body: string;
  /** Segundos sugeridos (total objetivo 20-40s). */
  durationSec: number;
}

export interface ShortPlan {
  title: string;
  scenes: ShortScene[];
  totalDurationSec: number;
  /** Caption para LinkedIn (upload manual). */
  linkedinCaption: string;
  /** Block JSON paste-ready para blog posts. */
  videoBlock: { type: 'video'; url: string; caption: string; autoplay: boolean; controls: boolean };
}

export interface BuildShortPlanInput {
  title: string;
  blogMarkdown: string;
  linkedinText?: string;
  /** URL del MP4 una vez renderizado; vacío hasta entonces. */
  videoUrl?: string;
}

const MAX_SCENES = 6;

/** Extrae H2s del markdown como puntos; fallback a frases. */
export function extractPoints(blogMarkdown: string): string[] {
  const headings = blogMarkdown
    .split('\n')
    .filter((l) => l.startsWith('## '))
    .map((l) => l.replace(/^##\s+/, '').trim())
    .filter(Boolean);
  if (headings.length > 0) return headings.slice(0, 4);
  return blogMarkdown
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20)
    .slice(0, 4);
}

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function buildShortPlan(input: BuildShortPlanInput): ShortPlan {
  const title = input.title.slice(0, 150) || 'Nuevo contenido';
  const points = extractPoints(input.blogMarkdown);
  const scenes: ShortScene[] = [];

  scenes.push({
    index: 0,
    kind: 'hook',
    heading: title,
    body: (input.linkedinText ?? '').slice(0, 140) || points[0] || title,
    durationSec: 5,
  });

  points.slice(0, 3).forEach((p, i) => {
    scenes.push({
      index: scenes.length,
      kind: 'point',
      heading: p.slice(0, 80),
      body: p.slice(0, 160),
      durationSec: 7,
    });
    void i;
  });

  scenes.push({
    index: scenes.length,
    kind: 'cta',
    heading: '¿Quieres el detalle?',
    body: 'Link en el primer comentario.',
    durationSec: 4,
  });

  const trimmed = scenes.slice(0, MAX_SCENES);
  trimmed.forEach((s, i) => { s.index = i; });
  const totalDurationSec = trimmed.reduce((acc, s) => acc + s.durationSec, 0);

  const linkedinCaption = [
    title,
    '',
    trimmed.map((s) => `▪ ${s.heading}`).join('\n'),
    '',
    input.linkedinText ? input.linkedinText.slice(0, 300) : '',
    '',
    '#contenido #marketing',
  ].filter(Boolean).join('\n').slice(0, 2800);

  void words;

  return {
    title,
    scenes: trimmed,
    totalDurationSec,
    linkedinCaption,
    videoBlock: {
      type: 'video',
      url: input.videoUrl ?? '',
      caption: title,
      autoplay: false,
      controls: true,
    },
  };
}
