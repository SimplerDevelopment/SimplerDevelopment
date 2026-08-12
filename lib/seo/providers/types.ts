// SEO Intelligence external-data seam. First-party crawl/GSC data lives in
// lib/seo/*; anything sourced from a paid vendor (SERP position tracking,
// keyword volume, backlink graphs — e.g. DataForSEO) goes through these
// interfaces so lib/seo business logic never imports a vendor SDK directly.
// See lib/seo/providers/index.ts for the registry and the live-provider
// contract every future implementation must meet.

export type SerpRequest = {
  keyword: string;
  country?: string;
  language?: string;
  device?: 'desktop' | 'mobile';
};

export type SerpResult = {
  position: number;
  url: string;
  title: string;
  domain: string;
};

export type SerpResponse = {
  keyword: string;
  results: SerpResult[];
  features: string[];
  fetchedAt: string;
};

export type KeywordMetrics = {
  keyword: string;
  volume: number | null;
  cpc: number | null;
  competition: number | null;
  trend: number[] | null;
};

export type KeywordSuggestion = {
  keyword: string;
  volume: number | null;
};

export type BacklinkSummary = {
  domain: string;
  backlinks: number | null;
  referringDomains: number | null;
};

export type Backlink = {
  fromUrl: string;
  toUrl: string;
  anchorText: string | null;
  nofollow: boolean;
  firstSeen: string | null;
};

export type ReferringDomain = {
  domain: string;
  backlinks: number;
  domainAuthority: number | null;
};

export interface SerpProvider {
  readonly name: string;
  search(params: SerpRequest): Promise<SerpResponse>;
}

export interface KeywordProvider {
  readonly name: string;
  getMetrics(keywords: string[]): Promise<KeywordMetrics[]>;
  getSuggestions(keyword: string): Promise<KeywordSuggestion[]>;
}

export interface BacklinkProvider {
  readonly name: string;
  getSummary(domain: string): Promise<BacklinkSummary>;
  getBacklinks(domain: string): Promise<Backlink[]>;
  getReferringDomains(domain: string): Promise<ReferringDomain[]>;
}

// Thrown by the not-configured stub, and by any future live provider that
// loses its credentials at runtime — callers can branch on `.code` without
// an instanceof import across the boundary.
export class ProviderNotConfiguredError extends Error {
  readonly code = 'provider-not-configured';
  constructor(kind: string) {
    super(`No ${kind} provider is configured`);
  }
}
