// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------
import { HeadingBlockEdit } from '@/components/blocks/edit/HeadingBlockEdit';
import { TextBlockEdit } from '@/components/blocks/edit/TextBlockEdit';
import { ButtonBlockEdit } from '@/components/blocks/edit/ButtonBlockEdit';
import { CtaBlockEdit } from '@/components/blocks/edit/CtaBlockEdit';

import type {
  HeadingBlock,
  TextBlock,
} from '@/types/blocks/content';
import type { ButtonBlock } from '@/types/blocks/form';
import type { CtaBlock } from '@/types/blocks/components';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const baseHeading: HeadingBlock = {
  id: 'h1',
  type: 'heading',
  order: 0,
  content: 'Hello world',
  level: 2,
};

const baseText: TextBlock = {
  id: 't1',
  type: 'text',
  order: 0,
  content: 'Some paragraph',
};

const baseButton: ButtonBlock = {
  id: 'btn1',
  type: 'button',
  order: 0,
  text: 'Click me',
  url: 'https://example.com',
};

const baseCta: CtaBlock = {
  id: 'cta1',
  type: 'cta',
  order: 0,
  title: 'Ready?',
  primaryButtonText: 'Go',
  primaryButtonUrl: '/start',
};

// ---------------------------------------------------------------------------
// HeadingBlockEdit
// ---------------------------------------------------------------------------
describe('HeadingBlockEdit', () => {
  it('renders all three controls with current values', () => {
    const onChange = vi.fn();
    const { container } = render(
      <HeadingBlockEdit
        block={{ ...baseHeading, content: 'Greetings', level: 3, alignment: 'center' }}
        onChange={onChange}
      />,
    );
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input.value).toBe('Greetings');

    const selects = container.querySelectorAll('select');
    expect(selects.length).toBe(2);
    expect((selects[0] as HTMLSelectElement).value).toBe('3');
    expect((selects[1] as HTMLSelectElement).value).toBe('center');
  });

  it('defaults alignment to "left" when not supplied', () => {
    const onChange = vi.fn();
    const { container } = render(
      <HeadingBlockEdit block={baseHeading} onChange={onChange} />,
    );
    const selects = container.querySelectorAll('select');
    expect((selects[1] as HTMLSelectElement).value).toBe('left');
  });

  it('emits onChange with updated content', () => {
    const onChange = vi.fn();
    const { container } = render(
      <HeadingBlockEdit block={baseHeading} onChange={onChange} />,
    );
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'New heading' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual({ ...baseHeading, content: 'New heading' });
  });

  it('parses the level select into a number', () => {
    const onChange = vi.fn();
    const { container } = render(
      <HeadingBlockEdit block={baseHeading} onChange={onChange} />,
    );
    const levelSelect = container.querySelectorAll('select')[0] as HTMLSelectElement;
    fireEvent.change(levelSelect, { target: { value: '5' } });
    expect(onChange).toHaveBeenCalledWith({ ...baseHeading, level: 5 });
  });

  it('updates alignment via the second select', () => {
    const onChange = vi.fn();
    const { container } = render(
      <HeadingBlockEdit block={baseHeading} onChange={onChange} />,
    );
    const alignSelect = container.querySelectorAll('select')[1] as HTMLSelectElement;
    fireEvent.change(alignSelect, { target: { value: 'right' } });
    expect(onChange).toHaveBeenCalledWith({ ...baseHeading, alignment: 'right' });
  });
});

