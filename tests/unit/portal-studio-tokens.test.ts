// PUX-142 — the Studio palette's one standing rule, made runnable.
//
// `.portal-studio` is defined three times in globals.css (light, `.dark`, and
// the prefers-color-scheme fallback) exactly the way the base theme tokens
// are. The base blocks carry a "KEEP VALUES IN STEP" comment and nothing
// enforces it — which is how `.force-light` drifted from `:root` before. A
// token defined in the light block but missing from a dark one doesn't throw:
// it silently falls through to the BASE theme's value, so a single missing
// line paints one stone-grey control in the middle of a navy portal and only
// a human eye catches it.
//
// This asserts the three blocks declare identical key sets. It says nothing
// about the values — those are a design call, and light/dark differing is the
// entire point.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CSS = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');

/** Body of the `.portal-studio` rule introduced by `selector`, brace-matched. */
function ruleBody(selector: string): string {
  const at = CSS.indexOf(selector);
  if (at === -1) throw new Error(`selector not found in globals.css: ${selector}`);
  const open = CSS.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < CSS.length; i++) {
    if (CSS[i] === '{') depth++;
    else if (CSS[i] === '}' && --depth === 0) return CSS.slice(open + 1, i);
  }
  throw new Error(`unbalanced braces after: ${selector}`);
}

const customProps = (body: string): string[] =>
  [...body.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]).sort();

describe('portal Studio tokens (PUX-142)', () => {
  const light = customProps(ruleBody('\n.portal-studio {'));
  const dark = customProps(ruleBody('\n.dark .portal-studio {'));
  const prefersDark = customProps(ruleBody('  :root:not(.light) .portal-studio {'));

  it('defines the light block at all', () => {
    expect(light.length).toBeGreaterThan(20);
  });

  it('declares the same tokens in .dark as in light', () => {
    // --font-display is deliberately light-only: the display face does not
    // change with the colour scheme, and re-stating it would be the kind of
    // duplication that drifts.
    expect(dark).toEqual(light.filter((t) => t !== '--font-display'));
  });

  it('declares the same tokens in the prefers-color-scheme block as in .dark', () => {
    expect(prefersDark).toEqual(dark);
  });

  it('overrides every --portal-* token the base theme defines', () => {
    // These drive the portal chrome + widget board. One left un-overridden is
    // a stone-grey status pill on a navy page.
    const base = customProps(ruleBody('\n:root {')).filter((t) => t.startsWith('--portal-'));
    expect(base.length).toBeGreaterThan(0);
    for (const token of base) expect(light).toContain(token);
  });

  it('namespaces its rail and Brain tokens so nothing outside the portal reads them', () => {
    const studioOnly = light.filter((t) => t.startsWith('--studio-'));
    expect(studioOnly).toContain('--studio-rail');
    expect(studioOnly).toContain('--studio-gold');
  });
});
