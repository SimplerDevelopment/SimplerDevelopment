/**
 * LinkedIn REST Posts API client — Phase A.
 *
 * Verified against the official Posts API + Images API docs (Microsoft Learn,
 * li-lms-2026-06):
 *   POST https://api.linkedin.com/rest/posts
 *   headers: Authorization: Bearer, X-Restli-Protocol-Version: 2.0.0,
 *            LinkedIn-Version: <YYYYMM>, Content-Type: application/json
 *   text body: { author, commentary, visibility, distribution, lifecycleState,
 *                isReshareDisabledByAuthor }
 *   → 201, post URN in the `x-restli-id` response header.
 *
 * Media (image / document=carousel): two-step upload BEFORE the post —
 *   1) POST /rest/{images|documents}?action=initializeUpload
 *        body { initializeUploadRequest: { owner: <member URN> } }
 *        → { value: { uploadUrl, image|document: "urn:li:image|document:..." } }
 *   2) PUT the bytes to uploadUrl (Bearer auth)
 *   then reference content.media.id = the asset URN.
 * Documents mirror Images. VIDEO uses the multi-part Videos API (initialize →
 * PUT each 4MB part, collect ETags → finalize); the post references the video
 * URN immediately and LinkedIn finishes processing async. All upload paths are
 * verified against the official docs (li-lms-2026-06) but UNTESTED end-to-end
 * (no creds yet) — verify on first real connect.
 */

const API_BASE = 'https://api.linkedin.com/rest';

/** YYYYMM version moniker. Override via env as LinkedIn rev's the API monthly. */
function apiVersion(): string {
  return process.env.LINKEDIN_API_VERSION || '202606';
}

function baseHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'X-Restli-Protocol-Version': '2.0.0',
    'LinkedIn-Version': apiVersion(),
  };
}

export type LinkedinMediaType = 'none' | 'image' | 'document' | 'video';

export interface PublishPostInput {
  accessToken: string;
  /** `urn:li:person:<id>` — the author. */
  memberUrn: string;
  /** Post body text (≤3000 chars). */
  commentary: string;
  mediaType: LinkedinMediaType;
  /** Source asset URL (e.g. S3) to upload when no assetUrn is supplied. */
  mediaUrl?: string | null;
  /** Pre-uploaded LinkedIn asset URN, if already registered. */
  mediaAssetUrn?: string | null;
}

export interface PublishPostResult {
  /** `urn:li:share:...` or `urn:li:ugcPost:...` */
  postUrn: string;
  permalink: string;
}

/** Fetch the source bytes once (S3 etc.). */
async function fetchBytes(mediaUrl: string): Promise<Buffer> {
  const srcRes = await fetch(mediaUrl);
  if (!srcRes.ok) {
    throw new Error(`Fetching media source failed (${srcRes.status}) for ${mediaUrl}`);
  }
  return Buffer.from(await srcRes.arrayBuffer());
}

/**
 * Upload an image or document and return its LinkedIn asset URN. Two-step:
 * initializeUpload → PUT all the bytes to the single pre-signed upload URL.
 */
