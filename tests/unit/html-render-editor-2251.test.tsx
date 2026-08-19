/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
//
// Focused crash repro for prod post 2251 (mvno-billing-platform): mounts
// SpecialPanel with the REAL heavy child components (no mocks except
// network-touching MediaPicker) against that post's exact html-render block.
// Skips when the gitignored prod fixture is absent.
import React from 'react';
import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

vi.mock('@/components/admin/MediaPicker', () => ({
  default: ({ value }: any) => <div data-testid="media-picker">{value || ''}</div>,
}));

import { SpecialPanel } from '@/components/portal/visual-editor/_components/block-panels/SpecialPanel';

const FIXTURE = path.join(
  process.cwd(),
  'scripts/migrations/integratouch/data/html-render-blocks.prod.json',
);

describe('SpecialPanel — prod post 2251 block, real children', () => {
  const exists = fs.existsSync(FIXTURE);
  it.skipIf(!exists)('mounts the mvno html-render block without throwing', () => {
    const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as Array<{
      source: string;
      block: any;
    }>;
    const targets = fixture.filter((f) => f.source.startsWith('post:2251:'));
    expect(targets.length).toBeGreaterThan(0);
    for (const { source, block } of targets) {
      try {
        render(<SpecialPanel block={block} onUpdate={() => {}} siteId={420} />);
      } catch (err) {
        throw new Error(
          `${source} id=${block.id} crashed: ${err instanceof Error ? `${err.message}\n${err.stack?.split('\n').slice(0, 6).join('\n')}` : String(err)}`,
        );
      } finally {
        cleanup();
      }
    }
  }, 120_000);
});
