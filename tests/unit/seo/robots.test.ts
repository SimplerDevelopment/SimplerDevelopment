// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parseRobotsTxt } from '@/lib/seo/robots';

describe('parseRobotsTxt — missing/empty', () => {
  it('allows everything for an empty string', () => {
    const r = parseRobotsTxt('');
    expect(r.isAllowed('https://example.com/anything')).toBe(true);
    expect(r.sitemaps).toEqual([]);
  });

  it('allows everything when no group matches the UA', () => {
    const r = parseRobotsTxt('User-agent: GoogleOnly\nDisallow: /\n');
    expect(r.isAllowed('https://example.com/x')).toBe(true);
  });
});

describe('parseRobotsTxt — basic allow/disallow', () => {
  const robots = parseRobotsTxt(`
    User-agent: *
    Disallow: /admin
    Allow: /public
  `);

  it('disallows a path under a Disallow rule', () => {
    expect(robots.isAllowed('https://example.com/admin/settings')).toBe(false);
  });

  it('allows a path not covered by any rule', () => {
    expect(robots.isAllowed('https://example.com/blog/post')).toBe(true);
  });

  it('allows a path under an Allow rule', () => {
    expect(robots.isAllowed('https://example.com/public/x')).toBe(true);
  });
});

describe('parseRobotsTxt — empty Disallow means allow-all', () => {
  it('allows everything when Disallow has no value', () => {
    const r = parseRobotsTxt('User-agent: *\nDisallow:\n');
    expect(r.isAllowed('https://example.com/anything')).toBe(true);
  });
});

describe('parseRobotsTxt — longest match wins', () => {
  it('a more specific Allow overrides a shorter Disallow', () => {
    const r = parseRobotsTxt(`
      User-agent: *
      Disallow: /
      Allow: /public/
    `);
    expect(r.isAllowed('https://example.com/public/page')).toBe(true);
    expect(r.isAllowed('https://example.com/private')).toBe(false);
  });

  it('a more specific Disallow overrides a shorter Allow', () => {
    const r = parseRobotsTxt(`
      User-agent: *
      Allow: /
      Disallow: /secret/
    `);
    expect(r.isAllowed('https://example.com/secret/page')).toBe(false);
    expect(r.isAllowed('https://example.com/other')).toBe(true);
  });
});

describe('parseRobotsTxt — tie goes to Allow', () => {
  it('Allow wins over Disallow at equal specificity', () => {
    const r = parseRobotsTxt(`
      User-agent: *
      Disallow: /page
      Allow: /page
    `);
    expect(r.isAllowed('https://example.com/page')).toBe(true);
  });
});

describe('parseRobotsTxt — wildcards and end anchors', () => {
  it('matches * as a wildcard segment', () => {
    const r = parseRobotsTxt('User-agent: *\nDisallow: /private/*/edit\n');
    expect(r.isAllowed('https://example.com/private/123/edit')).toBe(false);
    expect(r.isAllowed('https://example.com/private/123/view')).toBe(true);
  });

  it('matches $ as an end-of-string anchor', () => {
    const r = parseRobotsTxt('User-agent: *\nDisallow: /file.php$\n');
    expect(r.isAllowed('https://example.com/file.php')).toBe(false);
    expect(r.isAllowed('https://example.com/file.php?x=1')).toBe(true);
    expect(r.isAllowed('https://example.com/file.php/nested')).toBe(true);
  });

  it('matches a wildcard extension pattern', () => {
    const r = parseRobotsTxt('User-agent: *\nDisallow: /*.pdf$\n');
    expect(r.isAllowed('https://example.com/docs/report.pdf')).toBe(false);
    expect(r.isAllowed('https://example.com/docs/report.pdf.html')).toBe(true);
  });
});

describe('parseRobotsTxt — user-agent group selection', () => {
  const robots = parseRobotsTxt(`
    User-agent: *
    Disallow: /private

    User-agent: SimplerDevelopmentBot
    Disallow: /bot-only
    Allow: /private
  `);

  it('uses the specific group for a matching UA, entirely overriding *', () => {
    // The specific group has no rule for /private, and specific overrides
    // the wildcard group wholesale rather than merging, so /private is
    // reachable through the specific group's own Allow rule.
    expect(robots.isAllowed('https://example.com/private/x')).toBe(true);
    expect(robots.isAllowed('https://example.com/bot-only')).toBe(false);
  });

  it('falls back to the * group for a non-matching UA', () => {
    expect(robots.isAllowed('https://example.com/private/x', 'curl/8.0')).toBe(false);
    expect(robots.isAllowed('https://example.com/bot-only', 'curl/8.0')).toBe(true);
  });

  it('defaults to SimplerDevelopmentBot when no UA is passed', () => {
    expect(robots.isAllowed('https://example.com/bot-only')).toBe(false);
  });

  it('matches UA by substring, case-insensitively', () => {
    const r = parseRobotsTxt('User-agent: googlebot\nDisallow: /no-google\n');
    expect(r.isAllowed('https://example.com/no-google', 'Googlebot/2.1 (+http://www.google.com/bot.html)')).toBe(
      false
    );
  });

  it('directives are case-insensitive', () => {
    const r = parseRobotsTxt('USER-AGENT: *\nDISALLOW: /admin\n');
    expect(r.isAllowed('https://example.com/admin')).toBe(false);
  });
});

describe('parseRobotsTxt — grouped multi-agent blocks', () => {
  it('applies the same rules to every UA listed consecutively', () => {
    const r = parseRobotsTxt(`
      User-agent: agentA
      User-agent: agentB
      Disallow: /shared
    `);
    expect(r.isAllowed('https://example.com/shared', 'agentA')).toBe(false);
    expect(r.isAllowed('https://example.com/shared', 'agentB')).toBe(false);
  });
});

describe('parseRobotsTxt — sitemaps', () => {
  it('collects one sitemap directive', () => {
    const r = parseRobotsTxt('User-agent: *\nDisallow:\nSitemap: https://example.com/sitemap.xml\n');
    expect(r.sitemaps).toEqual(['https://example.com/sitemap.xml']);
  });

  it('collects multiple sitemap directives regardless of position', () => {
    const r = parseRobotsTxt(`
      Sitemap: https://example.com/sitemap1.xml
      User-agent: *
      Disallow: /admin
      Sitemap: https://example.com/sitemap2.xml
    `);
    expect(r.sitemaps).toEqual([
      'https://example.com/sitemap1.xml',
      'https://example.com/sitemap2.xml',
    ]);
  });
});

describe('parseRobotsTxt — matches pathname + search', () => {
  it('matches against the query string too', () => {
    const r = parseRobotsTxt('User-agent: *\nDisallow: /search?q=\n');
    expect(r.isAllowed('https://example.com/search?q=test')).toBe(false);
    expect(r.isAllowed('https://example.com/search')).toBe(true);
  });
});

describe('parseRobotsTxt — comments and blank lines are ignored', () => {
  it('ignores comment lines and inline comments', () => {
    const r = parseRobotsTxt(`
      # full-line comment
      User-agent: * # inline comment
      Disallow: /admin # another comment

      Sitemap: https://example.com/sitemap.xml
    `);
    expect(r.isAllowed('https://example.com/admin')).toBe(false);
    expect(r.sitemaps).toEqual(['https://example.com/sitemap.xml']);
  });
});
