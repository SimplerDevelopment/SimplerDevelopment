// Designer agent — third stage of the magamommy autonomous-shop pipeline.
//
//   researcher → concept-writer → DESIGNER → publisher
//
// Takes a magamommy_concepts row (slogan + visualPrompt + palette) and
// renders the print-ready artwork via OpenAI gpt-image-1, composites it
// onto the seeded "Heavyweight Tee" base mockup for fulfillment/debugging,
// generates a photoreal lifestyle product shot of the shirt being worn,
// uploads all assets to S3, then persists a `designs` row (isTemplate=true)
// so the publisher can spin up product variants from it.
//
// Hand-off contract is `DesignerResult` in ../types.ts. Errors throw with
// a `[designer]` prefix so the orchestrator (magamommy_drops) can stash
// the message in `error` + `errorStage='designing'`.

import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { and, asc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  clientWebsites,
  designs,
  magamommyConcepts,
  productDesignSurfaces,
} from '@/lib/db/schema';
import { resolveClientApiKey } from '@/lib/ai/resolve-client-key';
import { uploadToS3 } from '@/lib/s3/upload';

import { compositeArtworkOnShirt } from '../composite';
import type { DesignerResult } from '../types';

export interface DesignerInput {
  websiteId: number;
  clientId: number;
  /** magamommy_concepts PK. */
  conceptId: number;
  /** The base "Heavyweight Tee" product seeded by bootstrap. */
  templateProductId: number;
}

interface OpenAIImageResponse {
  data?: Array<{ b64_json?: string; url?: string }>;
  error?: { message?: string };
}

interface GenerateImageArgs {
  openaiKey: string;
  prompt: string;
  size: '1024x1024' | '1024x1536' | '1536x1024';
  transparent?: boolean;
}

/**
 * The fixed style preamble appended to every designer prompt. Keeps the
 * gpt-image-1 output print-ready and on-brand without the concept-writer
 * having to redundantly specify it on every Concept.
 */
function buildDesignerPrompt(concept: {
  visualPrompt: string;
  palette: Array<{ name: string; hex: string }>;
  slogan: string;
}): string {
  const paletteHex = concept.palette.map((c) => c.hex).join(', ');
  return [
    concept.visualPrompt,
    '',
    'STRICT REQUIREMENTS:',
    '- Centered composition on transparent background',
    `- Bold, high-contrast colors from this palette: ${paletteHex}`,
    '- No people, no faces, no real-world brands or logos',
    '- Print-ready: solid shapes, no gradients thinner than 8px, no fine detail under 4px',
    `- The slogan "${concept.slogan}" must be the most prominent text, in bold sans-serif (Oswald, Anton, or Bebas Neue style)`,
    '- Square 1024x1024 aspect ratio',
  ].join('\n');
}

/**
 * Prompt for the customer-facing image. This is intentionally not a flat-lay:
 * the storefront should look like a real apparel brand, with the garment worn
 * on the body and enough fabric / scene context for buyers to judge fit.
 *
 * Two modes via `garmentType`:
 *   'tee'    — adult woman model in the heavyweight crew-neck t-shirt (default).
 *   'onesie' — baby (6–18 months) in a snap-closure baby onesie, photographed
 *              in a soft, sleepy nursery scene. Photographed safely: no faces
 *              in close-up, no real-named kids.
 */