// ---------------------------------------------------------------------------
// TextBlockEdit
// ---------------------------------------------------------------------------
describe('TextBlockEdit', () => {
  it('renders the textarea with content and default selects', () => {
    const onChange = vi.fn();
    const { container } = render(
      <TextBlockEdit block={baseText} onChange={onChange} />,
    );
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Some paragraph');

    const selects = container.querySelectorAll('select');
    // defaults: alignment=left, size=base
    expect((selects[0] as HTMLSelectElement).value).toBe('left');
    expect((selects[1] as HTMLSelectElement).value).toBe('base');
  });

  it('reflects supplied alignment + size values', () => {
    const onChange = vi.fn();
    const { container } = render(
      <TextBlockEdit
        block={{ ...baseText, alignment: 'center', size: 'lg' }}
        onChange={onChange}
      />,
    );
    const selects = container.querySelectorAll('select');
    expect((selects[0] as HTMLSelectElement).value).toBe('center');
    expect((selects[1] as HTMLSelectElement).value).toBe('lg');
  });

  it('emits content updates from the textarea', () => {
    const onChange = vi.fn();
    const { container } = render(
      <TextBlockEdit block={baseText} onChange={onChange} />,
    );
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Updated' } });
    expect(onChange).toHaveBeenCalledWith({ ...baseText, content: 'Updated' });
  });

  it('emits size updates from the size select', () => {
    const onChange = vi.fn();
    const { container } = render(
      <TextBlockEdit block={baseText} onChange={onChange} />,
    );
    const sizeSelect = container.querySelectorAll('select')[1] as HTMLSelectElement;
    fireEvent.change(sizeSelect, { target: { value: 'xl' } });
    expect(onChange).toHaveBeenCalledWith({ ...baseText, size: 'xl' });
  });

  it('emits alignment updates from the alignment select', () => {
    const onChange = vi.fn();
    const { container } = render(
      <TextBlockEdit block={baseText} onChange={onChange} />,
    );
    const alignSelect = container.querySelectorAll('select')[0] as HTMLSelectElement;
    fireEvent.change(alignSelect, { target: { value: 'right' } });
    expect(onChange).toHaveBeenCalledWith({ ...baseText, alignment: 'right' });
  });
});

// ---------------------------------------------------------------------------
// ButtonBlockEdit
// ---------------------------------------------------------------------------
describe('ButtonBlockEdit', () => {
  it('renders all required text inputs and selects', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ButtonBlockEdit block={baseButton} onChange={onChange} />,
    );
    const inputs = container.querySelectorAll('input');
    // text, url, icon (3 text-ish inputs), plus 1 checkbox
    const textInputs = container.querySelectorAll('input[type="text"], input[type="url"]');
    expect(textInputs.length).toBe(3);
    const selects = container.querySelectorAll('select');
    // variant, size, alignment, iconPosition, hoverEffect => 5
    expect(selects.length).toBe(5);
    // 1 checkbox
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBe(1);
    expect(inputs.length).toBeGreaterThanOrEqual(4);
  });

  it('reflects defaults when optional fields are missing', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ButtonBlockEdit block={baseButton} onChange={onChange} />,
    );
    const selects = container.querySelectorAll('select');
    expect((selects[0] as HTMLSelectElement).value).toBe('primary'); // variant
    expect((selects[1] as HTMLSelectElement).value).toBe('md'); // size
    expect((selects[2] as HTMLSelectElement).value).toBe('left'); // alignment
    expect((selects[3] as HTMLSelectElement).value).toBe('left'); // iconPosition
    expect((selects[4] as HTMLSelectElement).value).toBe('none'); // hoverEffect
    const cb = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(cb.checked).toBe(false);
  });

  it('updates text via the first text input', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ButtonBlockEdit block={baseButton} onChange={onChange} />,
    );
    const textInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(textInput, { target: { value: 'New label' } });
    expect(onChange).toHaveBeenCalledWith({ ...baseButton, text: 'New label' });
  });

  it('updates the url via the url input', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ButtonBlockEdit block={baseButton} onChange={onChange} />,
    );
    const urlInput = container.querySelector('input[type="url"]') as HTMLInputElement;
    fireEvent.change(urlInput, { target: { value: 'https://new.test' } });
    expect(onChange).toHaveBeenCalledWith({ ...baseButton, url: 'https://new.test' });
  });

  it('updates the variant via the first select', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ButtonBlockEdit block={baseButton} onChange={onChange} />,
    );
    const variantSelect = container.querySelectorAll('select')[0] as HTMLSelectElement;
    fireEvent.change(variantSelect, { target: { value: 'outline' } });
    expect(onChange).toHaveBeenCalledWith({ ...baseButton, variant: 'outline' });
  });

  it('updates size and alignment', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ButtonBlockEdit block={baseButton} onChange={onChange} />,
    );
    const selects = container.querySelectorAll('select');
    fireEvent.change(selects[1] as HTMLSelectElement, { target: { value: 'lg' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...baseButton, size: 'lg' });
    fireEvent.change(selects[2] as HTMLSelectElement, { target: { value: 'center' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...baseButton, alignment: 'center' });
  });

  it('sets icon when input has value and clears to undefined when emptied', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ButtonBlockEdit
        block={{ ...baseButton, icon: 'star' }}
        onChange={onChange}
      />,
    );
    // The icon input is the 3rd text input
    const textInputs = container.querySelectorAll(
      'input[type="text"], input[type="url"]',
    );
    const iconInput = textInputs[2] as HTMLInputElement;
    expect(iconInput.value).toBe('star');

    fireEvent.change(iconInput, { target: { value: 'home' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...baseButton, icon: 'home' });

    fireEvent.change(iconInput, { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...baseButton, icon: undefined });
  });

  it('updates iconPosition and hoverEffect', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ButtonBlockEdit block={baseButton} onChange={onChange} />,
    );
    const selects = container.querySelectorAll('select');
    fireEvent.change(selects[3] as HTMLSelectElement, { target: { value: 'right' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...baseButton, iconPosition: 'right' });
    fireEvent.change(selects[4] as HTMLSelectElement, { target: { value: 'glow' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...baseButton, hoverEffect: 'glow' });
  });

  it('toggles the openInNewTab checkbox', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ButtonBlockEdit block={baseButton} onChange={onChange} />,
    );
    const cb = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(cb);
    expect(onChange).toHaveBeenCalledWith({ ...baseButton, openInNewTab: true });
  });

  it('uses the block id when constructing the new-tab label htmlFor', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ButtonBlockEdit
        block={{ ...baseButton, id: 'btn-xyz' }}
        onChange={onChange}
      />,
    );
    const cb = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(cb.id).toBe('open-new-tab-btn-xyz');
    const label = container.querySelector('label[for="open-new-tab-btn-xyz"]');
    expect(label).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// CtaBlockEdit
