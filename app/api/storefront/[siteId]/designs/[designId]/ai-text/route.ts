import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  clientWebsites,
  designs,
  storeSettings,
} from '@/lib/db/schema';
import { recordAiUsage } from '@/lib/ai/audit';
import { checkAiPlanGate } from '@/lib/ai/plan-gate';
import { resolveClientApiKey } from '@/lib/ai/resolve-client-key';
import { extractToken, validateSession } from '@/lib/storefront/customer-auth';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const MAX_PROMPT_LEN = 600;
const MAX_PRODUCT_LEN = 200;
const MAX_SUGGESTIONS = 6;
const MIN_SUGGESTIONS = 1;

async function verifyStore(websiteId: number) {
  const [store] = await db
    .select()
    .from(storeSettings)
    .where(
      and(
        eq(storeSettings.websiteId, websiteId),
        eq(storeSettings.enabled, true),
      ),
    )
    .limit(1);
  return store;
}

async function resolveDesign(
  req: Request,
  websiteId: number,
  designId: string,
  callerSessionId: string | null,
): Promise<
  | { kind: 'ok'; design: typeof designs.$inferSelect }
  | { kind: 'error'; status: number; message: string }
> {
  if (!/^[0-9a-fA-F-]{36}$/.test(designId)) {
    return { kind: 'error', status: 400, message: 'Invalid design ID' };
  }

  const [design] = await db
    .select()
    .from(designs)
    .where(and(eq(designs.id, designId), eq(designs.websiteId, websiteId)))
    .limit(1);
  if (!design) {
    return { kind: 'error', status: 404, message: 'Design not found' };
  }

  const token = extractToken(req);
  if (token) {
    const customerSession = await validateSession(token);
    if (
      customerSession &&
      customerSession.websiteId === websiteId &&
      design.customerId === customerSession.customerId
    ) {
      return { kind: 'ok', design };
    }
  }
  if (callerSessionId && design.sessionId && design.sessionId === callerSessionId) {
    return { kind: 'ok', design };
  }
  return { kind: 'error', status: 403, message: 'Forbidden' };
}

/**
 * Generate apparel-friendly tagline / slogan / headline suggestions for a
 * customer-supplied prompt or current text. Returns up to N candidates so
 * the Properties panel can render a clickable chip list and the customer
 * can pick one.
 *
 * Why Anthropic + not OpenAI: text generation here is much cheaper than
 * image generation, the prompt is short, and we already have BYOK + plan-
 * gate plumbing for Anthropic (every portal Brain / branding route uses
 * it). The model is asked to return strict JSON so we don't have to do
 * heuristic parsing.
 */
