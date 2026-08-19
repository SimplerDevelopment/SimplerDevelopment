/**
 * Pins the material-icons -> inline SVG substitution (perf fix, 2026-08-19).
 *
 * The public client sites were fetching /fonts/material-icons.woff2 — 126KB at
 * VeryHigh priority, competing with the LCP image — to render 40 distinct
 * glyphs authored into html-render block content during site migration. The
 * transform swaps those spans for inline SVG on the server so the font is never
 * needed. These tests lock the two properties that make that safe: mapped
 * glyphs really do become SVG, and unmapped ones are left completely alone so
 * they still render through the font rather than vanishing.
 */
import { describe, it, expect } from 'vitest';
import {
  inlineMaterialIcons,
  hasUnmappedMaterialIcons,
  materialIconShapes,
} from '@/lib/blocks/inline-material-icons';

describe('inlineMaterialIcons', () => {
  it('replaces a mapped glyph with an inline svg', () => {
    const out = inlineMaterialIcons('<span class="material-icons">handshake</span>');
    expect(out).toContain('<svg');
    expect(out).toContain('viewBox="0 0 24 24"');
    expect(out).not.toContain('material-icons');
    expect(out).not.toContain('handshake<');
  });

  it('inherits size and colour from the container', () => {
    // 1em + currentColor are what let the SVG drop into CSS written for a
    // font glyph without restyling anything.
    const out = inlineMaterialIcons('<span class="material-icons">menu</span>');
    expect(out).toContain('width="1em"');
    expect(out).toContain('height="1em"');
    expect(out).toContain('fill="currentColor"');
  });

  it('keeps the author\'s other classes and inline style', () => {
    const out = inlineMaterialIcons(
      '<span class="material-icons text-lg brand-accent" style="opacity:.5">expand_more</span>',
    );
    expect(out).toContain('text-lg');
    expect(out).toContain('brand-accent');
    expect(out).toContain('style="opacity:.5"');
    // ...but not the marker class itself, which would re-trigger the font.
    expect(out).not.toMatch(/class="[^"]*material-icons/);
  });

  it('leaves an unmapped glyph untouched so it still renders via the webfont', () => {
    const src = '<span class="material-icons">a_glyph_we_do_not_have</span>';
    expect(inlineMaterialIcons(src)).toBe(src);
    expect(hasUnmappedMaterialIcons(src)).toBe(true);
  });

  it('reports no unmapped glyphs when every icon resolves', () => {
    expect(
      hasUnmappedMaterialIcons(
        '<span class="material-icons">menu</span><span class="material-icons">handshake</span>',
      ),
    ).toBe(false);
  });

  it('is a no-op on content with no material icons', () => {
    const src = '<div class="it-hero"><h1>Hello</h1></div>';
    expect(inlineMaterialIcons(src)).toBe(src);
  });

  it('covers every glyph the live site actually uses', () => {
    // Collected from the 18 public pages of integratouch.simplerdevelopment.com
    // on 2026-08-19. If a migration introduces a new glyph this fails, which is
    // the signal to regenerate the map rather than silently re-ship the font.
    const used = [
      'account_tree', 'add_box', 'arrow_circle_right', 'arrow_forward', 'business',
      'business_center', 'check_box', 'check_circle', 'cloud_download', 'directions_run',
      'diversity_3', 'domain', 'event', 'event_available', 'expand_more', 'fact_check',
      'handshake', 'home_work', 'integration_instructions', 'manage_accounts', 'map',
      'menu', 'park', 'payments', 'person', 'person_add', 'person_search', 'place',
      'psychology', 'public', 'route', 'sentiment_satisfied', 'shopping_cart', 'store',
      'sync_alt', 'travel_explore', 'verified', 'work', 'work_history', 'workspace_premium',
    ];
    const missing = used.filter((g) => !materialIconShapes(g));
    expect(missing).toEqual([]);
  });

  it('handles several icons in one content string', () => {
    const out = inlineMaterialIcons(
      '<p><span class="material-icons">menu</span> and <span class="material-icons">verified</span></p>',
    );
    expect(out.match(/<svg/g)).toHaveLength(2);
  });
});