// ---------------------------------------------------------------------------
describe('CtaBlockEdit', () => {
  it('renders the title, description, and both button text/url inputs', () => {
    const onChange = vi.fn();
    const { container } = render(
      <CtaBlockEdit
        block={{
          ...baseCta,
          description: 'Sub',
          secondaryButtonText: 'Maybe',
          secondaryButtonUrl: '/maybe',
          backgroundStyle: 'solid',
        }}
        onChange={onChange}
      />,
    );
    const inputs = container.querySelectorAll('input[type="text"]');
    // title, primaryText, primaryUrl, secondaryText, secondaryUrl => 5
    expect(inputs.length).toBe(5);
    const textareas = container.querySelectorAll('textarea');
    expect(textareas.length).toBe(1);
    expect((textareas[0] as HTMLTextAreaElement).value).toBe('Sub');

    const selects = container.querySelectorAll('select');
    expect(selects.length).toBe(1);
    expect((selects[0] as HTMLSelectElement).value).toBe('solid');
  });

  it('defaults backgroundStyle to "gradient" when not provided', () => {
    const onChange = vi.fn();
    const { container } = render(
      <CtaBlockEdit block={baseCta} onChange={onChange} />,
    );
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('gradient');
  });

  it('updates title on first text input change', () => {
    const onChange = vi.fn();
    const { container } = render(
      <CtaBlockEdit block={baseCta} onChange={onChange} />,
    );
    const inputs = container.querySelectorAll('input[type="text"]');
    fireEvent.change(inputs[0] as HTMLInputElement, { target: { value: 'New title' } });
    expect(onChange).toHaveBeenCalledWith({ ...baseCta, title: 'New title' });
  });

  it('updates description via the textarea', () => {
    const onChange = vi.fn();
    const { container } = render(
      <CtaBlockEdit block={baseCta} onChange={onChange} />,
    );
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'New desc' } });
    expect(onChange).toHaveBeenCalledWith({ ...baseCta, description: 'New desc' });
  });

  it('updates primary + secondary button fields', () => {
    const onChange = vi.fn();
    const { container } = render(
      <CtaBlockEdit block={baseCta} onChange={onChange} />,
    );
    const inputs = container.querySelectorAll('input[type="text"]');
    // [0]=title, [1]=primaryText, [2]=primaryUrl, [3]=secondaryText, [4]=secondaryUrl
    fireEvent.change(inputs[1] as HTMLInputElement, { target: { value: 'Sign up' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...baseCta, primaryButtonText: 'Sign up' });

    fireEvent.change(inputs[2] as HTMLInputElement, { target: { value: '/signup' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...baseCta, primaryButtonUrl: '/signup' });

    fireEvent.change(inputs[3] as HTMLInputElement, { target: { value: 'Demo' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...baseCta, secondaryButtonText: 'Demo' });

    fireEvent.change(inputs[4] as HTMLInputElement, { target: { value: '/demo' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...baseCta, secondaryButtonUrl: '/demo' });
  });

  it('updates the background style select', () => {
    const onChange = vi.fn();
    const { container } = render(
      <CtaBlockEdit block={baseCta} onChange={onChange} />,
    );
    const select = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'none' } });
    expect(onChange).toHaveBeenCalledWith({ ...baseCta, backgroundStyle: 'none' });
  });
});