export function buildLifestyleMockupPrompt(concept: {
  visualPrompt: string;
  palette: Array<{ name: string; hex: string }>;
  slogan: string;
  tagline: string;
  placement: string;
  garmentType?: 'tee' | 'onesie';
}): string {
  const paletteHex = concept.palette.map((c) => c.hex).join(', ');
  const garmentType = concept.garmentType ?? 'tee';

  if (garmentType === 'onesie') {
    const printSide =
      concept.placement === 'back'
        ? 'show the back of the onesie clearly'
        : 'show the front of the onesie clearly';
    return [
      'Photorealistic ecommerce lifestyle product photography for a baby-apparel storefront.',
      'A baby (around 9–12 months old) wearing a clean white short-sleeve cotton baby onesie with a snap closure at the bottom, in a soft pastel nursery scene with natural daylight. The baby is photographed safely — sitting up on a soft white blanket, three-quarter angle, body fills the frame.',
      'Photo composition: waist-up framing, the onesie occupies the center of the frame, sleepy gentle mood. The baby may be looking down, looking at a toy, or with eyes partially closed — avoid sharp, direct face close-ups.',
      printSide + '.',
      `The onesie print must feature the exact slogan "${concept.slogan}" as the dominant readable text on the front.`,
      `The printed graphic should follow this concept: ${concept.visualPrompt}`,
      `Use these print colors where possible: ${paletteHex}.`,
      `Brand mood: ${concept.tagline}`,
      '',
      'STRICT REQUIREMENTS:',
      '- The baby must be a fictional person, not based on any real named child.',
      '- The onesie must be worn by the baby, not flat-lay, not on a mannequin.',
      '- The print must appear naturally integrated on the cotton fabric with realistic folds, lighting, and perspective.',
      '- No real-world brands, logos, campaign marks, flags as brand logos, watermarks, captions, price tags, or extra text in the photo.',
      '- Soft, sleepy, comforting nursery palette in the background (cream, soft pink, dusty blue) so the slogan + print read cleanly.',
      '- No weapons, no political imagery in the scene itself — the only political reference is the slogan printed on the garment.',
      '- Clean product photo, enough negative space for a storefront crop.',
    ].join('\n');
  }

  const printSide =
    concept.placement === 'back'
      ? 'show the model turned slightly so the back print is clearly visible'
      : 'show the front of the shirt clearly';

  return [
    'Photorealistic ecommerce lifestyle product photography for an apparel storefront.',
    'An adult WOMAN model — the target Magamommy customer — wearing a clean white heavyweight crew-neck t-shirt in a bright neutral studio with soft natural shadows.',
    'Styling: relaxed, confident, classic Americana — natural hair (any color), light/minimal makeup, warm friendly approachable expression. Age range 26–38, young suburban mom energy but stylish — think "millennial mom at a Memorial Day cookout" (school-age kids at home, not college-age). Should still read as a real adult, not a teenager.',
    printSide + '.',
    `The shirt print must feature the exact slogan "${concept.slogan}" as the dominant readable text.`,
    `The printed graphic should follow this concept: ${concept.visualPrompt}`,
    `Use these print colors where possible: ${paletteHex}.`,
    `Brand mood: ${concept.tagline}`,
    '',
    'STRICT REQUIREMENTS:',
    '- The model must be an adult WOMAN; no men, no children.',
    '- The model must be a fictional person, not a celebrity, public figure, politician, or real named person.',
    '- The shirt must be worn by the model, not floating, not flat-lay, not on a mannequin.',
    '- The print must appear naturally integrated on the cotton fabric with realistic folds, lighting, and perspective.',
    '- No real-world brands, logos, campaign marks, flags as brand logos, watermarks, captions, price tags, or extra text.',
    '- Clean product photo, waist-up framing, enough negative space for a storefront crop.',
  ].join('\n');
}

export async function generateOpenAIImage(args: GenerateImageArgs): Promise<Buffer> {
  const body: Record<string, unknown> = {
    model: 'gpt-image-1',
    prompt: args.prompt,
    n: 1,
    size: args.size,
    output_format: 'png',
    quality: 'high',
  };
  if (args.transparent) {
    body.background = 'transparent';
  }

  const openaiRes = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!openaiRes.ok) {
    const errText = await openaiRes.text();
    let errMessage = `OpenAI returned ${openaiRes.status}`;
    try {
      const parsed = JSON.parse(errText) as OpenAIImageResponse;
      if (parsed.error?.message) errMessage = parsed.error.message;
    } catch {
      // body wasn't JSON
    }
    throw new Error(errMessage);
  }

  const json = (await openaiRes.json()) as OpenAIImageResponse;
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error('OpenAI returned no b64_json image data');
  }
  return Buffer.from(b64, 'base64');
}

/**
 * Load a mockup image regardless of whether `mockupImage` is a relative
 * /assets path served from `public/` or a fully-qualified S3/proxy URL.
 * Falls back to a `fetch` if the local read fails so a mis-seeded URL
 * still works as long as it's reachable.
 */
