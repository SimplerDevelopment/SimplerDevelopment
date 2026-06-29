/**
 * Brain attachment analyzer — sends an attachment to Claude and returns a
 * 1-paragraph "what is this file" description. Supported types:
 *
 *   - image/* → Claude vision (image input)
 *   - application/pdf → Claude PDF document input
 *   - text/* (plain, markdown, csv, html) and application/json → text input
 *   - everything else → returns null (unsupported in v1)
 *
 * Bytes are pulled from R2 via the email-inbound Worker's signed-URL
 * endpoint, so this module needs no R2 credentials of its own.
 *
 * Uses the provider-agnostic `complete` seam (task: 'analyzeAttachment'),
 * so the model can be swapped via the registry / `AI_MODEL__analyzeAttachment`
 * env without touching this file.
 */

import { createHmac } from 'crypto';
import type { ModelMessage } from 'ai';
import { assertSafeUrl } from '@/lib/ssrf-guard';
import { recordAiUsage } from '@/lib/ai/audit';
import { complete } from '@/lib/ai/llm';

const ATTACHMENT_WORKER_URL = process.env.BRAIN_ATTACHMENT_WORKER_URL
  || 'https://sd-email-inbound.lingering-bush-dcd7.workers.dev';
const INBOUND_SECRET = process.env.INBOUND_EMAIL_SECRET || '';
const SIGNED_URL_TTL_SECONDS = 120;
const MAX_BYTES = 5 * 1024 * 1024; // Claude's per-file input cap is ~5MB

export interface AttachmentLike {
  key: string;
  filename: string;
  contentType: string;
  size: number;
}

export interface AttachmentAnalysis {
  analysis: string;
  /** Approximate input + output token cost; useful for credit accounting. */
  tokensUsed: number;
}

function isImage(t: string): boolean {
  return t.startsWith('image/') && !t.includes('svg'); // SVG is text — handled separately if ever needed
}
function isPdf(t: string): boolean {
  return t === 'application/pdf';
}
function isText(t: string): boolean {
  return t.startsWith('text/') || t === 'application/json' || t === 'application/xml';
}

/** Generate a signed worker URL pointing at /attachment for this R2 key. */
function signedUrl(key: string): string {
  if (!INBOUND_SECRET) throw new Error('INBOUND_EMAIL_SECRET is not set');
  const exp = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS;
  const sig = createHmac('sha256', INBOUND_SECRET).update(`${key}\n${exp}`).digest('hex');
  return `${ATTACHMENT_WORKER_URL}/attachment?key=${encodeURIComponent(key)}&exp=${exp}&sig=${sig}`;
}

