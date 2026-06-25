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
 * Documents mirror Images (verify on first real use). VIDEO is intentionally
 * NOT implemented — it's async/chunked with status polling, materially more work.
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

export class LinkedinVideoNotImplementedError extends Error {
  constructor() {
    super(
      'LinkedIn video posting is not implemented — the Videos API is async/chunked ' +
        '(initialize → multipart upload → finalize → poll status). Post text/image/document for now.',
    );
    this.name = 'LinkedinVideoNotImplementedError';
  }
}

/**
 * Upload an image or document and return its LinkedIn asset URN. Two-step:
 * initializeUpload → PUT the bytes fetched from `mediaUrl`.
 */
async function uploadAsset(
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

  // Fetch the source bytes (S3 etc.) and PUT them to the pre-signed upload URL.
  const srcRes = await fetch(opts.mediaUrl);
  if (!srcRes.ok) {
    throw new Error(`Fetching media source failed (${srcRes.status}) for ${opts.mediaUrl}`);
  }
  const bytes = Buffer.from(await srcRes.arrayBuffer());
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${opts.accessToken}` },
    body: bytes,
  });
  if (!putRes.ok && putRes.status !== 201) {
    throw new Error(`LinkedIn ${kind} byte upload failed (${putRes.status}): ${await putRes.text()}`);
  }
  return assetUrn;
}

/**
 * Publish a post to the authenticated member's profile. Returns the post URN +
 * a permalink. Throws on any non-2xx (caller marks the row failed with the msg).
 */
export async function publishPost(input: PublishPostInput): Promise<PublishPostResult> {
  if (input.mediaType === 'video') {
    throw new LinkedinVideoNotImplementedError();
  }

  // Resolve a media asset URN: use the supplied one, or upload from mediaUrl.
  let mediaAssetUrn = input.mediaAssetUrn ?? null;
  if ((input.mediaType === 'image' || input.mediaType === 'document') && !mediaAssetUrn) {
    if (!input.mediaUrl) {
      throw new Error(`LinkedIn ${input.mediaType} post requires mediaUrl or mediaAssetUrn.`);
    }
    mediaAssetUrn = await uploadAsset(input.mediaType, {
      accessToken: input.accessToken,
      memberUrn: input.memberUrn,
      mediaUrl: input.mediaUrl,
    });
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
