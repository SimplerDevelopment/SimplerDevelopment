/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
//
// Crash-repro harness: mounts SpecialPanel (the settings panel the visual
// editor opens when an html-render block is selected) against every
// html-render block dumped from a real migrated site. Skips when the
// gitignored fixture is absent (CI) — locally it pinpoints exactly which
// block shape crashes the editor.
import React from 'react';
import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

vi.mock('@/components/admin/MediaPicker', () => ({
  default: ({ value }: any) => <div data-testid="media-picker">{value || ''}</div>,
}));
vi.mock('@/components/blocks/visual/GoogleFontPicker', () => ({
  GoogleFontPicker: ({ value }: any) => <div data-testid="font-picker">{value || ''}</div>,
}));
vi.mock('@/components/blocks/visual/HtmlTemplateEditor', () => ({
  HtmlTemplateEditor: ({ value }: any) => <textarea data-testid="tpl-editor" defaultValue={value || ''} />,
}));
vi.mock('@/components/portal/IconPicker', () => ({
  IconPicker: ({ value }: any) => <div data-testid="icon-picker">{value || ''}</div>,
}));

import { SpecialPanel } from '@/components/portal/visual-editor/_components/block-panels/SpecialPanel';

const FIXTURE =
  process.env.HTML_RENDER_FIXTURE ||
  path.join(process.cwd(), 'scripts/migrations/integratouch/data/html-render-blocks.local.json');

describe('SpecialPanel html-render corpus', () => {
  const exists = fs.existsSync(FIXTURE);
  it.skipIf(!exists)('renders every migrated html-render block without throwing', () => {
    const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as Array<{
      source: string;
      path: string;
      block: any;
    }>;
    const failures: string[] = [];
    for (const { source, path: bp, block } of fixture) {
      try {
        render(<SpecialPanel block={block} onUpdate={() => {}} siteId={186} />);
      } catch (err) {
        failures.push(
          `${source} [${bp}] id=${block.id}: ${err instanceof Error ? `${err.message}\n    ${err.stack?.split('\n').slice(1, 4).join('\n    ')}` : String(err)}`,
        );
      } finally {
        cleanup();
      }
    }
    if (failures.length) {
      console.error(`\n${failures.length}/${fixture.length} blocks crash the panel:\n` + failures.slice(0, 5).join('\n\n'));
    }
    expect(failures).toEqual([]);
  }, 240_000);
});
