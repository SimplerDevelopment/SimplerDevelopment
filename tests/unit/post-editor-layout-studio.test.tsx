// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
let flag = true;
vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => flag }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
import { PostEditorLayout } from '@/components/admin/PostEditorLayout';
import { IframeViewportControls } from '@/components/portal/post-form/sections/IframeChromeControls';

afterEach(cleanup);
const base = { postTitle: 'Ridge Traverse', onOpenSettings: () => {}, onStatusChange: () => {}, onPreviewToggle: () => {}, saveStatus: 'idle' as const, backHref: '/x' };
const buttons = (root: HTMLElement) => Array.from(root.querySelectorAll('button'));

describe('PUX-185 editor bar chrome', () => {
  it('studio: Publish is the one teal, Preview and Save draft are ghosts, Save draft saves without publishing', () => {
    flag = true;
    const onPublish = vi.fn(); const onSaveDraft = vi.fn();
    const { container } = render(<PostEditorLayout {...base} published={false} onPublish={onPublish} onSaveDraft={onSaveDraft}><div /></PostEditorLayout>);
    const teal = buttons(container).filter((b) => b.className.includes('bg-primary'));
    expect(teal.map((b) => b.textContent?.trim())).toEqual(['checkPublish']);
    expect(buttons(container).find((b) => b.textContent?.includes('Preview'))?.className).toContain('border-border');
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(onSaveDraft).toHaveBeenCalled();
    expect(onPublish).not.toHaveBeenCalled();
  });
  it('studio: a published post shows Update and no Save draft', () => {
    flag = true;
    const { container } = render(<PostEditorLayout {...base} published onPublish={() => {}} onSaveDraft={() => {}}><div /></PostEditorLayout>);
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
    expect(buttons(container).find((b) => b.className.includes('bg-primary'))?.textContent).toContain('Update');
  });
  it('flag off (admin): legacy classes, no Save draft even when the handler is passed', () => {
    flag = false;
    const { container } = render(<PostEditorLayout {...base} published={false} onPublish={() => {}} onSaveDraft={() => {}}><div /></PostEditorLayout>);
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
    expect(buttons(container).find((b) => b.textContent?.includes('Publish'))?.className).toContain('hover:bg-primary/90');
  });
  it('viewport segment: aria-pressed marks the active viewport under the flag', () => {
    flag = true;
    const set = vi.fn();
    render(<IframeViewportControls iframeViewport="tablet" setIframeViewport={set} useLocalhost={false} setUseLocalhost={() => {}} localPort="3000" setLocalPort={() => {}} />);
    expect(screen.getByTitle('Tablet').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTitle('Mobile'));
    expect(set).toHaveBeenCalledWith('mobile');
  });
});
