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
 */

import Anthropic from '@anthropic-ai/sdk';
import { createHmac } from 'crypto';
import { assertSafeUrl } from '@/lib/ssrf-guard';
import { resolveClientApiKey } from '@/lib/ai/resolve-client-key';
import { recordAiUsage } from '@/lib/ai/audit';

const ATTACHMENT_WORKER_URL = process.env.BRAIN_ATTACHMENT_WORKER_URL
  || 'https://sd-email-inbound.lingering-bush-dcd7.workers.dev';
const INBOUND_SECRET = process.env.INBOUND_EMAIL_SECRET || '';
const SIGNED_URL_TTL_SECONDS = 120;
const MAX_BYTES = 5 * 1024 * 1024; // Claude's per-file input cap is ~5MB

const ANALYZER_MODEL = 'claude-haiku-4-5-20251001';

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

  const bytes = await fetchBytes(signedUrl(att.key));

  const systemPrompt = 'You analyze files attached to business meetings. Respond with a single dense paragraph (3–5 sentences max) describing what the file is, what it contains, and why it might be relevant in a business context. Do not include preamble like "this file is" — just describe it directly. Do not use markdown.';

  const userText = `Filename: ${att.filename}\nContent-Type: ${att.contentType}\nSize: ${(att.size / 1024).toFixed(0)} KB`;

  let content: Anthropic.MessageParam['content'];

  if (isImage(att.contentType)) {
    content = [
      { type: 'text', text: userText },
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: att.contentType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: bytes.toString('base64'),
        },
      },
    ];
  } else if (isPdf(att.contentType)) {
    content = [
      { type: 'text', text: userText },
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: bytes.toString('base64'),
        },
      },
    ];
  } else {
    // Text-like — decode and inline. Trim aggressively so the prompt isn't
    // dominated by the file body (Claude can summarize long text fine, but
    // we don't want to spend tokens on huge logs/CSVs).
    const text = bytes.toString('utf8').slice(0, 50_000);
    content = `${userText}\n\n--- file content ---\n${text}`;
  }

  // Resolve which key to use. If no clientId is provided (legacy callers /
  // system jobs), fall through to the platform key with a synthetic resolver
  // call that lets the audit table still record `source='platform'`.
  let apiKey: string;
  let source: 'byok' | 'platform' = 'platform';
  if (typeof clientId === 'number') {
    const resolved = await resolveClientApiKey({ clientId, provider: 'anthropic' });
    apiKey = resolved.key;
    source = resolved.source;
  } else {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set and no clientId was provided.');
    }
    apiKey = process.env.ANTHROPIC_API_KEY;
  }
  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model: ANALYZER_MODEL,
    max_tokens: 400,
    system: systemPrompt,
    messages: [{ role: 'user', content }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();

  const tokensUsed = (response.usage.input_tokens ?? 0) + (response.usage.output_tokens ?? 0);
  if (typeof clientId === 'number') {
    void recordAiUsage({ clientId, source, tokens: tokensUsed });
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
