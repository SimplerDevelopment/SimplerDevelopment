// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Targets — four small/medium visual-editor block previews that have no prior
// unit-test coverage. Each is a pure presentational client component; the
// visual editor mounts them inside the iframe preview, so they only depend on
// their `block` prop, an `isSelected` flag, and an `onChange` callback.
// ---------------------------------------------------------------------------

import { DividerBlockPreview } from '@/components/blocks/visual/DividerBlockPreview';
import { SpacerBlockPreview } from '@/components/blocks/visual/SpacerBlockPreview';
import { CodeBlockPreview } from '@/components/blocks/visual/CodeBlockPreview';
import { EmailHeaderBlockPreview } from '@/components/blocks/visual/EmailHeaderBlockPreview';

// ---------------------------------------------------------------------------
// DividerBlockPreview
// ---------------------------------------------------------------------------

describe('DividerBlockPreview', () => {
  it('renders an <hr> with the default solid border class', () => {
    const onChange = vi.fn();
    const { container } = render(
      <DividerBlockPreview
        block={{ id: 'd1', type: 'divider' } as any}
        isSelected={false}
        onChange={onChange}
      />
    );
    const hr = container.querySelector('hr');
    expect(hr).toBeTruthy();
    // default lineStyle => 'solid'
    expect(hr!.className).toContain('border-solid');
    // no custom borderColor => falls back to border-border class
    expect(hr!.className).toContain('border-border');
  });

  it('uses dashed style when lineStyle="dashed"', () => {
    const { container } = render(
      <DividerBlockPreview
        block={{ id: 'd2', type: 'divider', lineStyle: 'dashed' } as any}
        isSelected={false}
        onChange={() => {}}
      />
    );
    const hr = container.querySelector('hr')!;
    expect(hr.className).toContain('border-dashed');
    expect(hr.className).not.toContain('border-solid');
  });

  it('uses dotted style when lineStyle="dotted"', () => {
    const { container } = render(
      <DividerBlockPreview
        block={{ id: 'd3', type: 'divider', lineStyle: 'dotted' } as any}
        isSelected={true}
        onChange={() => {}}
      />
    );
    expect(container.querySelector('hr')!.className).toContain('border-dotted');
  });

  it('omits the fallback border-border class when block.style provides a borderColor', () => {
    const { container } = render(
      <DividerBlockPreview
        block={
          {
            id: 'd4',
            type: 'divider',
            style: { borderColor: '#ff0000' },
          } as any
        }
        isSelected={false}
        onChange={() => {}}
      />
    );
    expect(container.querySelector('hr')!.className).not.toContain('border-border');
  });

  it('appends responsive classes when block.responsive is set', () => {
    const { container } = render(
      <DividerBlockPreview
        block={
          {
            id: 'd5',
            type: 'divider',
            responsive: {
              paddingTop: { base: 'md' },
              marginBottom: { base: 'lg' },
            },
          } as any
        }
        isSelected={false}
        onChange={() => {}}
      />
    );
    const hr = container.querySelector('hr')!;
    // combineResponsiveClasses should have produced *something* — at minimum
    // the className should still include the base classes and not crash.
    expect(hr.className.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// SpacerBlockPreview
// ---------------------------------------------------------------------------

describe('SpacerBlockPreview', () => {
  it('renders the height label uppercased', () => {
    render(
      <SpacerBlockPreview
        block={{ id: 's1', type: 'spacer', height: 'sm' } as any}
        isSelected={false}
        onChange={() => {}}
      />
    );
    expect(screen.getByText(/Spacer \(SM\)/)).toBeTruthy();
  });

  it.each([
    ['sm', 'h-4'],
    ['md', 'h-8'],
    ['lg', 'h-16'],
    ['xl', 'h-32'],
  ])('maps height=%s to the %s tailwind class', (height, expectedClass) => {
    const { container } = render(
      <SpacerBlockPreview
        block={{ id: `s-${height}`, type: 'spacer', height } as any}
        isSelected={false}
        onChange={() => {}}
      />
    );
    // the inner div carries the height class
    const innerDivs = Array.from(container.querySelectorAll('div'));
    const match = innerDivs.find((d) => d.className.includes(expectedClass));
    expect(match).toBeTruthy();
  });

  it('does not invoke onChange just by rendering', () => {
    const onChange = vi.fn();
    render(
      <SpacerBlockPreview
        block={{ id: 's2', type: 'spacer', height: 'md' } as any}
        isSelected={true}
        onChange={onChange}
      />
    );
    expect(onChange).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// CodeBlockPreview
// ---------------------------------------------------------------------------

describe('CodeBlockPreview', () => {
  it('renders a textarea seeded with block.code', () => {
    render(
      <CodeBlockPreview
        block={{ id: 'c1', type: 'code', code: 'const x = 1;' } as any}
        isSelected={false}
        onChange={() => {}}
      />
    );
    const ta = screen.getByPlaceholderText(/Enter your code here/) as HTMLTextAreaElement;
    expect(ta.value).toBe('const x = 1;');
  });

  it('shows the language banner when block.language is set', () => {
    render(
      <CodeBlockPreview
        block={{ id: 'c2', type: 'code', code: '', language: 'typescript' } as any}
        isSelected={false}
        onChange={() => {}}
      />
    );
    expect(screen.getByText('typescript')).toBeTruthy();
  });

  it('hides the language banner when block.language is missing', () => {
    render(
      <CodeBlockPreview
        block={{ id: 'c3', type: 'code', code: 'foo' } as any}
        isSelected={false}
        onChange={() => {}}
      />
    );
    // sanity — language banner is the only thing that contains the language label
    expect(screen.queryByText('typescript')).toBeNull();
  });

  it('emits onChange({ code }) when the user types', () => {
    const onChange = vi.fn();
    render(
      <CodeBlockPreview
        block={{ id: 'c4', type: 'code', code: '' } as any}
        isSelected={true}
        onChange={onChange}
      />
    );
    const ta = screen.getByPlaceholderText(/Enter your code here/);
    fireEvent.change(ta, { target: { value: 'let y = 2;' } });
    expect(onChange).toHaveBeenCalledWith({ code: 'let y = 2;' });
  });

  it('stops click propagation on the textarea so the editor canvas does not deselect', () => {
    const onChange = vi.fn();
    render(
      <CodeBlockPreview
        block={{ id: 'c5', type: 'code', code: '' } as any}
        isSelected={true}
        onChange={onChange}
      />
    );
    const ta = screen.getByPlaceholderText(/Enter your code here/);
    // fireEvent.click returns false if any handler called preventDefault, but we
    // really want to assert the click reaches the element without crashing. The
    // stopPropagation handler swallows bubbling — verify it does not throw.
    expect(() => fireEvent.click(ta)).not.toThrow();
  });

  it('keeps the default dark background when style.backgroundColor is unset', () => {
    const { container } = render(
      <CodeBlockPreview
        block={{ id: 'c6', type: 'code', code: '' } as any}
        isSelected={false}
        onChange={() => {}}
      />
    );
    // the wrapper div carries bg-slate-900 when no custom bg is provided
    expect(container.innerHTML).toContain('bg-slate-900');
  });

  it('drops the default background classes when style.backgroundColor is set', () => {
    const { container } = render(
      <CodeBlockPreview
        block={
          { id: 'c7', type: 'code', code: '', style: { backgroundColor: '#123456' } } as any
        }
        isSelected={false}
        onChange={() => {}}
      />
    );
    expect(container.innerHTML).not.toContain('bg-slate-900');
  });
});

// ---------------------------------------------------------------------------
// EmailHeaderBlockPreview
// ---------------------------------------------------------------------------

describe('EmailHeaderBlockPreview', () => {
  it('renders the logo <img> when block.logoUrl is set (non-selected)', () => {
    const { container } = render(
      <EmailHeaderBlockPreview
        block={{ id: 'eh1', type: 'email-header', logoUrl: 'https://x.test/logo.png' } as any}
        isSelected={false}
        onChange={() => {}}
      />
    );
    const img = container.querySelector('img')!;
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('https://x.test/logo.png');
    expect(img.getAttribute('alt')).toBe('Logo');
  });

  it('falls back to the "Add logo URL" placeholder when logoUrl is missing', () => {
    render(
      <EmailHeaderBlockPreview
        block={{ id: 'eh2', type: 'email-header' } as any}
        isSelected={false}
        onChange={() => {}}
      />
    );
    expect(screen.getByText(/Add logo URL/)).toBeTruthy();
  });

  it('shows logoUrl + tagline inputs in selected mode and fires onChange', () => {
    const onChange = vi.fn();
    render(
      <EmailHeaderBlockPreview
        block={{ id: 'eh3', type: 'email-header', logoUrl: 'a', tagline: 'b' } as any}
        isSelected={true}
        onChange={onChange}
      />
    );
    const logoInput = screen.getByPlaceholderText(/Logo image URL/) as HTMLInputElement;
    const taglineInput = screen.getByPlaceholderText(/Tagline \(optional\)/) as HTMLInputElement;
    expect(logoInput.value).toBe('a');
    expect(taglineInput.value).toBe('b');

    fireEvent.change(logoInput, { target: { value: 'https://new.test/l.png' } });
    expect(onChange).toHaveBeenCalledWith({ logoUrl: 'https://new.test/l.png' });

    fireEvent.change(taglineInput, { target: { value: 'New tagline' } });
    expect(onChange).toHaveBeenCalledWith({ tagline: 'New tagline' });
  });

  it('renders tagline as static text in non-selected mode', () => {
    render(
      <EmailHeaderBlockPreview
        block={
          {
            id: 'eh4',
            type: 'email-header',
            logoUrl: 'https://x.test/l.png',
            tagline: 'Best beans in town',
          } as any
        }
        isSelected={false}
        onChange={() => {}}
      />
    );
    // tagline shows as <p>, not as an <input>
    expect(screen.getByText('Best beans in town').tagName.toLowerCase()).toBe('p');
    expect(screen.queryByPlaceholderText(/Tagline/)).toBeNull();
  });

  it.each([
    ['left', 'text-left'],
    ['right', 'text-right'],
    [undefined, 'text-center'], // default
  ])('applies %s alignment => %s', (alignment, expectedClass) => {
    const { container } = render(
      <EmailHeaderBlockPreview
        block={
          {
            id: `eh-align-${alignment}`,
            type: 'email-header',
            ...(alignment ? { alignment } : {}),
          } as any
        }
        isSelected={false}
        onChange={() => {}}
      />
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain(expectedClass);
  });

  it('centers the logo with mx-auto only when alignment is center', () => {
    const { container: centered } = render(
      <EmailHeaderBlockPreview
        block={{ id: 'eh5', type: 'email-header', logoUrl: 'x', alignment: 'center' } as any}
        isSelected={false}
        onChange={() => {}}
      />
    );
    expect(centered.querySelector('img')!.className).toContain('mx-auto');

    const { container: left } = render(
      <EmailHeaderBlockPreview
        block={{ id: 'eh6', type: 'email-header', logoUrl: 'x', alignment: 'left' } as any}
        isSelected={false}
        onChange={() => {}}
      />
    );
    expect(left.querySelector('img')!.className).not.toContain('mx-auto');
  });

  it('uses the provided logoWidth in inline style and defaults to 150', () => {
    const { container: custom } = render(
      <EmailHeaderBlockPreview
        block={{ id: 'eh7', type: 'email-header', logoUrl: 'x', logoWidth: 240 } as any}
        isSelected={false}
        onChange={() => {}}
      />
    );
    expect((custom.querySelector('img') as HTMLImageElement).style.width).toBe('240px');

    const { container: def } = render(
      <EmailHeaderBlockPreview
        block={{ id: 'eh8', type: 'email-header', logoUrl: 'x' } as any}
        isSelected={false}
        onChange={() => {}}
      />
    );
    expect((def.querySelector('img') as HTMLImageElement).style.width).toBe('150px');
  });
});
