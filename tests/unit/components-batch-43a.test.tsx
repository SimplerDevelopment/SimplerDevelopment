// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
// MediaPicker is a network-driven component (fetches from /api/portal/media,
// renders modals, etc). For the purposes of unit-testing the block edit forms
// we only care that the MediaPicker invokes its onChange when its consumer
// asks it to. Replace it with a minimal text input that surfaces the value +
// label and forwards onChange directly so we can drive it via fireEvent.
vi.mock('@/components/admin/MediaPicker', () => {
  return {
    default: ({
      value,
      onChange,
      label,
    }: {
      value?: string;
      onChange: (url: string) => void;
      label?: string;
      required?: boolean;
    }) => (
      <div data-testid={`media-picker-${label ?? 'unnamed'}`}>
        <span data-testid="mp-label">{label}</span>
        <input
          data-testid={`mp-input-${label ?? 'unnamed'}`}
          type="search"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    ),
  };
});

// ---------------------------------------------------------------------------
// Imports under test (must be after vi.mock)
// ---------------------------------------------------------------------------
import { HeroBlockEdit } from '@/components/blocks/edit/HeroBlockEdit';
import { ImageBlockEdit } from '@/components/blocks/edit/ImageBlockEdit';
import { ServicesGridBlockEdit } from '@/components/blocks/edit/ServicesGridBlockEdit';
import { HtmlEmbedBlockSettings } from '@/components/blocks/visual/block-settings/panels/HtmlEmbedSettings';

import type { HeroBlock, ServicesGridBlock } from '@/types/blocks/components';
import type { ImageBlock, HtmlEmbedBlock } from '@/types/blocks/media';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const baseHero: HeroBlock = {
  id: 'hero-1',
  type: 'hero',
  order: 0,
  title: 'Welcome',
};

const baseImage: ImageBlock = {
  id: 'img-1',
  type: 'image',
  order: 0,
  url: 'https://cdn.example/x.jpg',
  alt: 'A photo',
};

const baseServicesGrid: ServicesGridBlock = {
  id: 'sg-1',
  type: 'services-grid',
  order: 0,
  services: [
    { id: 'svc-a', title: 'Service A', description: 'Desc A' },
    { id: 'svc-b', title: 'Service B', description: 'Desc B' },
  ],
};

const baseHtmlEmbed: HtmlEmbedBlock = {
  id: 'he-1',
  type: 'html-embed',
  order: 0,
  url: '/api/media/proxy/foo.html',
};

