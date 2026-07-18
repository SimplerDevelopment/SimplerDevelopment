/**
 * SD Chat — Media API types
 *
 * Mirrors the response shape returned by the SimplerDevelopment portal at
 * `GET /api/portal/media` (list + brandingProfiles + pagination) and the
 * `PUT` / `DELETE` variants at `/api/portal/media/[id]`.
 *
 * Field-level notes:
 * - All timestamps are ISO 8601 strings (Postgres `timestamp` columns
 *   serialize that way over JSON).
 * - The mobile UI maps `mimeType` → a four-bucket `MediaKind` (image / doc /
 *   video / audio) for filter chips. See `mimeTypeToKind()` in
 *   `lib/api/media.ts`.
 */

/** One row of the `media` table joined with the owning branding profile name. */
export interface MediaRow {
  id: number;
  filename: string;
  storedFilename: string;
  mimeType: string;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  url: string;
  thumbnailUrl: string | null;
  alt: string | null;
  caption: string | null;
  uploadedBy: number | null;
  websiteId: number | null;
  brandingProfileId: number | null;
  brandingProfileName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MediaBrandingProfileSummary {
  id: number;
  name: string;
}

/** Wire response of `GET /api/portal/media`. */
export interface MediaListResponse {
  data: MediaRow[];
  brandingProfiles: MediaBrandingProfileSummary[];
  pagination: { limit: number; offset: number; total: number };
}

/** Four-bucket UI category for the filter chips on the Media tab. */
export type MediaKind = 'image' | 'video' | 'doc' | 'audio';

/** UI-friendly filter selector — `'all'` means "no kind filter". */
export type MediaFilter = MediaKind | 'all';
