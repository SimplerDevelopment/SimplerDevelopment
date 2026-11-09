/**
 * AI Content Engine — Fase 1: blog + social + ads pack (draft-only).
 *
 * Genera en una sola pasada LLM un pack coherente: blog, LinkedIn, variantes
 * de anuncio e image prompt. Nunca publica: el caller persiste como draft
 * (posts.published=false, linkedin_posts.status='draft') para revisión humana.
 *
 * Patrón standalone: MAX_*_CHARS cap → checkAiPlanGate → completeObject
 * (task 'contentGen') → recordAiUsage fire-and-forget.
 */

import { z } from 'zod';
import { completeObject } from './llm';
import { checkAiPlanGate } from './plan-gate';
import { recordAiUsage } from './audit';

export const MAX_BRIEF_CHARS = 4000;
export const MAX_CONTEXT_CHARS = 6000;

export const ContentBriefSchema = z.object({
  topic: z.string().min(3).max(200),
  audience: z.string().max(200).optional(),
  tone: z.string().max(80).optional(),
  language: z.string().max(20).optional(),
  keywords: z.array(z.string().max(50)).max(10).optional(),
  context: z.string().max(MAX_CONTEXT_CHARS).optional(),
});

export type ContentBrief = z.infer<typeof ContentBriefSchema>;

export const ContentPackSchema = z.object({
  title: z.string().min(3).max(150),
  slug: z.string().min(3).max(160),
  excerpt: z.string().max(400),
  seoTitle: z.string().max(120),
  seoDescription: z.string().max(200),
  blogMarkdown: z.string().min(100).max(12000),
  linkedinText: z.string().min(20).max(3000),
  linkInComment: z.string().url().optional(),
  adVariants: z.array(z.object({
    headline: z.string().max(120),
    body: z.string().max(400),
    cta: z.string().max(60),
  })).min(1).max(3),
  imagePrompt: z.string().min(10).max(1000),
});

export type ContentPack = z.infer<typeof ContentPackSchema>;

/** Trunca el brief a presupuesto de tokens con nota explícita. */
export function truncateBrief(brief: ContentBrief): { brief: ContentBrief; truncated: boolean } {
  const topic = brief.topic.slice(0, 200);
  let context = brief.context ?? '';
  let truncated = false;
  if (context.length > MAX_CONTEXT_CHARS) {
    context = context.slice(0, MAX_CONTEXT_CHARS);
    truncated = true;
  }
  return { brief: { ...brief, topic, context: context || undefined }, truncated };
}

/** Slug URL-safe a partir del título. */
export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160) || 'contenido-ia';
}

/** Contenido de posts.content para un draft: JSON de bloques mínimo. */
export function buildPostContent(pack: Pick<ContentPack, 'blogMarkdown'>): string {
  return JSON.stringify([
    { type: 'markdown', text: pack.blogMarkdown },
  ]);
}

function systemPrompt(): string {
  return [
    'Eres el redactor de la plataforma CRM. Generas un pack de contenido coherente.',
    'Responde SOLO con el objeto JSON del schema. Nada de prosa ni fences.',
    'Reglas: blog en markdown (H2, listas, CTA final), LinkedIn ≤280 palabras sin link en el cuerpo,',
    '3 variantes de anuncio con CTA, imagePrompt fotorrealista sin texto.',
  ].join('\n');
}

export interface GenerateContentPackArgs {
  clientId: number;
  brief: ContentBrief;
}

/**
 * Genera el pack vía LLM. Lanza si el plan gate bloquea (hoy siempre allowed).
 * Audita tokens fire-and-forget.
 */
export async function generateContentPack(args: GenerateContentPackArgs): Promise<ContentPack> {
  const parsed = ContentBriefSchema.parse({
    ...args.brief,
    topic: args.brief.topic.slice(0, MAX_BRIEF_CHARS),
  });
  const { brief, truncated } = truncateBrief(parsed);

  const gate = await checkAiPlanGate({ clientId: args.clientId, provider: 'anthropic' });
  if (!gate.allowed) {
    throw new Error(gate.message ?? 'AI plan gate blocked content generation');
  }

  const { object, usage } = await completeObject({
    task: 'contentGen',
    clientId: args.clientId,
    system: systemPrompt(),
    prompt: [
      `Tema: ${brief.topic}`,
      brief.audience ? `Audiencia: ${brief.audience}` : null,
      brief.tone ? `Tono: ${brief.tone}` : null,
      brief.language ? `Idioma: ${brief.language}` : 'Idioma: es',
      brief.keywords?.length ? `Keywords: ${brief.keywords.join(', ')}` : null,
      brief.context ? `Contexto negocio:\n${brief.context}` : null,
      truncated ? '(nota: contexto truncado a presupuesto)' : null,
    ].filter(Boolean).join('\n'),
    maxTokens: 4096,
    temperature: 0.7,
    schema: ContentPackSchema,
  });

  // Fire-and-forget: nunca bloquear el critical path por telemetría.
  void recordAiUsage({
    clientId: args.clientId,
    source: 'platform',
    tokens: (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
  });

  return {
    ...object,
    slug: slugifyTitle(object.slug || object.title),
  };
}
