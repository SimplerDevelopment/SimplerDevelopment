import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/lib/auth';
import { resolveClientSite } from '@/lib/portal-client';
import { getBrandingByWebsiteId, getBrandMessaging } from '@/lib/branding';
import { getStyleSurface } from '@/lib/ai/style-variants/style-surface';
import { pickPhilosophies } from '@/lib/ai/style-variants/philosophies';
import {
  buildStyleVariantsSystemPrompt,
  buildStyleVariantsUserPrompt,
  type BrandStyleContext,
} from '@/lib/ai/style-variants/prompt';
import {
  validateStyleVariantsResponse,
  StyleVariantsValidationError,
} from '@/lib/ai/style-variants/validate';
import type { Block } from '@/types/blocks';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

/**
 * POST /api/portal/cms/websites/[siteId]/blocks/restyle
 *
 * Body:
 *   {
 *     block: Block,                      // the full block being restyled
 *     exploreOutsideBrand?: boolean,     // default false — must respect brand
 *     philosophyIds?: string[]           // optional — caller can fix the 3 ids
 *   }
 *
 * Returns:
 *   { success: true, data: { variants: ValidatedVariant[], philosophies: DesignPhilosophy[] } }
 */
export async function POST(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    const { siteId: siteIdRaw } = await params;
    const siteId = parseInt(siteIdRaw, 10);
    if (!Number.isFinite(siteId)) {
      return NextResponse.json({ success: false, message: 'Invalid siteId' }, { status: 400 });
    }
    const site = await resolveClientSite(parseInt(session.user.id, 10), siteId);
    if (!site) {
      return NextResponse.json({ success: false, message: 'Site not found' }, { status: 404 });
    }

    const body = await req.json();
    const block = body?.block as Block | undefined;
    const exploreOutsideBrand = body?.exploreOutsideBrand === true;
    const explicitIds = Array.isArray(body?.philosophyIds) ? (body.philosophyIds as string[]) : undefined;

    if (!block || typeof block !== 'object' || typeof block.type !== 'string') {
      return NextResponse.json({ success: false, message: 'block is required' }, { status: 400 });
    }

    const surface = getStyleSurface(block.type);
    if (!surface) {
      return NextResponse.json(
        { success: false, message: `Block type "${block.type}" is not supported by the AI Style Picker` },
        { status: 400 },
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ success: false, message: 'AI service not configured' }, { status: 503 });
    }

    // Brand context — visual + messaging
    const branding = await getBrandingByWebsiteId(siteId);
    const messaging = await getBrandMessaging(site.clientId, null);
    const brand: BrandStyleContext = {
      primaryColor: branding.primaryColor,
      accentColor: branding.accentColor,
      backgroundColor: branding.backgroundColor,
      textColor: branding.textColor,
      headingFont: branding.headingFont || undefined,
      bodyFont: branding.bodyFont || undefined,
      borderRadius: branding.borderRadius || undefined,
      messaging: messaging ?? undefined,
    };

    const philosophies = pickPhilosophies(block.type, { explicitIds });

    const system = buildStyleVariantsSystemPrompt();
    const userPrompt = buildStyleVariantsUserPrompt({
      block,
      surface,
      brand,
      philosophies,
      exploreOutsideBrand,
    });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    let parsed: unknown;
    try {
      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { success: false, message: 'Model returned non-JSON', raw: text },
        { status: 502 },
      );
    }

    let validated;
    try {
      validated = validateStyleVariantsResponse(parsed, surface, brand, exploreOutsideBrand);
    } catch (err) {
      if (err instanceof StyleVariantsValidationError) {
        return NextResponse.json(
          { success: false, message: err.message, details: err.details, raw: parsed },
          { status: 502 },
        );
      }
      throw err;
    }

    return NextResponse.json({
      success: true,
      data: {
        variants: validated.variants,
        philosophies,
        diagnostics: validated.diagnostics,
      },
    });
  } catch (err) {
    console.error('[blocks/restyle] failed', err);
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : 'Restyle failed' },
      { status: 500 },
    );
  }
}
