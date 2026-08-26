// @vitest-environment jsdom
//
// Direct (unmocked) render tests for TeamShowcaseBlockRender and
// TeamFlipGridBlockRender — JUL9-003's per-member color override pass.
// No renderer-level test existed for either component before this file;
// prior coverage (components-batch-43h.test.tsx) only exercised the
// *Preview wrappers with the renderer mocked out.
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TeamShowcaseBlockRender } from '@/components/blocks/render/TeamShowcaseBlockRender';
import { TeamFlipGridBlockRender } from '@/components/blocks/render/TeamFlipGridBlockRender';

describe('TeamShowcaseBlockRender — per-member accentColor override (JUL9-003)', () => {
  it('honors a per-member accentColor override on the gold accent line and title text', () => {
    const block: any = {
      type: 'team-showcase',
      accentColor: '#cfa122',
      members: [
        { id: 'm1', name: 'Alice', title: 'CEO', photo: 'http://a.png', bio: 'Bio', accentColor: '#00ff00' },
      ],
    };
    const { container } = render(<TeamShowcaseBlockRender block={block} />);
    // The gold accent line is the first div inside the bio panel with a
    // linear-gradient background built from the accent color.
    const accentLine = container.querySelector('.w-10.h-\\[2px\\]');
    expect(accentLine!.getAttribute('style') ?? '').toContain('rgb(0, 255, 0)');
    const titleEl = Array.from(container.querySelectorAll('p')).find((p) => p.textContent === 'CEO');
    expect(titleEl!.getAttribute('style') ?? '').toContain('rgb(0, 255, 0)');
  });

  it('falls back to the block-level accentColor when a member has no override', () => {
    const block: any = {
      type: 'team-showcase',
      accentColor: '#cfa122',
      members: [{ id: 'm1', name: 'Bob', title: 'CTO', photo: 'http://b.png', bio: 'Bio' }],
    };
    const { container } = render(<TeamShowcaseBlockRender block={block} />);
    const accentLine = container.querySelector('.w-10.h-\\[2px\\]');
    expect(accentLine!.getAttribute('style') ?? '').toContain('rgb(207, 161, 34)');
  });
});

describe('TeamFlipGridBlockRender — per-member nameColor/titleColor override (JUL9-003)', () => {
  const baseMember = { id: 'm1', name: 'Alice', title: 'CEO', photo: '', bio: '', question: 'Q', answer: 'A' };

  it('honors per-member nameColor/titleColor overrides on the front card', () => {
    const block: any = {
      type: 'team-flip-grid',
      nameColor: '#0A3A5C',
      titleColor: '#1B6FA8',
      members: [{ ...baseMember, nameColor: '#ff0000', titleColor: '#00ff00' }],
    };
    const { container } = render(<TeamFlipGridBlockRender block={block} />);
    const nameEl = container.querySelector('.pc-flip-card__name');
    expect(nameEl!.getAttribute('style') ?? '').toContain('rgb(255, 0, 0)');
    const titleEl = container.querySelector('.pc-flip-card__title');
    expect(titleEl!.getAttribute('style') ?? '').toContain('rgb(0, 255, 0)');
  });

  it('falls back to the block-level nameColor/titleColor when a member has no override', () => {
    const block: any = {
      type: 'team-flip-grid',
      nameColor: '#0A3A5C',
      titleColor: '#1B6FA8',
      members: [baseMember],
    };
    const { container } = render(<TeamFlipGridBlockRender block={block} />);
    const nameEl = container.querySelector('.pc-flip-card__name');
    expect(nameEl!.getAttribute('style') ?? '').toContain('rgb(10, 58, 92)');
    const titleEl = container.querySelector('.pc-flip-card__title');
    expect(titleEl!.getAttribute('style') ?? '').toContain('rgb(27, 111, 168)');
  });
});
