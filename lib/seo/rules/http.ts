// HTTP-status and response-characteristic checks. Every rule here reads
// straight off the persisted seo_crawl_pages row — no cross-page or
// cross-run reasoning.

import type { SeoRule } from '@/lib/seo/types';

export const rules: SeoRule[] = [
  {
    id: 'page-4xx',
    category: 'http',
    severity: 'critical',
    title: 'Page returns a 4xx error',
    description: 'This page returned a client error (a status between 400 and 499) when we crawled it.',
    whyItMatters: 'Visitors and search engines both hit a broken page — it can\'t be indexed and it hurts anyone who lands on it from a link or search result.',
    howToFix: 'Fix the page so it loads correctly, or if it should no longer exist, redirect it to a relevant live page.',
    evaluate(ctx) {
      return ctx.pages
        .filter(p => p.httpStatus != null && p.httpStatus >= 400 && p.httpStatus <= 499)
        .map(p => ({
          ruleId: 'page-4xx',
          pageUrl: p.url,
          details: { httpStatus: p.httpStatus },
        }));
    },
  },
  {
    id: 'page-5xx',
    category: 'http',
    severity: 'critical',
    title: 'Page returns a 5xx server error',
    description: 'This page returned a server error (a status of 500 or higher) when we crawled it.',
    whyItMatters: 'A server error means the page is currently broken for everyone, including search engines trying to index it.',
    howToFix: 'Check your server or application logs for the cause and restore the page to a working state.',
    evaluate(ctx) {
      return ctx.pages
        .filter(p => p.httpStatus != null && p.httpStatus >= 500)
        .map(p => ({
          ruleId: 'page-5xx',
          pageUrl: p.url,
          details: { httpStatus: p.httpStatus },
        }));
    },
  },
  {
    id: 'slow-response',
    category: 'http',
    severity: 'warning',
    title: 'Page responds slowly',
    description: 'This page took longer than 1.5 seconds to respond.',
    whyItMatters: 'Slow pages frustrate visitors and can reduce how much of your site search engines are willing to crawl.',
    howToFix: 'Look at server response time, database queries, and any slow third-party calls the page makes before rendering.',
    evaluate(ctx) {
      return ctx.pages
        .filter(p => p.httpStatus === 200 && p.responseTimeMs != null && p.responseTimeMs > 1500)
        .map(p => ({
          ruleId: 'slow-response',
          pageUrl: p.url,
          details: { responseTimeMs: p.responseTimeMs },
        }));
    },
  },
  {
    id: 'large-page',
    category: 'http',
    severity: 'notice',
    title: 'Page is unusually large',
    description: 'This page\'s response is larger than 2 MB.',
    whyItMatters: 'Large pages take longer to download, which slows down visitors on slower connections and can affect how much a search engine crawls.',
    howToFix: 'Compress or lazy-load heavy assets, and check for content accidentally inlined into the HTML response.',
    evaluate(ctx) {
      return ctx.pages
        .filter(p => p.responseBytes != null && p.responseBytes > 2_000_000)
        .map(p => ({
          ruleId: 'large-page',
          pageUrl: p.url,
          details: { responseBytes: p.responseBytes },
        }));
    },
  },
];
