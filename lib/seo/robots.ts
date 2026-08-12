// robots.txt parsing + matching. Follows Google's documented semantics
// (https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt),
// not the stricter original RFC: longest-match-wins with Allow beating
// Disallow on a tie, `*`/`$` pattern support, per-UA groups.

export type ParsedRobots = {
  isAllowed(url: string, userAgent?: string): boolean;
  sitemaps: string[];
};

const DEFAULT_UA = 'SimplerDevelopmentBot';

type Rule = { path: string; allow: boolean };
type Group = { agents: string[]; rules: Rule[] };

// Directive line → [name, value]. Case-insensitive field names; value keeps
// original case (paths are case-sensitive, UA tokens are matched case-insensitively).
function parseLine(line: string): [string, string] | null {
  const withoutComment = line.split('#')[0];
  const trimmed = withoutComment.trim();
  if (!trimmed) return null;
  const idx = trimmed.indexOf(':');
  if (idx === -1) return null;
  const name = trimmed.slice(0, idx).trim().toLowerCase();
  const value = trimmed.slice(idx + 1).trim();
  return [name, value];
}

export function parseRobotsTxt(text: string): ParsedRobots {
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let current: Group | null = null;
  // Directives immediately after a User-agent line join that group; a
  // non-UA directive after any rule closes the "still collecting agents" window.
  let collectingAgents = false;

  for (const rawLine of (text ?? '').split(/\r\n|\r|\n/)) {
    const parsed = parseLine(rawLine);
    if (!parsed) continue;
    const [name, value] = parsed;

    if (name === 'user-agent') {
      if (!collectingAgents || !current) {
        current = { agents: [], rules: [] };
        groups.push(current);
        collectingAgents = true;
      }
      current.agents.push(value.toLowerCase());
      continue;
    }

    collectingAgents = false;

    if (name === 'sitemap') {
      if (value) sitemaps.push(value);
      continue;
    }

    if (!current) continue; // rule before any User-agent — ignore, no group to attach to

    if (name === 'allow') {
      current.rules.push({ path: value, allow: true });
    } else if (name === 'disallow') {
      // Empty Disallow value means "disallow nothing" (allow all) per spec.
      if (value) current.rules.push({ path: value, allow: false });
    }
    // crawl-delay and other extension directives are parsed but not modeled here.
  }

  function selectGroup(userAgent: string): Group | null {
    const ua = userAgent.toLowerCase();
    let specific: Group | null = null;
    let wildcard: Group | null = null;
    for (const g of groups) {
      for (const agent of g.agents) {
        if (agent === '*') {
          wildcard = wildcard ?? g;
        } else if (ua.includes(agent)) {
          specific = specific ?? g;
        }
      }
    }
    return specific ?? wildcard;
  }

  function isAllowed(url: string, userAgent: string = DEFAULT_UA): boolean {
    let target: string;
    try {
      const u = new URL(url);
      target = u.pathname + u.search;
    } catch {
      target = url;
    }

    const group = selectGroup(userAgent);
    if (!group || group.rules.length === 0) return true;

    let best: Rule | null = null;
    for (const rule of group.rules) {
      if (!matchesPattern(target, rule.path)) continue;
      if (!best) {
        best = rule;
        continue;
      }
      const bestLen = patternSpecificity(best.path);
      const ruleLen = patternSpecificity(rule.path);
      if (ruleLen > bestLen) {
        best = rule;
      } else if (ruleLen === bestLen && rule.allow && !best.allow) {
        best = rule; // tie → Allow wins
      }
    }

    return best ? best.allow : true;
  }

  return { isAllowed, sitemaps };
}

// Specificity = pattern length minus wildcard chars, so a longer literal
// match beats a shorter one even when both contain `*`.
function patternSpecificity(pattern: string): number {
  return pattern.replace(/\*/g, '').length;
}

// Robots pattern → regex: `*` is any-sequence, `$` anchors end-of-string,
// everything else (including other regex metachars) is literal.
function matchesPattern(target: string, pattern: string): boolean {
  if (pattern === '') return true; // shouldn't occur (empty Disallow filtered earlier) but stay safe
  const endsAnchored = pattern.endsWith('$');
  const body = endsAnchored ? pattern.slice(0, -1) : pattern;
  const escaped = body
    .split('*')
    .map(seg => seg.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  const re = new RegExp('^' + escaped + (endsAnchored ? '$' : ''));
  return re.test(target);
}
