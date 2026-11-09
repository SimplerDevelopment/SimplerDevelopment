// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

let flag = true;
vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => flag }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
import { EditorHeader, type EditorHeaderProps } from '@/app/portal/tools/pitch-decks/[id]/_components/EditorHeader';
import type { DeckPayload } from '@/app/portal/tools/pitch-decks/[id]/_lib/api';

afterEach(cleanup);
const noop = () => {};
const props = (status: string): EditorHeaderProps => ({
  deck: { id: 1, title: 'Summit Bank retreat', slug: 'summit-bank-retreat', status, slides: [{ id: 1 }] } as unknown as DeckPayload,
  saving: false, publishing: false, hasUnsavedChanges: true, editingTitle: false, titleDraft: '', editingSlug: false, slugDraft: '', slugError: null,
  onStartEditTitle: noop, onTitleDraftChange: noop, onSaveTitle: noop, onCancelEditTitle: noop, onStartEditSlug: noop, onSlugDraftChange: noop, onSaveSlug: noop, onCancelEditSlug: noop,
  onToggleTheme: noop, onToggleRegenerate: noop, onToggleHistory: noop, onToggleSeo: noop, onSave: noop, onTogglePublish: noop, onPresent: noop, onDelete: noop, presenterUrl: '/p',
});
const buttons = (root: HTMLElement) => Array.from(root.querySelectorAll('button'));

describe('PUX-177 EditorHeader studio chrome', () => {
  it('studio: Publish is the one teal, Present / Theme / Save are quiet, Copy link copies the public URL', () => {
    flag = true;
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const { container } = render(<EditorHeader {...props('draft')} />);
    const teal = buttons(container).filter((b) => b.className.includes('bg-primary'));
    expect(teal.map((b) => b.textContent)).toEqual(['publishPublish']);
    expect(buttons(container).find((b) => b.textContent?.includes('Present'))?.className).toContain('border-border');
    expect(buttons(container).find((b) => b.textContent?.includes('Theme'))?.className).toContain('border-border');
    const save = buttons(container).find((b) => b.textContent?.includes('Update'));
    expect(save?.className).not.toContain('bg-green-600');
    fireEvent.click(screen.getByRole('button', { name: /Copy link/ }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/slides/summit-bank-retreat`);
    expect(screen.getByText('Copied')).toBeTruthy();
  });
  it('studio: a published deck shows Unpublish as a ghost — still only one teal on the page', () => {
    flag = true;
    const { container } = render(<EditorHeader {...props('published')} />);
    expect(buttons(container).filter((b) => b.className.includes('bg-primary')).length).toBe(0);
  });
  it('flag off: legacy classes, green Update, no Copy link', () => {
    flag = false;
    const { container } = render(<EditorHeader {...props('draft')} />);
    expect(buttons(container).find((b) => b.textContent?.includes('Update'))?.className).toContain('bg-green-600');
    expect(buttons(container).find((b) => b.textContent?.includes('Present'))?.className).toContain('hover:bg-accent');
    expect(screen.queryByRole('button', { name: /Copy link/ })).toBeNull();
  });
});