// ---------------------------------------------------------------------------
// HeroBlockEdit
// ---------------------------------------------------------------------------
describe('HeroBlockEdit', () => {
  it('renders the title input wired to block.title', () => {
    const onChange = vi.fn();
    const { container } = render(<HeroBlockEdit block={baseHero} onChange={onChange} />);
    const titleInput = container.querySelectorAll('input[type="text"]')[0] as HTMLInputElement;
    expect(titleInput.value).toBe('Welcome');
  });

  it('renders optional fields as empty strings when undefined', () => {
    const onChange = vi.fn();
    const { container } = render(<HeroBlockEdit block={baseHero} onChange={onChange} />);
    const textInputs = container.querySelectorAll('input[type="text"]');
    // title, subtitle, ctaText, ctaLink, secondaryCtaText, secondaryCtaLink = 6 text inputs
    expect(textInputs.length).toBe(6);
    // [1]=subtitle, [2]=ctaText, [3]=ctaLink, [4]=secondaryCtaText, [5]=secondaryCtaLink
    for (let i = 1; i < textInputs.length; i++) {
      expect((textInputs[i] as HTMLInputElement).value).toBe('');
    }
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('');
  });

  it('reflects supplied optional values', () => {
    const onChange = vi.fn();
    const populated: HeroBlock = {
      ...baseHero,
      subtitle: 'Sub',
      description: 'Desc',
      ctaText: 'Go',
      ctaLink: '/go',
      secondaryCtaText: 'Learn',
      secondaryCtaLink: '/learn',
      backgroundImage: 'https://img/bg.jpg',
    };
    const { container } = render(<HeroBlockEdit block={populated} onChange={onChange} />);
    const textInputs = container.querySelectorAll('input[type="text"]');
    expect((textInputs[1] as HTMLInputElement).value).toBe('Sub');
    expect((textInputs[2] as HTMLInputElement).value).toBe('Go');
    expect((textInputs[3] as HTMLInputElement).value).toBe('/go');
    expect((textInputs[4] as HTMLInputElement).value).toBe('Learn');
    expect((textInputs[5] as HTMLInputElement).value).toBe('/learn');
    expect((container.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Desc');
    // Mocked MediaPicker shows the background image
    const mpInput = container.querySelector('[data-testid^="mp-input-"]') as HTMLInputElement;
    expect(mpInput.value).toBe('https://img/bg.jpg');
  });

  it('emits onChange when the title input changes', () => {
    const onChange = vi.fn();
    const { container } = render(<HeroBlockEdit block={baseHero} onChange={onChange} />);
    const titleInput = container.querySelectorAll('input[type="text"]')[0] as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Hello' } });
    expect(onChange).toHaveBeenCalledWith({ ...baseHero, title: 'Hello' });
  });

  it('emits onChange when subtitle and description change', () => {
    const onChange = vi.fn();
    const { container } = render(<HeroBlockEdit block={baseHero} onChange={onChange} />);
    const textInputs = container.querySelectorAll('input[type="text"]');
    fireEvent.change(textInputs[1] as HTMLInputElement, { target: { value: 'My subtitle' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...baseHero, subtitle: 'My subtitle' });

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Big desc' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...baseHero, description: 'Big desc' });
  });

  it('emits onChange for primary and secondary CTA fields', () => {
    const onChange = vi.fn();
    const { container } = render(<HeroBlockEdit block={baseHero} onChange={onChange} />);
    const textInputs = container.querySelectorAll('input[type="text"]');
    fireEvent.change(textInputs[2] as HTMLInputElement, { target: { value: 'CTA' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...baseHero, ctaText: 'CTA' });
    fireEvent.change(textInputs[3] as HTMLInputElement, { target: { value: '/cta' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...baseHero, ctaLink: '/cta' });
    fireEvent.change(textInputs[4] as HTMLInputElement, { target: { value: 'Second' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...baseHero, secondaryCtaText: 'Second' });
    fireEvent.change(textInputs[5] as HTMLInputElement, { target: { value: '/second' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...baseHero, secondaryCtaLink: '/second' });
  });

  it('forwards MediaPicker selection as backgroundImage updates', () => {
    const onChange = vi.fn();
    const { container } = render(<HeroBlockEdit block={baseHero} onChange={onChange} />);
    const mpInput = container.querySelector('[data-testid^="mp-input-"]') as HTMLInputElement;
    fireEvent.change(mpInput, { target: { value: 'https://img/new.jpg' } });
    expect(onChange).toHaveBeenLastCalledWith({
      ...baseHero,
      backgroundImage: 'https://img/new.jpg',
    });
  });
});

// ---------------------------------------------------------------------------
// ImageBlockEdit
// ---------------------------------------------------------------------------
describe('ImageBlockEdit', () => {
  it('renders alt input, caption input, width + alignment selects', () => {
    const onChange = vi.fn();
    const { container } = render(<ImageBlockEdit block={baseImage} onChange={onChange} />);

    const inputs = container.querySelectorAll('input[type="text"]');
    // [0]=alt, [1]=caption
    expect(inputs.length).toBe(2);
    expect((inputs[0] as HTMLInputElement).value).toBe('A photo');
    expect((inputs[1] as HTMLInputElement).value).toBe('');

    const selects = container.querySelectorAll('select');
    expect(selects.length).toBe(2);
    expect((selects[0] as HTMLSelectElement).value).toBe('full'); // default width
    expect((selects[1] as HTMLSelectElement).value).toBe('center'); // default alignment
  });

  it('reflects explicit width + alignment values', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ImageBlockEdit
        block={{ ...baseImage, width: 'small', alignment: 'right', caption: 'cap' }}
        onChange={onChange}
      />,
    );
    const selects = container.querySelectorAll('select');
    expect((selects[0] as HTMLSelectElement).value).toBe('small');
    expect((selects[1] as HTMLSelectElement).value).toBe('right');
    const inputs = container.querySelectorAll('input[type="text"]');
    expect((inputs[1] as HTMLInputElement).value).toBe('cap');
  });

  it('updates alt text', () => {
    const onChange = vi.fn();
    const { container } = render(<ImageBlockEdit block={baseImage} onChange={onChange} />);
    const altInput = container.querySelectorAll('input[type="text"]')[0] as HTMLInputElement;
    fireEvent.change(altInput, { target: { value: 'New alt' } });
    expect(onChange).toHaveBeenCalledWith({ ...baseImage, alt: 'New alt' });
  });

  it('updates caption', () => {
    const onChange = vi.fn();
    const { container } = render(<ImageBlockEdit block={baseImage} onChange={onChange} />);
    const captionInput = container.querySelectorAll('input[type="text"]')[1] as HTMLInputElement;
    fireEvent.change(captionInput, { target: { value: 'Some caption' } });
    expect(onChange).toHaveBeenCalledWith({ ...baseImage, caption: 'Some caption' });
  });

  it('updates width and alignment via the selects', () => {
    const onChange = vi.fn();
    const { container } = render(<ImageBlockEdit block={baseImage} onChange={onChange} />);
    const selects = container.querySelectorAll('select');
    fireEvent.change(selects[0] as HTMLSelectElement, { target: { value: 'large' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...baseImage, width: 'large' });
    fireEvent.change(selects[1] as HTMLSelectElement, { target: { value: 'left' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...baseImage, alignment: 'left' });
  });

  it('forwards MediaPicker selection as url updates', () => {
    const onChange = vi.fn();
    const { container } = render(<ImageBlockEdit block={baseImage} onChange={onChange} />);
    const mpInput = container.querySelector('[data-testid^="mp-input-"]') as HTMLInputElement;
    fireEvent.change(mpInput, { target: { value: 'https://new.example/y.jpg' } });
    expect(onChange).toHaveBeenLastCalledWith({
      ...baseImage,
      url: 'https://new.example/y.jpg',
    });
  });
});

// ---------------------------------------------------------------------------
// ServicesGridBlockEdit
// ---------------------------------------------------------------------------
describe('ServicesGridBlockEdit', () => {
  it('renders section title, description, columns select, and one row per service', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ServicesGridBlockEdit block={baseServicesGrid} onChange={onChange} />,
    );

    const inputs = container.querySelectorAll('input[type="text"]');
    expect((inputs[0] as HTMLInputElement).value).toBe(''); // empty title
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('');

    // Default columns = 3
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('3');

    // Each service is collapsed -> one button per service title plus the
    // "+ Add Service" trigger
    const buttons = container.querySelectorAll('button');
    const titles = Array.from(buttons).map((b) => b.textContent);
    expect(titles).toContain('Service A');
    expect(titles).toContain('Service B');
    expect(titles).toContain('+ Add Service');
  });

  it('reflects explicit columns and title/description', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ServicesGridBlockEdit
        block={{ ...baseServicesGrid, title: 'Our Stuff', description: 'Stuff desc', columns: 4 }}
        onChange={onChange}
      />,
    );
    const inputs = container.querySelectorAll('input[type="text"]');
    expect((inputs[0] as HTMLInputElement).value).toBe('Our Stuff');
    expect((container.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Stuff desc');
    expect((container.querySelector('select') as HTMLSelectElement).value).toBe('4');
  });

  it('updates the section title and description', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ServicesGridBlockEdit block={baseServicesGrid} onChange={onChange} />,
    );
    const titleInput = container.querySelectorAll('input[type="text"]')[0] as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'New Title' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...baseServicesGrid, title: 'New Title' });

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'New Desc' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...baseServicesGrid, description: 'New Desc' });
  });

  it('parses the columns select as an integer', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ServicesGridBlockEdit block={baseServicesGrid} onChange={onChange} />,
    );
    const select = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '2' } });
    expect(onChange).toHaveBeenCalledWith({ ...baseServicesGrid, columns: 2 });
    // Ensure it really is a number (not "2")
    expect(onChange.mock.calls.at(-1)?.[0].columns).toBe(2);
  });

  it('adds a new service with the same description scaffolding', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ServicesGridBlockEdit block={baseServicesGrid} onChange={onChange} />,
    );
    const addBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === '+ Add Service',
    ) as HTMLButtonElement;
    fireEvent.click(addBtn);
    const call = onChange.mock.calls.at(-1)?.[0] as ServicesGridBlock;
    expect(call.services.length).toBe(3);
    const added = call.services[2];
    expect(added.title).toBe('New Service');
    expect(added.description).toBe('Service description');
    expect(added.id.startsWith('service-')).toBe(true);
  });

  it('removes a service by index', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ServicesGridBlockEdit block={baseServicesGrid} onChange={onChange} />,
    );
    const removeBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Remove',
    ) as HTMLButtonElement;
    fireEvent.click(removeBtn);
    const call = onChange.mock.calls.at(-1)?.[0] as ServicesGridBlock;
    expect(call.services.length).toBe(1);
    expect(call.services[0].id).toBe('svc-b');
  });

  it('expands a service when its title button is clicked and allows editing its title', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ServicesGridBlockEdit block={baseServicesGrid} onChange={onChange} />,
    );
    const expandBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Service A',
    ) as HTMLButtonElement;
    fireEvent.click(expandBtn);
    // After expansion, the expanded service exposes its own title/desc inputs
    const inputs = container.querySelectorAll('input[type="text"]');
    // index 0 = section title, 1 = expanded service title, 2 = expanded service link, 3 = expanded service icon
    const expandedTitleInput = inputs[1] as HTMLInputElement;
    expect(expandedTitleInput.value).toBe('Service A');

    fireEvent.change(expandedTitleInput, { target: { value: 'Renamed A' } });
    const call = onChange.mock.calls.at(-1)?.[0] as ServicesGridBlock;
    expect(call.services[0].title).toBe('Renamed A');
    expect(call.services[1].title).toBe('Service B');
  });

  it('collapses a previously expanded service when the title button is clicked again', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ServicesGridBlockEdit block={baseServicesGrid} onChange={onChange} />,
    );
    const expandBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Service A',
    ) as HTMLButtonElement;
    fireEvent.click(expandBtn);
    expect(container.querySelectorAll('input[type="text"]').length).toBeGreaterThan(1);
    fireEvent.click(expandBtn);
    // Back to just the section title input
    expect(container.querySelectorAll('input[type="text"]').length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// HtmlEmbedBlockSettings
// ---------------------------------------------------------------------------
describe('HtmlEmbedBlockSettings', () => {
  beforeEach(() => {
    // Some defensive cleanup of any fetch left on the global between tests.
    // None of the assertions trigger a fetch, but the component declares one;
    // make sure we'd notice if that contract changed.
    // @ts-expect-error - jsdom global
    if (global.fetch) (global.fetch as any).mockClear?.();
  });

  it('renders url input, height input, width select, sandbox select, iframe title, and caption', () => {
    const onChange = vi.fn();
    const { container } = render(
      <HtmlEmbedBlockSettings block={baseHtmlEmbed} onChange={onChange} />,
    );
    const inputs = container.querySelectorAll('input[type="text"]');
    // url, height, iframeTitle, caption
    expect(inputs.length).toBe(4);
    expect((inputs[0] as HTMLInputElement).value).toBe('/api/media/proxy/foo.html');
    // default height 600px when not set
    expect((inputs[1] as HTMLInputElement).value).toBe('600px');
    expect((inputs[2] as HTMLInputElement).value).toBe('');
    expect((inputs[3] as HTMLInputElement).value).toBe('');

    const selects = container.querySelectorAll('select');
    // width, sandbox
    expect(selects.length).toBe(2);
    expect((selects[0] as HTMLSelectElement).value).toBe('full');
    expect((selects[1] as HTMLSelectElement).value).toBe('scripts');
  });

  it('reflects supplied values', () => {
    const onChange = vi.fn();
    const populated: HtmlEmbedBlock = {
      ...baseHtmlEmbed,
      height: '90vh',
      width: 'contained',
      sandbox: 'scripts-forms',
      iframeTitle: 'My iframe',
      caption: 'Cap',
    };
    const { container } = render(<HtmlEmbedBlockSettings block={populated} onChange={onChange} />);
    const inputs = container.querySelectorAll('input[type="text"]');
    expect((inputs[1] as HTMLInputElement).value).toBe('90vh');
    expect((inputs[2] as HTMLInputElement).value).toBe('My iframe');
    expect((inputs[3] as HTMLInputElement).value).toBe('Cap');
    const selects = container.querySelectorAll('select');
    expect((selects[0] as HTMLSelectElement).value).toBe('contained');
    expect((selects[1] as HTMLSelectElement).value).toBe('scripts-forms');
  });

  it('emits partial url updates from the url input', () => {
    const onChange = vi.fn();
    const { container } = render(
      <HtmlEmbedBlockSettings block={baseHtmlEmbed} onChange={onChange} />,
    );
    const urlInput = container.querySelectorAll('input[type="text"]')[0] as HTMLInputElement;
    fireEvent.change(urlInput, { target: { value: '/api/media/proxy/bar.html' } });
    // Settings panels emit `Partial<Block>`, not the full block
    expect(onChange).toHaveBeenCalledWith({ url: '/api/media/proxy/bar.html' });
  });

  it('emits height + iframeTitle + caption updates', () => {
    const onChange = vi.fn();
    const { container } = render(
      <HtmlEmbedBlockSettings block={baseHtmlEmbed} onChange={onChange} />,
    );
    const inputs = container.querySelectorAll('input[type="text"]');
    fireEvent.change(inputs[1] as HTMLInputElement, { target: { value: '900px' } });
    expect(onChange).toHaveBeenLastCalledWith({ height: '900px' });
    fireEvent.change(inputs[2] as HTMLInputElement, { target: { value: 'Title' } });
    expect(onChange).toHaveBeenLastCalledWith({ iframeTitle: 'Title' });
    fireEvent.change(inputs[3] as HTMLInputElement, { target: { value: 'Caption text' } });
    expect(onChange).toHaveBeenLastCalledWith({ caption: 'Caption text' });
  });

  it('emits width + sandbox updates from the selects', () => {
    const onChange = vi.fn();
    const { container } = render(
      <HtmlEmbedBlockSettings block={baseHtmlEmbed} onChange={onChange} />,
    );
    const selects = container.querySelectorAll('select');
    fireEvent.change(selects[0] as HTMLSelectElement, { target: { value: 'contained' } });
    expect(onChange).toHaveBeenLastCalledWith({ width: 'contained' });
    fireEvent.change(selects[1] as HTMLSelectElement, { target: { value: 'strict' } });
    expect(onChange).toHaveBeenLastCalledWith({ sandbox: 'strict' });
  });

  it('shows the filename in the drop zone when one is set, and a generic prompt when not', () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <HtmlEmbedBlockSettings block={baseHtmlEmbed} onChange={onChange} />,
    );
    // With a url present, the drop zone shows the filename fallback
    expect(container.textContent).toContain('uploaded.html');

    // Without a url, the drop-zone falls back to the upload prompt
    rerender(
      <HtmlEmbedBlockSettings
        block={{ ...baseHtmlEmbed, url: '' }}
        onChange={onChange}
      />,
    );
    expect(container.textContent).toContain('Drop an .html file');
  });

  it('uses the explicit filename when provided', () => {
    const onChange = vi.fn();
    const { container } = render(
      <HtmlEmbedBlockSettings
        block={{ ...baseHtmlEmbed, filename: 'demo.html' }}
        onChange={onChange}
      />,
    );
    expect(container.textContent).toContain('demo.html');
  });
});
