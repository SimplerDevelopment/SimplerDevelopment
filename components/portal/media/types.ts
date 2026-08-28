// components/portal/media/types.ts
// Extracted verbatim from app/portal/media/page.tsx for PUX-188.

export interface MediaItem {
  id: number;
  filename: string;
  url: string;
  // Smaller derivative used for grid renders. E2 perf — when present, the
  // grid <img> prefers thumbnailUrl over the full url to avoid downloading
  // multi-MB originals for h-40 tiles.
  thumbnailUrl?: string | null;
  mimeType: string;
  fileSize: number;
  width?: number | null;
  height?: number | null;
  alt?: string | null;
  caption?: string | null;
  brandingProfileId?: number | null;
  brandingProfileName?: string | null;
  version?: number;
  createdAt: string;
}

export interface MediaVersionEntry {
  id: number;
  version: number;
  filename: string;
  url: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
}

export interface BrandingProfileOption {
  id: number;
  name: string;
}