async function loadMockupBuffer(mockupImage: string): Promise<Buffer> {
  // Repo-root absolute paths only — keep traversal out.
  if (mockupImage.startsWith('/assets/')) {
    const repoRoot = process.cwd();
    const publicPath = path.join(repoRoot, 'public', mockupImage.replace(/^\/+/, ''));
    try {
      return await fs.readFile(publicPath);
    } catch (err) {
      console.warn(
        `[designer] local mockup read failed at ${publicPath}; falling back to fetch:`,
        err instanceof Error ? err.message : err,
      );
      // Fall through to fetch on a relative URL — usually means the asset
      // hasn't been baked into public/ yet but is being served from the dev
      // server. We can't fetch a relative URL without a base, so derive one.
      const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const res = await fetch(new URL(mockupImage, base).toString());
      if (!res.ok) {
        throw new Error(
          `[designer] failed to fetch base mockup at ${mockupImage}: ${res.status} ${res.statusText}`,
        );
      }
      return Buffer.from(await res.arrayBuffer());
    }
  }

  // Absolute URL — straight fetch.
  const res = await fetch(mockupImage);
  if (!res.ok) {
    throw new Error(
      `[designer] failed to fetch base mockup at ${mockupImage}: ${res.status} ${res.statusText}`,
    );
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Generate the slogan/visual artwork via gpt-image-1, composite it onto the
 * blank-tee mockup, upload both, and insert a templated `designs` row.
 *
 * Returns the persisted design id plus public URLs the publisher needs to
 * wire onto products + product_images.
 */
export async function runDesigner(input: DesignerInput): Promise<DesignerResult> {
  const { websiteId, clientId, conceptId, templateProductId } = input;
  console.log(
    `[designer] starting concept=${conceptId} website=${websiteId} client=${clientId} template=${templateProductId}`,
  );

  // 1) Load the concept (scoped to this website to prevent cross-tenant leaks).
  const [concept] = await db
    .select()
    .from(magamommyConcepts)
    .where(
      and(
        eq(magamommyConcepts.id, conceptId),
        eq(magamommyConcepts.websiteId, websiteId),
      ),
    )
    .limit(1);
  if (!concept) {
    throw new Error(
      `[designer] concept ${conceptId} not found for website ${websiteId}`,
    );
  }

  // Defense-in-depth: also confirm the website belongs to the asserted client
  // so the BYOK key resolution can't accidentally bill the wrong tenant.
  const [siteRow] = await db
    .select({ clientId: clientWebsites.clientId })
    .from(clientWebsites)
    .where(eq(clientWebsites.id, websiteId))
    .limit(1);
  if (!siteRow) {
    throw new Error(`[designer] website ${websiteId} not found`);
  }
  if (siteRow.clientId !== clientId) {
    throw new Error(
      `[designer] clientId mismatch: input=${clientId} actual=${siteRow.clientId}`,
    );
  }

  // 2) Load the surfaces and pick the one matching the concept's placement.
  const surfaces = await db
    .select()
    .from(productDesignSurfaces)
    .where(eq(productDesignSurfaces.productId, templateProductId))
    .orderBy(asc(productDesignSurfaces.displayOrder));
  if (surfaces.length === 0) {
    throw new Error(
      `[designer] no product_design_surfaces for templateProductId=${templateProductId}`,
    );
  }
  const placement: 'front' | 'back' =
    concept.placement === 'back' ? 'back' : 'front';
  const surface =
    surfaces.find((s) => s.slug === placement) || surfaces[0];
  if (!surface) {
    throw new Error(
      `[designer] no surface matching placement=${placement} on templateProductId=${templateProductId}`,
    );
  }
  console.log(
    `[designer] using surface=${surface.slug} canvas=${surface.canvasWidth}x${surface.canvasHeight} printArea=${surface.printAreaX},${surface.printAreaY} ${surface.printAreaWidth}x${surface.printAreaHeight}`,
  );

  // 3) Load the base mockup buffer (local public/ or remote URL).
  let baseMockupPng: Buffer;
  try {
    baseMockupPng = await loadMockupBuffer(surface.mockupImage);
  } catch (err) {
    throw new Error(
      `[designer] could not load base mockup: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 4) Compose the augmented prompt + call gpt-image-1.
  const augmentedPrompt = buildDesignerPrompt({
    visualPrompt: concept.visualPrompt,
    palette: concept.palette,
    slogan: concept.slogan,
  });

  let openaiKey: string;
  try {
    const resolved = await resolveClientApiKey({ clientId, provider: 'openai' });
    openaiKey = resolved.key;
  } catch (err) {
    throw new Error(
      `[designer] OpenAI key resolution failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let artworkPng: Buffer;
  try {
    artworkPng = await generateOpenAIImage({
      openaiKey,
      prompt: augmentedPrompt,
      size: '1024x1024',
      transparent: true,
    });
  } catch (err) {
    throw new Error(
      `[designer] gpt-image-1 generation failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  console.log(
    `[designer] artwork rendered (${artworkPng.length} bytes); compositing onto ${surface.slug} mockup`,
  );

  // 5) Composite.
  let compositePng: Buffer;
  try {
    compositePng = await compositeArtworkOnShirt({
      artworkPng,
      baseMockupPng,
      printArea: {
        x: surface.printAreaX,
        y: surface.printAreaY,
        width: surface.printAreaWidth,
        height: surface.printAreaHeight,
      },
    });
  } catch (err) {
    throw new Error(
      `[designer] composite failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 5b) Generate the customer-facing lifestyle shot with the shirt worn.
  let lifestylePng: Buffer;
  try {
    lifestylePng = await generateOpenAIImage({
      openaiKey,
      prompt: buildLifestyleMockupPrompt({
        visualPrompt: concept.visualPrompt,
        palette: concept.palette,
        slogan: concept.slogan,
        tagline: concept.tagline,
        placement,
      }),
      size: '1024x1536',
    });
  } catch (err) {
    throw new Error(
      `[designer] lifestyle image generation failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  console.log(
    `[designer] lifestyle mockup rendered (${lifestylePng.length} bytes)`,
  );

  // 6) Upload the print artwork, flat composite, and lifestyle shot to S3.
  const ts = Date.now();
  let artworkUrl: string;
  let flatMockupUrl: string;
  let lifestyleUrl: string;
  try {
    const artworkUpload = await uploadToS3(
      artworkPng,
      'artwork.png',
      'image/png',
      { key: `media/magamommy/artwork/${conceptId}-${ts}.png` },
    );
    artworkUrl = artworkUpload.url;
  } catch (err) {
    throw new Error(
      `[designer] S3 upload (artwork) failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  try {
    const mockupUpload = await uploadToS3(
      compositePng,
      `${surface.slug}-mockup.png`,
      'image/png',
      { key: `media/magamommy/mockups/${conceptId}-${surface.slug}-${ts}.png` },
    );
    flatMockupUrl = mockupUpload.url;
  } catch (err) {
    throw new Error(
      `[designer] S3 upload (mockup) failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  try {
    const lifestyleUpload = await uploadToS3(
      lifestylePng,
      `${surface.slug}-lifestyle.png`,
      'image/png',
      { key: `media/magamommy/lifestyle/${conceptId}-${surface.slug}-${ts}.png` },
    );
    lifestyleUrl = lifestyleUpload.url;
  } catch (err) {
    throw new Error(
      `[designer] S3 upload (lifestyle) failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  console.log(
    `[designer] uploaded artwork=${artworkUrl} flatMockup=${flatMockupUrl} lifestyle=${lifestyleUrl}`,
  );

  // 7) Insert the designs row (isTemplate=true — brand-authored, reusable).
  const now = new Date();
  const layerId = randomUUID();
  const layersBySurface: Record<string, unknown[]> = {
    [surface.slug]: [
      {
        id: layerId,
        type: 'image',
        name: 'artwork',
        visible: true,
        locked: false,
        opacity: 1,
        left: surface.printAreaX,
        top: surface.printAreaY,
        width: surface.printAreaWidth,
        height: surface.printAreaHeight,
        scaleX: 1,
        scaleY: 1,
        angle: 0,
        zIndex: 1,
        data: {
          url: artworkUrl,
          originalWidth: 1024,
          originalHeight: 1024,
          fit: 'contain',
          ai: {
            prompt: concept.visualPrompt,
            transparent: true,
          },
          generatedAssets: {
            flatMockupUrl,
            lifestyleUrl,
          },
        },
        createdAt: now,
        updatedAt: now,
      },
    ],
  };

  let inserted: typeof designs.$inferSelect | undefined;
  try {
    const [row] = await db
      .insert(designs)
      .values({
        websiteId,
        productId: templateProductId,
        isTemplate: true,
        status: 'rendered',
        name: concept.slogan,
        thumbnailUrl: lifestyleUrl,
        renderedUrl: lifestyleUrl,
        layersBySurface,
        canvasSize: {
          width: surface.canvasWidth,
          height: surface.canvasHeight,
          dpi: surface.printDpi || 300,
        },
      })
      .returning();
    inserted = row;
  } catch (err) {
    throw new Error(
      `[designer] designs insert failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!inserted) {
    throw new Error('[designer] designs insert returned no row');
  }
  console.log(
    `[designer] persisted design ${inserted.id} for concept ${conceptId}`,
  );

  return {
    designId: inserted.id,
    artworkUrl,
    frontMockupUrl: lifestyleUrl,
    backMockupUrl: placement === 'back' ? lifestyleUrl : undefined,
  };
}
