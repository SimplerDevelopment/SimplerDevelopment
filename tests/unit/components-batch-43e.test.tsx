// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Targets — four small, pure presentational components with no prior unit
// coverage. Each is `'use client'` and depends only on its `block` /
// callback props; no contexts, network, or routing required.
// ---------------------------------------------------------------------------

import { PalizziMembershipBlockRender } from '@/components/blocks/render/PalizziMembershipBlockRender';
import { PalizziRulesBlockRender } from '@/components/blocks/render/PalizziRulesBlockRender';
import { VideoBlockPreview } from '@/components/blocks/visual/VideoBlockPreview';
import { ContentTypeSelect } from '@/components/portal/post-form/sections/ContentTypeSelect';

// ---------------------------------------------------------------------------
// PalizziMembershipBlockRender
// ---------------------------------------------------------------------------

describe('PalizziMembershipBlockRender', () => {
  const baseBlock = {
    id: 'm1',
    type: 'palizzi-membership',
    overline: 'Members Only',
    title: 'Become a',
    titleAccent: 'Member',
    paragraphs: ['First paragraph copy.', 'Second paragraph copy.'],
    highlight: 'A highlighted invitation.',
    closingNote: 'A closing note appears below the highlight.',
    signature: 'The Founders',
    footnote: 'Subject to availability.',
  } as any;

  it('renders overline, title + accent, signature and footnote', () => {
    const { container } = render(<PalizziMembershipBlockRender block={baseBlock} />);
    expect(screen.getByText('Members Only')).toBeTruthy();
    // title text is split across the h2 and a child span — match heading content
    const h2 = container.querySelector('h2');
    expect(h2).toBeTruthy();
    expect(h2!.textContent).toContain('Become a');
    expect(h2!.textContent).toContain('Member');
    expect(screen.getByText('A highlighted invitation.')).toBeTruthy();
    expect(screen.getByText('A closing note appears below the highlight.')).toBeTruthy();
    expect(screen.getByText('The Founders')).toBeTruthy();
    expect(screen.getByText('Subject to availability.')).toBeTruthy();
  });

  it('renders every paragraph in block.paragraphs', () => {
    render(<PalizziMembershipBlockRender block={baseBlock} />);
    expect(screen.getByText('First paragraph copy.')).toBeTruthy();
    expect(screen.getByText('Second paragraph copy.')).toBeTruthy();
  });

  it('renders no paragraphs when paragraphs array is empty', () => {
    const { container } = render(
      <PalizziMembershipBlockRender block={{ ...baseBlock, paragraphs: [] }} />
    );
    // <section> wraps inner card; inner card paragraphs would be the .map output —
    // confirm the rest of the static text still renders without throwing.
    expect(container.querySelector('section#membership')).toBeTruthy();
    expect(screen.getByText('A highlighted invitation.')).toBeTruthy();
  });

  it('renders the wrapping <section id="membership">', () => {
    const { container } = render(<PalizziMembershipBlockRender block={baseBlock} />);
    const section = container.querySelector('section#membership');
    expect(section).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// PalizziRulesBlockRender
// ---------------------------------------------------------------------------

describe('PalizziRulesBlockRender', () => {
  const baseBlock = {
    id: 'r1',
    type: 'palizzi-rules',
    overline: 'House Rules',
    title: 'A Quiet',
    titleAccent: 'Sanctuary',
    hoursTitle: 'Open 6pm-Late',
    hoursSubtitle: 'Tuesday — Saturday',
    badges: ['Reservations', 'Members'],
    rules: ['No phones at the bar.', 'Dress to dine.', 'Honor your reservation.'],
    disclaimer: 'Management reserves the right to refuse service.',
  } as any;

  it('renders overline, title with accent, hours, disclaimer', () => {
    const { container } = render(<PalizziRulesBlockRender block={baseBlock} />);
    expect(screen.getByText('House Rules')).toBeTruthy();
    const h2 = container.querySelector('h2');
    expect(h2!.textContent).toContain('A Quiet');
    expect(h2!.textContent).toContain('Sanctuary');
    expect(screen.getByText('Open 6pm-Late')).toBeTruthy();
    expect(screen.getByText('Tuesday — Saturday')).toBeTruthy();
    expect(
      screen.getByText('Management reserves the right to refuse service.')
    ).toBeTruthy();
  });

  it('renders every badge in block.badges', () => {
    render(<PalizziRulesBlockRender block={baseBlock} />);
    expect(screen.getByText('Reservations')).toBeTruthy();
    expect(screen.getByText('Members')).toBeTruthy();
  });

  it('numbers rules with a zero-padded two-digit index', () => {
    const { container } = render(<PalizziRulesBlockRender block={baseBlock} />);
    // rules render as siblings: a numeric span + a <p> with the rule text.
    expect(screen.getByText('01')).toBeTruthy();
    expect(screen.getByText('02')).toBeTruthy();
    expect(screen.getByText('03')).toBeTruthy();
    expect(screen.getByText('No phones at the bar.')).toBeTruthy();
    expect(screen.getByText('Dress to dine.')).toBeTruthy();
    expect(screen.getByText('Honor your reservation.')).toBeTruthy();
    // every rule has a corresponding number — three rules => three numbers
    const numberSpans = Array.from(container.querySelectorAll('span')).filter((s) =>
      /^0\d$/.test(s.textContent || '')
    );
    expect(numberSpans.length).toBe(3);
  });

  it('only renders separator dots between badges (i > 0)', () => {
    const { container } = render(
      <PalizziRulesBlockRender block={{ ...baseBlock, badges: ['One', 'Two', 'Three'] }} />
    );
    // Each separator is a tiny <span> with a 4px round background — we count
    // them by their inline styles. With three badges, two separators appear.
    const allSpans = Array.from(container.querySelectorAll('span'));
    const dots = allSpans.filter((s) => {
      const style = s.getAttribute('style') || '';
      return style.includes('border-radius: 50%') && style.includes('4px');
    });
    expect(dots.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// VideoBlockPreview
// ---------------------------------------------------------------------------

describe('VideoBlockPreview', () => {
  it('shows the empty-state when no URL is provided', () => {
    const { container } = render(
      <VideoBlockPreview
        block={{ id: 'v1', type: 'video', url: '' } as any}
        isSelected={false}
        onChange={vi.fn()}
      />
    );
    // Empty-state marker copy
    expect(screen.getByText('No video URL provided')).toBeTruthy();
    // No <video> element should be in the DOM yet
    expect(container.querySelector('video')).toBeNull();
  });

  it('renders a <video> element when block.url is set', () => {
    const { container } = render(
      <VideoBlockPreview
        block={
          {
            id: 'v2',
            type: 'video',
            url: 'https://cdn.example.com/clip.mp4',
          } as any
        }
        isSelected={false}
        onChange={vi.fn()}
      />
    );
    const video = container.querySelector('video');
    expect(video).toBeTruthy();
    expect(video!.getAttribute('src')).toBe('https://cdn.example.com/clip.mp4');
    // controls default to true when not explicitly false
    expect(video!.hasAttribute('controls')).toBe(true);
    // autoplay defaults to false => attribute missing
    expect(video!.hasAttribute('autoplay')).toBe(false);
  });

  it('hides controls when block.controls is explicitly false', () => {
    const { container } = render(
      <VideoBlockPreview
        block={
          { id: 'v3', type: 'video', url: 'x.mp4', controls: false } as any
        }
        isSelected={false}
        onChange={vi.fn()}
      />
    );
    const video = container.querySelector('video')!;
    expect(video.hasAttribute('controls')).toBe(false);
  });

  it('renders a caption beneath the video when provided', () => {
    render(
      <VideoBlockPreview
        block={
          {
            id: 'v4',
            type: 'video',
            url: 'x.mp4',
            caption: 'A lovely caption',
          } as any
        }
        isSelected={false}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText('A lovely caption')).toBeTruthy();
  });

  it('omits the caption element when no caption is provided', () => {
    const { container } = render(
      <VideoBlockPreview
        block={{ id: 'v5', type: 'video', url: 'x.mp4' } as any}
        isSelected={false}
        onChange={vi.fn()}
      />
    );
    // Captions render inside a <p> with italic class — confirm none present
    expect(container.querySelector('p.italic')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ContentTypeSelect
// ---------------------------------------------------------------------------

describe('ContentTypeSelect', () => {
  const makeOption = (
    id: number,
    slug: string,
    name: string
  ) => ({
    id,
    slug,
    name,
    icon: null,
    description: null,
    websiteId: null,
    active: true,
  });

  it('renders one <option> per content type and selects the current value', () => {
    const types = [
      makeOption(1, 'page', 'Page'),
      makeOption(2, 'post', 'Blog Post'),
      makeOption(3, 'recipe', 'Recipe'),
    ];
    const { container } = render(
      <ContentTypeSelect value="post" contentTypes={types} onChange={vi.fn()} />
    );
    const options = Array.from(container.querySelectorAll('option'));
    // value is already in the list => no fallback option appended
    expect(options.length).toBe(3);
    expect(options.map((o) => o.getAttribute('value'))).toEqual([
      'page',
      'post',
      'recipe',
    ]);
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('post');
  });

  it('emits onChange with the new slug when selection changes', () => {
    const types = [
      makeOption(1, 'page', 'Page'),
      makeOption(2, 'post', 'Blog Post'),
    ];
    const onChange = vi.fn();
    const { container } = render(
      <ContentTypeSelect value="page" contentTypes={types} onChange={onChange} />
    );
    const select = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'post' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('post');
  });

  it('renders a fallback option when value is unknown to contentTypes', () => {
    const types = [makeOption(1, 'page', 'Page')];
    const { container } = render(
      <ContentTypeSelect value="ghost-type" contentTypes={types} onChange={vi.fn()} />
    );
    const options = Array.from(container.querySelectorAll('option'));
    // Fallback "ghost-type" option prepended so the <select> isn't empty-valued
    expect(options.length).toBe(2);
    expect(options[0].getAttribute('value')).toBe('ghost-type');
    expect(options[0].textContent).toBe('ghost-type');
  });

  it('falls back to a generic "Page" option when list is empty and value is unknown', () => {
    const { container } = render(
      <ContentTypeSelect value="" contentTypes={[]} onChange={vi.fn()} />
    );
    const options = Array.from(container.querySelectorAll('option'));
    // value is falsy so no fallback-by-value option, but the empty-list +
    // unknown-value branch appends a single <option value="page">Page</option>
    expect(options.length).toBe(1);
    expect(options[0].getAttribute('value')).toBe('page');
    expect(options[0].textContent).toBe('Page');
  });

  it('applies the passed className to the underlying <select>', () => {
    const { container } = render(
      <ContentTypeSelect
        value="page"
        contentTypes={[makeOption(1, 'page', 'Page')]}
        onChange={vi.fn()}
        className="custom-class"
      />
    );
    const select = container.querySelector('select')!;
    expect(select.className).toContain('custom-class');
  });
});
