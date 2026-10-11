/**
 * AI image generation call-site (Content Engine Fase 2).
 *
 * Closes the metering gap: `recordAiImageUsage` finally has a caller.
 * prompt → gpt-image-1 (OpenAI, BYOK-aware) → S3 → `media` row.
 *
 * Pattern (standalone pipeline): MAX cap → checkAiPlanGate →
 * resolveClientApiKey('openai') → fetch → uploadToS3 → insert media →
 * recordAiImageUsage fire-and-forget. Never publishes anything by itself —
 * callers attach the URL as post cover / LinkedIn media (still draft).
 */

import { checkAiPlanGate } from './plan-gate';
import { resolveClientApiKey } from './resolve-client-key';
import { recordAiImageUsage } from './audit';
import { uploadToS3 } from '@/lib/s3/upload';
import { db } from '@/lib/db';
import { media } from '@/lib/db/schema';

export const MAX_IMAGE_PROMPT_CHARS = 1000;

const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
const IMAGE_MODEL = process.env.AI_IMAGE_MODEL ?? 'gpt-image-1';
const IMAGE_SIZE = '1024x1024';
const IMAGE_MIME = 'image/png';

export interface GenerateContentImageArgs {
  clientId: number;
  prompt: string;
  websiteId?: number;
  uploadedBy?: number;
  alt?: string;
}

export interface GeneratedImage {
  url: string;
  mediaId: number;
  mimeType: string;
  fileSize: number;
}

/** Truncate to budget (pure, tested). */
export function normalizeImagePrompt(prompt: string): string {
  return prompt.slice(0, MAX_IMAGE_PROMPT_CHARS);
}

/** Build the OpenAI Images request (pure, tested — key stays in headers). */
export function buildImageRequest(prompt: string, apiKey: string): { url: string; init: RequestInit } {
  return {
    url: `${OPENAI_BASE_URL}/images/generations`,
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: IMAGE_MODEL, prompt, size: IMAGE_SIZE }),
    },
  };
}

/** Extract PNG bytes from an Images API payload (pure, tested). */
export function parseImageResponse(json: unknown): Buffer {
  const b64 = (json as { data?: Array<{ b64_json?: string }> } | null)?.data?.[0]?.b64_json;
  if (typeof b64 !== 'string' || !b64) {
    throw new Error('Image provider returned no image data');
  }
  return Buffer.from(b64, 'base64');
}

export async function generateContentImage(args: GenerateContentImageArgs): Promise<GeneratedImage> {
  const prompt = normalizeImagePrompt(args.prompt);
  if (!prompt.trim()) throw new Error('generateContentImage: prompt is required');

  const gate = await checkAiPlanGate({ clientId: args.clientId, provider: 'openai' });
  if (!gate.allowed) {
    throw new Error(gate.message ?? 'AI plan gate blocked image generation');
  }

  const { key, source } = await resolveClientApiKey({ clientId: args.clientId, provider: 'openai' });
  const { url, init } = buildImageRequest(prompt, key);
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`Image generation failed (${res.status})`);
  }
  const bytes = parseImageResponse(await res.json());
  const uploaded = await uploadToS3(bytes, 'ai-image.png', IMAGE_MIME);

  const [row] = await db
    .insert(media)
    .values({
      filename: 'ai-image.png',
      storedFilename: uploaded.storedFilename,
      mimeType: IMAGE_MIME,
      fileSize: uploaded.fileSize,
      url: uploaded.url,
      alt: args.alt ?? prompt.slice(0, 200),
      clientId: args.clientId,
      websiteId: args.websiteId ?? null,
      uploadedBy: args.uploadedBy ?? null,
    })
    .returning({ id: media.id });

  // Fire-and-forget: never block the critical path on telemetry.
  void recordAiImageUsage({ clientId: args.clientId, source, images: 1 });

  return { url: uploaded.url, mediaId: row.id, mimeType: IMAGE_MIME, fileSize: uploaded.fileSize };
}
