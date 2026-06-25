/**
 * LinkedIn REST Posts API client — Phase A (text posts).
 *
 * Verified against the official Posts API doc (Microsoft Learn, li-lms-2026-06):
 *   POST https://api.linkedin.com/rest/posts
 *   headers: Authorization: Bearer, X-Restli-Protocol-Version: 2.0.0,
 *            LinkedIn-Version: <YYYYMM>, Content-Type: application/json
 *   text body: { author, commentary, visibility, distribution, lifecycleState,
 *                isReshareDisabledByAuthor }
 *   → 201, post URN returned in the `x-restli-id` response header.
 *
 * Media (image/video/document) posts require uploading the asset FIRST via the
 * Images/Videos/Documents API to obtain a urn:li:image|video|document, then
 * referencing it as content.media.id. That multi-step upload is NOT implemented
 * yet — publishPost throws for non-text media so we never ship a half-working,
 * untestable upload path. See TODO below.
 */

const POSTS_URL = 'https://api.linkedin.com/rest/posts';

/** YYYYMM version moniker. Override via env as LinkedIn rev's the API monthly. */
function apiVersion(): string {
  return process.env.LINKEDIN_API_VERSION || '202606';
}

export interface PublishPostInput {
  accessToken: string;
  /** `urn:li:person:<id>` — the author. */
  memberUrn: string;
  /** Post body text (≤3000 chars). */
  commentary: string;
  mediaType: 'none' | 'image' | 'video';
  /** Source asset URL (S3) — used once media upload is implemented. */
  mediaUrl?: string | null;
  /** Pre-uploaded LinkedIn asset URN, if already registered. */
  mediaAssetUrn?: string | null;
}

export interface PublishPostResult {
  /** `urn:li:share:...` or `urn:li:ugcPost:...` */
  postUrn: string;
  permalink: string;
}

export class LinkedinMediaNotImplementedError extends Error {
  constructor(mediaType: string) {
    super(
      `LinkedIn ${mediaType} posting is not implemented yet — it requires the ` +
        `Images/Videos/Documents upload flow (initializeUpload → PUT bytes → ` +
        `reference the urn:li:${mediaType}). Post text-only for now.`,
    );
    this.name = 'LinkedinMediaNotImplementedError';
  }
}

/**
 * Publish a post to the authenticated member's profile. Returns the post URN +
 * a permalink. Throws on any non-2xx (caller marks the row failed with the msg).
 */
export async function publishPost(input: PublishPostInput): Promise<PublishPostResult> {
  if (input.mediaType !== 'none' && !input.mediaAssetUrn) {
    // TODO(linkedin-media): implement Images/Videos/Documents upload:
    //   1) POST /rest/images?action=initializeUpload { owner: memberUrn }
    //   2) PUT the bytes (from mediaUrl) to the returned uploadUrl
    //   3) reference content.media.id = returned urn:li:image|video|document
    throw new LinkedinMediaNotImplementedError(input.mediaType);
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
  if (input.mediaAssetUrn) {
    body.content = { media: { id: input.mediaAssetUrn } };
  }

  const res = await fetch(POSTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
      'LinkedIn-Version': apiVersion(),
      'Content-Type': 'application/json',
    },
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
