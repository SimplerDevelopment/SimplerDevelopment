// Default provider for all three kinds until a real vendor is wired up.
// Every method rejects rather than returning empty data, so callers can't
// mistake "no provider configured" for "the provider found nothing."

import type {
  SerpProvider,
  KeywordProvider,
  BacklinkProvider,
} from '@/lib/seo/providers/types';
import { ProviderNotConfiguredError } from '@/lib/seo/providers/types';

export const notConfiguredSerpProvider: SerpProvider = {
  name: 'not-configured',
  search() {
    return Promise.reject(new ProviderNotConfiguredError('SERP'));
  },
};

export const notConfiguredKeywordProvider: KeywordProvider = {
  name: 'not-configured',
  getMetrics() {
    return Promise.reject(new ProviderNotConfiguredError('keyword'));
  },
  getSuggestions() {
    return Promise.reject(new ProviderNotConfiguredError('keyword'));
  },
};

export const notConfiguredBacklinkProvider: BacklinkProvider = {
  name: 'not-configured',
  getSummary() {
    return Promise.reject(new ProviderNotConfiguredError('backlink'));
  },
  getBacklinks() {
    return Promise.reject(new ProviderNotConfiguredError('backlink'));
  },
  getReferringDomains() {
    return Promise.reject(new ProviderNotConfiguredError('backlink'));
  },
};