async function fetchBytes(url: string): Promise<Buffer> {
  // Defense-in-depth: ATTACHMENT_WORKER_URL is normally a fixed CF Worker URL,
  // but if the env var is misconfigured or someone edits this code to accept a
  // user URL, assertSafeUrl rejects private/loopback/metadata addresses.
  await assertSafeUrl(url);
  const res = await fetch(url, { redirect: 'manual' });
  if (res.status >= 300 && res.status < 400) {
    throw new Error('Refusing to follow redirects on attachment fetch (SSRF guard).');
  }
  if (!res.ok) throw new Error(`Worker returned ${res.status} for attachment fetch`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
}

/**
 * Analyze a single attachment. Returns null for unsupported types so callers
 * can mark the attachment as "skipped" rather than failing.
 *
 * `clientId` selects the BYOK key for that tenant when present; otherwise
 * falls through to the platform key. Audit row is recorded best-effort.
 */
export async function analyzeAttachment(att: AttachmentLike, clientId?: number): Promise<AttachmentAnalysis | null> {
  if (att.size > MAX_BYTES) {
    return { analysis: `[skipped — file is ${(att.size / 1024 / 1024).toFixed(1)} MB, over the 5 MB analyzer limit]`, tokensUsed: 0 };
  }
  if (!isImage(att.contentType) && !isPdf(att.contentType) && !isText(att.contentType)) {
    return null;
  }

  // Fall back to a sentinel clientId (0) when none provided; the seam's
  // resolveClientApiKey will use the platform key for clientId=0.
  const effectiveClientId = typeof clientId === 'number' ? clientId : 0;

  const bytes = await fetchBytes(signedUrl(att.key));

  const systemPrompt = 'You analyze files attached to business meetings. Respond with a single dense paragraph (3–5 sentences max) describing what the file is, what it contains, and why it might be relevant in a business context. Do not include preamble like "this file is" — just describe it directly. Do not use markdown.';

  const userText = `Filename: ${att.filename}\nContent-Type: ${att.contentType}\nSize: ${(att.size / 1024).toFixed(0)} KB`;

  // Build a provider-agnostic ModelMessage using AI SDK's FilePart for
  // binary content (images/PDFs) or a plain text prompt for text files.
  let messages: ModelMessage[] | undefined;
  let prompt: string | undefined;

  if (isText(att.contentType)) {
    // Text-like — decode and inline. Trim aggressively so the prompt isn't
    // dominated by the file body (Claude can summarize long text fine, but
    // we don't want to spend tokens on huge logs/CSVs).
    const text = bytes.toString('utf8').slice(0, 50_000);
    prompt = `${userText}\n\n--- file content ---\n${text}`;
  } else {
    // Image or PDF — send as a file part so the provider can use native
    // vision / document understanding. The AI SDK's @ai-sdk/anthropic adapter
    // converts file parts with image/* mediaType to Anthropic image blocks and
    // application/pdf to document blocks automatically.
    messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          {
            type: 'file',
            mediaType: att.contentType as `image/${string}` | 'application/pdf',
            // AI SDK accepts Uint8Array or base64 string for DataContent
            data: bytes.toString('base64'),
            filename: att.filename,
          },
        ],
      },
    ];
  }

  const result = await complete({
    task: 'analyzeAttachment',
    clientId: effectiveClientId,
    maxTokens: 400,
    system: systemPrompt,
    ...(messages !== undefined ? { messages } : { prompt: prompt ?? '' }),
  });

  const text = result.text.trim();
  const tokensUsed = (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0);

  if (typeof clientId === 'number') {
    void recordAiUsage({ clientId, source: 'platform', tokens: tokensUsed });
  }

  return {
    analysis: text || '[analyzer returned empty response]',
    tokensUsed,
  };
}

/**
 * Analyze every attachment in a meeting's source_metadata.attachments[]. Runs
 * in parallel, swallows individual failures (one bad PDF shouldn't kill the
 * batch). Returns the updated attachments array with `analysis` populated
 * (or the existing analysis if already present and `force` is false).
 */
export async function analyzeMeetingAttachments(
  attachments: (AttachmentLike & { analysis?: string })[],
  opts: { force?: boolean; clientId?: number } = {},
): Promise<{
  attachments: (AttachmentLike & { analysis?: string })[];
  totalTokens: number;
}> {
  const results = await Promise.allSettled(
    attachments.map(async (a) => {
      // Skip if already analyzed — but treat transient failure markers as
      // "not yet analyzed" so a re-run after fixing credits/network retries.
      // Permanent skip markers (oversize, unsupported) stay sticky.
      const isTransientFailure = a.analysis?.startsWith('[analysis failed:');
      const alreadyDone = a.analysis && !isTransientFailure;
      if (alreadyDone && !opts.force) return { att: a, tokens: 0 };
      const out = await analyzeAttachment(a, opts.clientId);
      if (!out) return { att: { ...a, analysis: '[unsupported file type for analysis]' }, tokens: 0 };
      return { att: { ...a, analysis: out.analysis }, tokens: out.tokensUsed };
    }),
  );

  let totalTokens = 0;
  const updated = results.map((r, i) => {
    if (r.status === 'rejected') {
      const err = r.reason instanceof Error ? r.reason.message : String(r.reason);
      return { ...attachments[i], analysis: `[analysis failed: ${err.slice(0, 200)}]` };
    }
    totalTokens += r.value.tokens;
    return r.value.att;
  });

  return { attachments: updated, totalTokens };
}
