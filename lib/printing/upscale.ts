// Real-ESRGAN-via-Replicate wrapper. The autonomous designer agent produces
// transparent 1024x1024 PNGs (the max gpt-image-1 square resolution); print-on-
// demand vendors like Printify / Printful require 300 DPI on the actual print
// area — for a 10" chest print that's 3000x3000 px. A 4x upscale (1024 → 4096)
// gets us comfortably above that threshold.
//
// We use the `nightmareai/real-esrgan` model on Replicate. It preserves alpha
// (so transparent artwork stays transparent through the upscale) and handles
// flat folk-art / poster-style fills cleanly — which is exactly what our
// magamommy artwork is.
//
// Replicate auth: REPLICATE_API_TOKEN in env. Get one at
// https://replicate.com/account/api-tokens — there's a generous free tier
// and Real-ESRGAN runs at roughly $0.0007 per 1024-input upscale (~$0.01 per
// magamommy product, all 13 = ~$0.13).

const REPLICATE_API = 'https://api.replicate.com/v1';

// Pinned to a specific revision so behavior is deterministic. To update,
// look up the latest version at https://replicate.com/nightmareai/real-esrgan
// — copying any version string here is safe (the API treats it as immutable).
const REAL_ESRGAN_VERSION = 'f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa';

export interface UpscaleOpts {
  /** 2, 4, or 8. Default 4 (the sweet spot for our 1024 → ~4k workflow). */
  scale?: 2 | 4 | 8;
  /** When true, also runs GFPGAN on faces. Default false — our artwork has no faces. */
  faceEnhance?: boolean;
  /** Poll interval in ms for the prediction status. Default 2_000. */
  pollIntervalMs?: number;
  /** Maximum poll attempts before giving up. Default 60 (~2 min total). */
  maxPollAttempts?: number;
}

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[] | null;
  error?: string | null;
  urls?: { get?: string; cancel?: string };
}

/**
 * Upscale a transparent PNG buffer via Real-ESRGAN. Returns the upscaled
 * PNG as a Buffer. Throws with a `[upscale]` prefix on any failure mode
 * (missing token, Replicate error, timeout, bad output URL, fetch error).
 */
export async function upscaleArtwork(input: Buffer, opts: UpscaleOpts = {}): Promise<Buffer> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    throw new Error(
      '[upscale] REPLICATE_API_TOKEN is not set. Get one at https://replicate.com/account/api-tokens.',
    );
  }

  const scale = opts.scale ?? 4;
  const faceEnhance = opts.faceEnhance ?? false;
  const pollIntervalMs = opts.pollIntervalMs ?? 2_000;
  const maxPollAttempts = opts.maxPollAttempts ?? 60;

  // Replicate wants a public URL or a data: URI. Our S3 URLs are proxied
  // through /api/media/proxy/* which isn't internet-accessible from
  // Replicate's servers — so we send the image as a base64 data URI.
  // Works fine for our ~2 MB PNGs.
  const dataUri = `data:image/png;base64,${input.toString('base64')}`;

  // 1. Create the prediction.
  const createRes = await fetch(`${REPLICATE_API}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: REAL_ESRGAN_VERSION,
      input: {
        image: dataUri,
        scale,
        face_enhance: faceEnhance,
      },
    }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`[upscale] Replicate create returned ${createRes.status}: ${text.slice(0, 500)}`);
  }
  let prediction = (await createRes.json()) as ReplicatePrediction;

  // 2. Poll for completion. Real-ESRGAN typically takes 4-12s per 1024-input.
  let attempts = 0;
  while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && prediction.status !== 'canceled') {
    if (attempts >= maxPollAttempts) {
      throw new Error(`[upscale] timed out after ${maxPollAttempts} polls (${prediction.id}, status=${prediction.status})`);
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    attempts += 1;
    const getUrl = prediction.urls?.get ?? `${REPLICATE_API}/predictions/${prediction.id}`;
    const pollRes = await fetch(getUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!pollRes.ok) {
      throw new Error(`[upscale] Replicate poll returned ${pollRes.status} on ${prediction.id}`);
    }
    prediction = (await pollRes.json()) as ReplicatePrediction;
  }

  if (prediction.status !== 'succeeded') {
    throw new Error(`[upscale] prediction ${prediction.id} ended in status=${prediction.status}: ${prediction.error ?? '(no error message)'}`);
  }

  // 3. Output may be a string or string[] depending on the model. Real-ESRGAN
  // returns a single URL string.
  const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (typeof outputUrl !== 'string' || !outputUrl) {
    throw new Error(`[upscale] prediction ${prediction.id} succeeded but produced no output URL`);
  }

  // 4. Download the upscaled PNG. Replicate URLs are public, no auth needed.
  const downloadRes = await fetch(outputUrl);
  if (!downloadRes.ok) {
    throw new Error(`[upscale] failed to download upscaled image: ${downloadRes.status} from ${outputUrl}`);
  }
  const arrayBuf = await downloadRes.arrayBuffer();
  return Buffer.from(arrayBuf);
}
