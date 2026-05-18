import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';

import { db } from '@/lib/db';
import {
  clientWebsites,
  designs,
  designAssets,
  storeSettings,
} from '@/lib/db/schema';
import { recordAiImageUsage } from '@/lib/ai/audit';
import { checkAiPlanGate } from '@/lib/ai/plan-gate';
import { resolveClientApiKey } from '@/lib/ai/resolve-client-key';
import { uploadToS3 } from '@/lib/s3/upload';
import { extractToken, validateSession } from '@/lib/storefront/customer-auth';
import {
  buildAiImagePrompt,
  type AiImageStyle,
} from '@/lib/designer/aiPromptBuilder';

// Image generation is slow — OpenAI's gpt-image-1 high-quality calls
// regularly land between 15–35s. Bump the route timeout so Vercel /
// Railway don't kill the request before the model finishes.
export const maxDuration = 60;
// Designer routes must never cache.
export const dynamic = 'force-dynamic';

const ALLOWED_STYLES: ReadonlySet<AiImageStyle> = new Set([
  'illustration',
  'photo',
  'graphic',
  'auto',
]);

const ALLOWED_SIZES: ReadonlySet<string> = new Set([
  '1024x1024',
  '1024x1536',
  '1536x1024',
  'auto',
]);

const ALLOWED_QUALITY: ReadonlySet<string> = new Set([
  'low',
  'medium',
  'high',
  'auto',
]);

const MAX_PROMPT_LEN = 1000;

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

interface OpenAIImageResponse {
  data?: Array<{ b64_json?: string; url?: string }>;
  error?: { message?: string };
}

/**
 * Generate a print-ready AI image and stash it as a `design_assets` row so
 * the canvas can drop it in as an image layer using the same image-layer
 * code path as a customer upload. Lives under the design so cleanup
 * cascades when the design is deleted.
 *
 * Uses OpenAI's `gpt-image-1` model with `background: 'transparent'` and
 * `output_format: 'png'` — gives us a cleanly-cutout PNG that prints well
 * on any shirt colour without needing to invoke a separate background
 * removal pass (which is what other DIY-print tools end up doing with
 * remove.bg / rembg).
 */
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
      sessionId?: unknown;
      style?: unknown;
      transparent?: unknown;
      size?: unknown;
      quality?: unknown;
    };

    const prompt =
      typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) {
      return NextResponse.json(
        { success: false, message: 'Prompt is required' },
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

    const style = (
      typeof body.style === 'string' && ALLOWED_STYLES.has(body.style as AiImageStyle)
        ? body.style
        : 'illustration'
    ) as AiImageStyle;

    const transparent =
      typeof body.transparent === 'boolean' ? body.transparent : true;

    const size = (
      typeof body.size === 'string' && ALLOWED_SIZES.has(body.size)
        ? body.size
        : '1024x1024'
    ) as string;

    const quality = (
      typeof body.quality === 'string' && ALLOWED_QUALITY.has(body.quality)
        ? body.quality
        : 'high'
    ) as string;

    const callerSessionId =
      typeof body.sessionId === 'string' ? body.sessionId : null;

    const resolved = await resolveDesign(req, websiteId, designId, callerSessionId);
    if (resolved.kind === 'error') {
      return NextResponse.json(
        { success: false, message: resolved.message },
        { status: resolved.status },
      );
    }

    // Storefront customers aren't authenticated as portal users — the AI
    // call is billed against the *merchant* who owns the website. Look up
    // that clientId via client_websites so we can apply the same plan
    // gate + BYOK resolution used by every portal AI route.
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
      provider: 'openai',
    });
    if (!gate.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: gate.message,
          reason: gate.reason,
        },
        // 402 = Payment Required matches the rest of the AI surface so the
        // client can show "upgrade or add a BYOK key" copy uniformly.
        { status: 402 },
      );
    }

    let openaiKey: string;
    let keySource: 'byok' | 'platform';
    try {
      const resolvedKey = await resolveClientApiKey({
        clientId: merchantClientId,
        provider: 'openai',
      });
      openaiKey = resolvedKey.key;
      keySource = resolvedKey.source as 'byok' | 'platform';
    } catch (err) {
      // resolveClientApiKey throws when neither BYOK nor platform env is set.
      // Surface as 503 so the client distinguishes from a quota / billing
      // problem (402).
      return NextResponse.json(
        {
          success: false,
          message:
            err instanceof Error
              ? err.message
              : 'AI image generation is not configured — no OpenAI key available.',
        },
        { status: 503 },
      );
    }

    const augmentedPrompt = buildAiImagePrompt({
      prompt,
      style,
      transparent,
    });

    // gpt-image-1 returns base64 (no URL) and supports `background:'transparent'`
    // for clean cutouts — perfect for print on garments where the background
    // shirt colour comes from the mockup.
    const openaiRes = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: augmentedPrompt,
        n: 1,
        size,
        quality,
        // `background:'transparent'` is only honoured when output_format
        // supports alpha — must be png or webp, never jpeg.
        background: transparent ? 'transparent' : 'opaque',
        output_format: 'png',
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      let errMessage = `OpenAI image generation failed (${openaiRes.status})`;
      try {
        const parsed = JSON.parse(errText) as OpenAIImageResponse;
        if (parsed.error?.message) errMessage = parsed.error.message;
      } catch {
        // body wasn't JSON, fall through to the generic message
      }
      // 4xx from OpenAI is most often a moderation or billing issue — pass
      // through so the customer can see what to fix. 5xx is opaque.
      const status = openaiRes.status >= 400 && openaiRes.status < 500 ? 400 : 502;
      return NextResponse.json(
        { success: false, message: errMessage },
        { status },
      );
    }

    const openaiJson = (await openaiRes.json()) as OpenAIImageResponse;
    const b64 = openaiJson.data?.[0]?.b64_json;
    if (!b64) {
      return NextResponse.json(
        { success: false, message: 'AI model returned no image' },
        { status: 502 },
      );
    }

    const buffer = Buffer.from(b64, 'base64');

    // sharp metadata gives us width/height for the layer scaling logic. The
    // upload still succeeds without it; metadata is best-effort.
    let width: number | null = null;
    let height: number | null = null;
    try {
      const meta = await sharp(buffer).metadata();
      width = meta.width || null;
      height = meta.height || null;
    } catch {
      // ignore — non-fatal
    }

    const key = `media/designs/${resolved.design.id}/ai/${crypto.randomUUID()}.png`;
    const uploadResult = await uploadToS3(buffer, 'ai-image.png', 'image/png', {
      key,
    });

    const filename =
      `${style}-${prompt.slice(0, 40).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '')}.png`.toLowerCase();

    const [asset] = await db
      .insert(designAssets)
      .values({
        designId: resolved.design.id,
        url: uploadResult.url,
        storedFilename: uploadResult.storedFilename,
        originalFilename: filename,
        mimeType: 'image/png',
        width,
        height,
        fileSize: uploadResult.fileSize,
      })
      .returning();

    // Best-effort metering: append a usage_meter_events row keyed by the
    // merchant's clientId. We don't await this — it's telemetry and must
    // never block the response.
    void recordAiImageUsage({
      clientId: merchantClientId,
      source: keySource,
      images: 1,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: asset.id,
          url: asset.url,
          width: asset.width,
          height: asset.height,
          mimeType: asset.mimeType,
          fileSize: asset.fileSize,
          prompt,
          augmentedPrompt,
          style,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Storefront design AI-image POST error:', err);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 },
    );
  }
}