const SYSTEM_PROMPT = `You write short apparel headlines / slogans / taglines for screen-printed t-shirts and similar merchandise. Output rules:

- Keep each suggestion under 60 characters so it reads at a glance.
- Avoid generic motivational filler ("Just do it", "Live laugh love").
- Avoid copyrighted phrases, brand names, or song lyrics.
- Avoid emoji unless the user explicitly asks for one.
- Each suggestion should be visually distinct — don't return four near-duplicates.
- Match the requested vibe (funny, serious, retro, etc.) when one is stated.

Respond with VALID JSON only — no markdown, no code fences, no commentary.
Shape: { "suggestions": ["...", "...", ...] }`;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ siteId: string; designId: string }> },
) {
  try {
    const { siteId, designId } = await params;
    const websiteId = parseInt(siteId, 10);
    if (isNaN(websiteId)) {
      return NextResponse.json(
        { success: false, message: 'Invalid site ID' },
        { status: 400 },
      );
    }
    const store = await verifyStore(websiteId);
    if (!store) {
      return NextResponse.json(
        { success: false, message: 'Store not found' },
        { status: 404 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      prompt?: unknown;
      currentText?: unknown;
      productName?: unknown;
      n?: unknown;
      sessionId?: unknown;
    };

    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) {
      return NextResponse.json(
        {
          success: false,
          message: 'Tell us what kind of text you want (e.g. "punny dog dad")',
        },
        { status: 400 },
      );
    }
    if (prompt.length > MAX_PROMPT_LEN) {
      return NextResponse.json(
        {
          success: false,
          message: `Prompt must be ${MAX_PROMPT_LEN} characters or fewer`,
        },
        { status: 400 },
      );
    }
    const currentText =
      typeof body.currentText === 'string'
        ? body.currentText.trim().slice(0, MAX_PROMPT_LEN)
        : '';
    const productName =
      typeof body.productName === 'string'
        ? body.productName.trim().slice(0, MAX_PRODUCT_LEN)
        : '';
    const requestedN =
      typeof body.n === 'number' && Number.isFinite(body.n)
        ? Math.floor(body.n)
        : 4;
    const n = Math.max(MIN_SUGGESTIONS, Math.min(MAX_SUGGESTIONS, requestedN));
    const callerSessionId =
      typeof body.sessionId === 'string' ? body.sessionId : null;

    const resolved = await resolveDesign(req, websiteId, designId, callerSessionId);
    if (resolved.kind === 'error') {
      return NextResponse.json(
        { success: false, message: resolved.message },
        { status: resolved.status },
      );
    }

    const [siteRow] = await db
      .select({ clientId: clientWebsites.clientId })
      .from(clientWebsites)
      .where(eq(clientWebsites.id, websiteId))
      .limit(1);
    if (!siteRow) {
      return NextResponse.json(
        { success: false, message: 'Site owner not found' },
        { status: 500 },
      );
    }
    const merchantClientId = siteRow.clientId;

    const gate = await checkAiPlanGate({
      clientId: merchantClientId,
      provider: 'anthropic',
    });
    if (!gate.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: gate.message,
          reason: gate.reason,
        },
        { status: 402 },
      );
    }

    let apiKey: string;
    let keySource: 'byok' | 'platform';
    try {
      const resolvedKey = await resolveClientApiKey({
        clientId: merchantClientId,
        provider: 'anthropic',
      });
      apiKey = resolvedKey.key;
      keySource = resolvedKey.source as 'byok' | 'platform';
    } catch (err) {
      return NextResponse.json(
        {
          success: false,
          message:
            err instanceof Error
              ? err.message
              : 'AI text suggestions are not configured — no Anthropic key available.',
        },
        { status: 503 },
      );
    }

    const anthropic = new Anthropic({ apiKey });

    const userMessage = [
      productName ? `Product: ${productName}.` : '',
      currentText ? `Current text on the design: "${currentText}".` : '',
      `Customer wants ${n} suggestions for: ${prompt}.`,
      `Return exactly ${n} suggestions in the JSON shape above.`,
    ]
      .filter(Boolean)
      .join(' ');

    let response;
    try {
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      });
    } catch (err) {
      // Surface clean error to the modal; quietly log the rest.
      // eslint-disable-next-line no-console
      console.error('Anthropic AI text error:', err);
      return NextResponse.json(
        {
          success: false,
          message:
            err instanceof Error ? err.message : 'AI suggestion call failed',
        },
        { status: 502 },
      );
    }

    const text = (response.content || [])
      .map((block) => {
        const b = block as { type?: string; text?: string };
        return b.type === 'text' && typeof b.text === 'string' ? b.text : '';
      })
      .join('')
      .trim();

    let suggestions: string[] = [];
    try {
      const parsed = JSON.parse(text) as { suggestions?: unknown };
      if (Array.isArray(parsed.suggestions)) {
        suggestions = parsed.suggestions
          .filter((s): s is string => typeof s === 'string')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
          .slice(0, n);
      }
    } catch {
      // Fallback — model returned non-JSON. Split by newline and trim.
      suggestions = text
        .split('\n')
        .map((s) => s.replace(/^[\s\-•*\d.]+/, '').trim())
        .filter((s) => s.length > 0 && s.length < 200)
        .slice(0, n);
    }

    if (suggestions.length === 0) {
      return NextResponse.json(
        { success: false, message: 'AI model returned no suggestions' },
        { status: 502 },
      );
    }

    // Best-effort token metering — uses the existing ai_tokens bucket the
    // portal usage page already renders.
    const totalTokens =
      (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
    void recordAiUsage({
      clientId: merchantClientId,
      source: keySource,
      tokens: totalTokens,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          suggestions,
          prompt,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Storefront design AI-text POST error:', err);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 },
    );
  }
}
