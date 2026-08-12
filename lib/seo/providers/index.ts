// Registry for the three external-data seams (SERP / keyword / backlink).
// No vendor account exists yet, so every getter falls back to the
// not-configured stub — unset or unrecognized env value never throws here;
// only a call into the stub's methods does. That keeps the registry safe to
// call from anywhere (page load, cron, MCP tool) without a config check
// first.
//
// Contract every future LIVE provider must meet before it's wired in below:
//   - cached        results keyed by request params, since these are paid
//                    per-call vendor APIs
//   - logged         every request recorded to a `provider_requests` table
//                    (not built yet — lands with the first live provider)
//                    for auditability and spend tracking
//   - cost-estimated each call attributes an estimated vendor cost so spend
//                    is visible before the invoice arrives
//   - client-associated every request tagged with the clientId it was made
//                    for, matching the tenancy model the rest of lib/seo
//                    follows (see lib/seo/CLAUDE.md-adjacent invariants)
//   - rate-limited   respects the vendor's documented rate limits, not just
//                    ours
//   - retryable      transient vendor failures (5xx, timeout) retry with
//                    backoff; ProviderNotConfiguredError and 4xx auth
//                    failures must not
// This comment is the enforcement seam until the first real provider lands
// — treat it as the acceptance checklist for that PR.

import type { SerpProvider, KeywordProvider, BacklinkProvider } from '@/lib/seo/providers/types';
import {
  notConfiguredSerpProvider,
  notConfiguredKeywordProvider,
  notConfiguredBacklinkProvider,
} from '@/lib/seo/providers/not-configured';

export type ProviderKind = 'serp' | 'keyword' | 'backlink';

const ENV_VAR: Record<ProviderKind, string> = {
  serp: 'SEO_SERP_PROVIDER',
  keyword: 'SEO_KEYWORD_PROVIDER',
  backlink: 'SEO_BACKLINK_PROVIDER',
};

// Recognized live provider values, per kind — empty until the first real
// provider lands (e.g. `serp: ['dataforseo']`). Kept as a single lookup so
// isProviderConfigured and the getters below can never disagree about what
// counts as "configured".
const KNOWN_VALUES: Record<ProviderKind, readonly string[]> = {
  serp: [],
  keyword: [],
  backlink: [],
};

/** True only once `kind`'s env var is set to a recognized live provider; no live providers exist yet, so this is always false today. */
export function isProviderConfigured(kind: ProviderKind): boolean {
  const value = process.env[ENV_VAR[kind]];
  return value != null && KNOWN_VALUES[kind].includes(value);
}

export function getSerpProvider(): SerpProvider {
  // No live SERP provider registered yet — unset or unrecognized value both
  // fall back to the stub. A live provider adds a branch here, e.g.
  // `if (value === 'dataforseo') return new DataForSeoSerpProvider();`,
  // plus its value in KNOWN_VALUES.serp above.
  return notConfiguredSerpProvider;
}

export function getKeywordProvider(): KeywordProvider {
  return notConfiguredKeywordProvider;
}

export function getBacklinkProvider(): BacklinkProvider {
  return notConfiguredBacklinkProvider;
}