async function uploadImageOrDocument(
  kind: 'image' | 'document',
  opts: { accessToken: string; memberUrn: string; mediaUrl: string },
): Promise<string> {
  const collection = kind === 'image' ? 'images' : 'documents';
  const initRes = await fetch(`${API_BASE}/${collection}?action=initializeUpload`, {
    method: 'POST',
    headers: { ...baseHeaders(opts.accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ initializeUploadRequest: { owner: opts.memberUrn } }),
  });
  if (!initRes.ok) {
    throw new Error(`LinkedIn ${kind} initializeUpload failed (${initRes.status}): ${await initRes.text()}`);
  }
  const init = (await initRes.json()) as { value?: { uploadUrl?: string; image?: string; document?: string } };
  const uploadUrl = init.value?.uploadUrl;
  const assetUrn = init.value?.image ?? init.value?.document;
  if (!uploadUrl || !assetUrn) {
    throw new Error(`LinkedIn ${kind} initializeUpload returned no uploadUrl/urn: ${JSON.stringify(init)}`);
  }
  const bytes = await fetchBytes(opts.mediaUrl);
  // The dms-uploads URL is pre-signed (sau token); the Bearer is harmless/ignored.
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${opts.accessToken}`, 'Content-Type': 'application/octet-stream' },
    body: new Uint8Array(bytes),
  });
  if (!putRes.ok && putRes.status !== 201) {
    throw new Error(`LinkedIn ${kind} byte upload failed (${putRes.status}): ${await putRes.text()}`);
  }
  return assetUrn;
}

/**
 * Upload a video and return its LinkedIn video URN. Multi-part:
 * initializeUpload (declares fileSizeBytes → N part instructions) → PUT each
 * 4MB byte-range, collecting the `etag` response header per part → finalizeUpload
 * with the ordered ETags. The video processes asynchronously; the post can
 * reference the URN immediately (LinkedIn publishes it once processing completes),
 * so we don't block the cron polling for AVAILABLE.
 */
async function uploadVideo(opts: { accessToken: string; memberUrn: string; mediaUrl: string }): Promise<string> {
  const bytes = await fetchBytes(opts.mediaUrl);
  const initRes = await fetch(`${API_BASE}/videos?action=initializeUpload`, {
    method: 'POST',
    headers: { ...baseHeaders(opts.accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: opts.memberUrn,
        fileSizeBytes: bytes.length,
        uploadCaptions: false,
        uploadThumbnail: false,
      },
    }),
  });
  if (!initRes.ok) {
    throw new Error(`LinkedIn video initializeUpload failed (${initRes.status}): ${await initRes.text()}`);
  }
  const init = (await initRes.json()) as {
    value?: {
      video?: string;
      uploadToken?: string;
      uploadInstructions?: { uploadUrl: string; firstByte: number; lastByte: number }[];
    };
  };
  const videoUrn = init.value?.video;
  const instructions = init.value?.uploadInstructions;
  if (!videoUrn || !instructions?.length) {
    throw new Error(`LinkedIn video initializeUpload returned no video/instructions: ${JSON.stringify(init)}`);
  }

  const partIds: string[] = [];
  for (const part of instructions) {
    const slice = bytes.subarray(part.firstByte, part.lastByte + 1); // lastByte inclusive
    const putRes = await fetch(part.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: new Uint8Array(slice),
    });
    if (!putRes.ok && putRes.status !== 201) {
      throw new Error(`LinkedIn video part upload failed (${putRes.status}): ${await putRes.text()}`);
    }
    const etag = putRes.headers.get('etag');
    if (!etag) {
      throw new Error('LinkedIn video part upload returned no etag header — cannot finalize.');
    }
    partIds.push(etag);
  }

  const finRes = await fetch(`${API_BASE}/videos?action=finalizeUpload`, {
    method: 'POST',
    headers: { ...baseHeaders(opts.accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      finalizeUploadRequest: { video: videoUrn, uploadToken: init.value?.uploadToken ?? '', uploadedPartIds: partIds },
    }),
  });
  if (!finRes.ok) {
    throw new Error(`LinkedIn video finalizeUpload failed (${finRes.status}): ${await finRes.text()}`);
  }
  return videoUrn;
}

/**
 * Publish a post to the authenticated member's profile. Returns the post URN +
 * a permalink. Throws on any non-2xx (caller marks the row failed with the msg).
 */
export async function publishPost(input: PublishPostInput): Promise<PublishPostResult> {
  // Resolve a media asset URN: use the supplied one, or upload from mediaUrl.
  let mediaAssetUrn = input.mediaAssetUrn ?? null;
  if (input.mediaType !== 'none' && !mediaAssetUrn) {
    if (!input.mediaUrl) {
      throw new Error(`LinkedIn ${input.mediaType} post requires mediaUrl or mediaAssetUrn.`);
    }
    const uploadOpts = { accessToken: input.accessToken, memberUrn: input.memberUrn, mediaUrl: input.mediaUrl };
    mediaAssetUrn =
      input.mediaType === 'video'
        ? await uploadVideo(uploadOpts)
        : await uploadImageOrDocument(input.mediaType, uploadOpts);
  }

  const body: Record<string, unknown> = {
    author: input.memberUrn,
    commentary: input.commentary,
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };
  if (mediaAssetUrn) {
    body.content = { media: { id: mediaAssetUrn } };
  }

  const res = await fetch(`${API_BASE}/posts`, {
    method: 'POST',
    headers: { ...baseHeaders(input.accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status !== 201) {
    throw new Error(`LinkedIn post create failed (${res.status}): ${await res.text()}`);
  }
  const postUrn = res.headers.get('x-restli-id');
  if (!postUrn) {
    throw new Error('LinkedIn post create returned 201 but no x-restli-id header.');
  }
  return {
    postUrn,
    permalink: `https://www.linkedin.com/feed/update/${postUrn}/`,
  };
}
