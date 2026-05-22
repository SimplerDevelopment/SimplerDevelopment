// @vitest-environment jsdom
/**
 * Batch 42d — small email-builder components.
 *
 * Components covered:
 *   - EmailHeaderBlockPreview   (components/blocks/visual/EmailHeaderBlockPreview.tsx)
 *   - EmailFooterBlockPreview   (components/blocks/visual/EmailFooterBlockPreview.tsx)
 *   - SocialLinksBlockPreview   (components/blocks/visual/SocialLinksBlockPreview.tsx)
 *   - EmailBlockEditor          (components/email/EmailBlockEditor.tsx)
 *
 * Heavy deps (`SocialIcon`, the block editor context/inner) are mocked so we
 * exercise the wrappers' own conditionals (alignment, isSelected,
 * showUnsubscribe defaults, link add/remove, etc.).
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks for heavy deps
// ---------------------------------------------------------------------------

// SocialIcon — replace with a deterministic stub so we can assert per-platform.
vi.mock('@/lib/icons/social-icons', () => ({
  SocialIcon: ({ platform, size }: { platform: string; size: number }) =>
    React.createElement('i', {
      'data-testid': 'social-icon',
      'data-platform': platform,
      'data-size': String(size),
    }),
}));

// getElementCSS helper — return an empty style obj (covers no-styles branch).
vi.mock('@/lib/utils/elementStyles', () => ({
  getElementCSS: (_styles: any, _el: string) => ({}),
}));

// BlockEditorContext + EditorInner — stub so EmailBlockEditor renders cheaply.
vi.mock('@/contexts/BlockEditorContext', () => ({
  BlockEditorProvider: ({ children, initialBlocks, onBlocksChange, initialViewport }: any) =>
    React.createElement(
      'div',
      {
        'data-testid': 'block-editor-provider',
        'data-block-count': String(initialBlocks?.length ?? 0),
        'data-viewport': initialViewport,
        'data-has-onchange': String(typeof onBlocksChange === 'function'),
      },
      children,
    ),
}));

vi.mock('@/components/blocks/VisualBlockEditorEnhanced', () => ({
  EditorInner: ({ blockTypes, onChange }: any) =>
    React.createElement(
      'div',
      {
        'data-testid': 'editor-inner',
        'data-block-type-count': String(blockTypes?.length ?? 0),
        'data-has-onchange': String(typeof onChange === 'function'),
      },
      // Render the labels so we can assert the EMAIL_BLOCK_TYPE_LIST passed through.
      (blockTypes ?? []).map((b: any) =>
        React.createElement('span', { key: b.type, 'data-block-type': b.type }, b.label),
      ),
    ),
}));

// EMAIL_BLOCK_TYPES is just imported for its side-effect-free identity — stub it.
vi.mock('@/lib/email/email-block-types', () => ({
  EMAIL_BLOCK_TYPES: ['heading', 'text', 'image', 'button'],
}));

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------

import { EmailHeaderBlockPreview } from '@/components/blocks/visual/EmailHeaderBlockPreview';
import { EmailFooterBlockPreview } from '@/components/blocks/visual/EmailFooterBlockPreview';
import { SocialLinksBlockPreview } from '@/components/blocks/visual/SocialLinksBlockPreview';
import { EmailBlockEditor } from '@/components/email/EmailBlockEditor';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeEmailHeader(overrides: Partial<any> = {}) {
  return {
    id: 'hdr-1',
    type: 'email-header',
    ...overrides,
  };
}

function makeEmailFooter(overrides: Partial<any> = {}) {
  return {
    id: 'ftr-1',
    type: 'email-footer',
    ...overrides,
  };
}

function makeSocial(overrides: Partial<any> = {}) {
  return {
    id: 'soc-1',
    type: 'social-links',
    ...overrides,
  };
}

// ===========================================================================
// EmailHeaderBlockPreview
// ===========================================================================
describe('EmailHeaderBlockPreview', () => {
  it('renders placeholder when no logoUrl and not selected', () => {
    const { container } = render(
      <EmailHeaderBlockPreview
        block={makeEmailHeader()}
        isSelected={false}
        onChange={() => {}}
      />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('Add logo URL')).toBeInTheDocument();
  });

  it('renders the logo <img> when logoUrl provided, with default width 150', () => {
    const { container } = render(
      <EmailHeaderBlockPreview
        block={makeEmailHeader({ logoUrl: 'https://example.com/logo.png' })}
        isSelected={false}
        onChange={() => {}}
      />,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://example.com/logo.png');
    // width is set as inline style
    expect(img?.style.width).toBe('150px');
  });

  it('respects an explicit logoWidth', () => {
    const { container } = render(
      <EmailHeaderBlockPreview
        block={makeEmailHeader({ logoUrl: 'l.png', logoWidth: 240 })}
        isSelected={false}
        onChange={() => {}}
      />,
    );
    expect(container.querySelector('img')?.style.width).toBe('240px');
  });

  it.each([
    ['left', 'text-left'],
    ['center', 'text-center'],
    ['right', 'text-right'],
  ] as const)('applies alignment %s -> %s', (alignment, klass) => {
    const { container } = render(
      <EmailHeaderBlockPreview
        block={makeEmailHeader({ alignment, logoUrl: 'x.png' })}
        isSelected={false}
        onChange={() => {}}
      />,
    );
    expect(container.firstChild).toHaveClass(klass);
  });

  it('defaults alignment to center and centers the logo', () => {
    const { container } = render(
      <EmailHeaderBlockPreview
        block={makeEmailHeader({ logoUrl: 'x.png' })}
        isSelected={false}
        onChange={() => {}}
      />,
    );
    expect(container.firstChild).toHaveClass('text-center');
    expect(container.querySelector('img')).toHaveClass('mx-auto');
  });

  it('renders tagline (not selected) when present', () => {
    render(
      <EmailHeaderBlockPreview
        block={makeEmailHeader({ tagline: 'Hello world' })}
        isSelected={false}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('shows logo + url + tagline inputs when selected', () => {
    render(
      <EmailHeaderBlockPreview
        block={makeEmailHeader({ logoUrl: 'a.png', tagline: 't' })}
        isSelected
        onChange={() => {}}
      />,
    );
    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toHaveValue('a.png');
    expect(inputs[1]).toHaveValue('t');
  });

  it('does not render the no-selection tagline <p> when isSelected', () => {
    const { container } = render(
      <EmailHeaderBlockPreview
        block={makeEmailHeader({ tagline: 'should NOT render as p' })}
        isSelected
        onChange={() => {}}
      />,
    );
    // The tagline string only appears inside an input (value), not as <p> text.
    expect(container.querySelector('p')).toBeNull();
  });

  it('calls onChange with logoUrl when first input typed', () => {
    const onChange = vi.fn();
    render(
      <EmailHeaderBlockPreview
        block={makeEmailHeader()}
        isSelected
        onChange={onChange}
      />,
    );
    const [logoInput] = screen.getAllByRole('textbox');
    fireEvent.change(logoInput, { target: { value: 'new.png' } });
    expect(onChange).toHaveBeenCalledWith({ logoUrl: 'new.png' });
  });

  it('calls onChange with tagline when second input typed', () => {
    const onChange = vi.fn();
    render(
      <EmailHeaderBlockPreview
        block={makeEmailHeader()}
        isSelected
        onChange={onChange}
      />,
    );
    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[1], { target: { value: 'tagline-x' } });
    expect(onChange).toHaveBeenCalledWith({ tagline: 'tagline-x' });
  });

  it('placeholder has cursor-pointer when selected (for click-to-edit)', () => {
    const { container } = render(
      <EmailHeaderBlockPreview
        block={makeEmailHeader()}
        isSelected
        onChange={() => {}}
      />,
    );
    const placeholder = container.querySelector('.border-dashed');
    expect(placeholder).toHaveClass('cursor-pointer');
  });
});

// ===========================================================================
// EmailFooterBlockPreview
// ===========================================================================
describe('EmailFooterBlockPreview', () => {
  it('renders empty-state message when nothing populated and not selected', () => {
    render(
      <EmailFooterBlockPreview
        block={makeEmailFooter()}
        isSelected={false}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText('Email footer - click to edit')).toBeInTheDocument();
  });

  it('does NOT show empty-state if companyName populated', () => {
    render(
      <EmailFooterBlockPreview
        block={makeEmailFooter({ companyName: 'Acme' })}
        isSelected={false}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.queryByText('Email footer - click to edit')).toBeNull();
  });

  it('renders unsubscribe link by default (showUnsubscribe undefined => true)', () => {
    render(
      <EmailFooterBlockPreview
        block={makeEmailFooter({ companyName: 'Acme' })}
        isSelected={false}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Unsubscribe')).toBeInTheDocument();
  });

  it('hides unsubscribe when showUnsubscribe is explicitly false', () => {
    render(
      <EmailFooterBlockPreview
        block={makeEmailFooter({ companyName: 'Acme', showUnsubscribe: false })}
        isSelected={false}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText('Unsubscribe')).toBeNull();
  });

  it('shows view-in-browser link when enabled', () => {
    render(
      <EmailFooterBlockPreview
        block={makeEmailFooter({ companyName: 'Acme', showViewInBrowser: true })}
        isSelected={false}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('View in browser')).toBeInTheDocument();
  });

  it('renders address when provided', () => {
    render(
      <EmailFooterBlockPreview
        block={makeEmailFooter({ address: '1 Main St' })}
        isSelected={false}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('1 Main St')).toBeInTheDocument();
  });

  it('renders SocialIcon stubs in non-selected mode for each socialLink', () => {
    render(
      <EmailFooterBlockPreview
        block={makeEmailFooter({
          socialLinks: [
            { platform: 'twitter', url: 'x' },
            { platform: 'linkedin', url: 'y' },
          ],
        })}
        isSelected={false}
        onChange={() => {}}
      />,
    );
    const icons = screen.getAllByTestId('social-icon');
    expect(icons).toHaveLength(2);
    expect(icons[0]).toHaveAttribute('data-platform', 'twitter');
    expect(icons[1]).toHaveAttribute('data-platform', 'linkedin');
  });

  it('renders edit inputs and unsubscribe checkbox when selected', () => {
    render(
      <EmailFooterBlockPreview
        block={makeEmailFooter({ companyName: 'Acme', address: '1 Main' })}
        isSelected
        onChange={() => {}}
      />,
    );
    expect(screen.getByPlaceholderText('Company name')).toHaveValue('Acme');
    expect(screen.getByPlaceholderText('123 Main St, City, State ZIP')).toHaveValue('1 Main');
    const checkbox = screen.getByRole('checkbox');
    // default = true since showUnsubscribe undefined
    expect(checkbox).toBeChecked();
  });

  it('checkbox is unchecked when showUnsubscribe explicitly false', () => {
    render(
      <EmailFooterBlockPreview
        block={makeEmailFooter({ showUnsubscribe: false })}
        isSelected
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('calls onChange for company name input', () => {
    const onChange = vi.fn();
    render(
      <EmailFooterBlockPreview
        block={makeEmailFooter()}
        isSelected
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText('Company name'), {
      target: { value: 'NewCo' },
    });
    expect(onChange).toHaveBeenCalledWith({ companyName: 'NewCo' });
  });

  it('calls onChange for address input', () => {
    const onChange = vi.fn();
    render(
      <EmailFooterBlockPreview
        block={makeEmailFooter()}
        isSelected
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText('123 Main St, City, State ZIP'), {
      target: { value: '500 Elm' },
    });
    expect(onChange).toHaveBeenCalledWith({ address: '500 Elm' });
  });

  it('toggling unsubscribe checkbox triggers onChange with false', () => {
    const onChange = vi.fn();
    render(
      <EmailFooterBlockPreview
        block={makeEmailFooter()}
        isSelected
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith({ showUnsubscribe: false });
  });
});

// ===========================================================================
// SocialLinksBlockPreview
// ===========================================================================
describe('SocialLinksBlockPreview', () => {
  it('non-selected with no links shows empty CTA message', () => {
    render(
      <SocialLinksBlockPreview
        block={makeSocial()}
        isSelected={false}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Click to add social links')).toBeInTheDocument();
  });

  it('non-selected renders SocialIcon per link with default size 24', () => {
    render(
      <SocialLinksBlockPreview
        block={makeSocial({
          links: [
            { platform: 'twitter', url: 'a' },
            { platform: 'facebook', url: 'b' },
          ],
        })}
        isSelected={false}
        onChange={() => {}}
      />,
    );
    const icons = screen.getAllByTestId('social-icon');
    expect(icons).toHaveLength(2);
    expect(icons[0]).toHaveAttribute('data-size', '24');
  });

  it('uses block.iconSize when provided', () => {
    render(
      <SocialLinksBlockPreview
        block={makeSocial({ iconSize: 40, links: [{ platform: 'tiktok', url: 'a' }] })}
        isSelected={false}
        onChange={() => {}}
      />,
    );
    const icon = screen.getByTestId('social-icon');
    expect(icon).toHaveAttribute('data-size', '40');
  });

  it.each([
    ['left', 'justify-start'],
    ['center', 'justify-center'],
    ['right', 'justify-end'],
  ] as const)('applies alignment %s -> %s', (alignment, klass) => {
    const { container } = render(
      <SocialLinksBlockPreview
        block={makeSocial({ alignment, links: [] })}
        isSelected={false}
        onChange={() => {}}
      />,
    );
    expect(container.firstChild).toHaveClass(klass);
  });

  it('renders the human-readable platform label in sr-only', () => {
    render(
      <SocialLinksBlockPreview
        block={makeSocial({ links: [{ platform: 'twitter', url: '' }] })}
        isSelected={false}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('X (Twitter)')).toBeInTheDocument();
  });

  it('falls back to raw platform string for unknown labels', () => {
    render(
      <SocialLinksBlockPreview
        block={makeSocial({ links: [{ platform: 'mastodon', url: '' }] })}
        isSelected={false}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('mastodon')).toBeInTheDocument();
  });

  it('selected mode with no links shows the Add button + empty message', () => {
    render(
      <SocialLinksBlockPreview
        block={makeSocial()}
        isSelected
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Add')).toBeInTheDocument();
    expect(screen.getByText('Click to add social links')).toBeInTheDocument();
  });

  it('clicking Add appends the first unused platform', () => {
    const onChange = vi.fn();
    render(
      <SocialLinksBlockPreview
        block={makeSocial()}
        isSelected
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText('Add'));
    expect(onChange).toHaveBeenCalledWith({ links: [{ platform: 'facebook', url: '' }] });
  });

  it('Add button is hidden when all 6 platforms are present', () => {
    render(
      <SocialLinksBlockPreview
        block={makeSocial({
          links: [
            { platform: 'facebook', url: '' },
            { platform: 'twitter', url: '' },
            { platform: 'instagram', url: '' },
            { platform: 'linkedin', url: '' },
            { platform: 'youtube', url: '' },
            { platform: 'tiktok', url: '' },
          ],
        })}
        isSelected
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText('Add')).toBeNull();
  });

  it('selected mode renders a select + url input per link', () => {
    render(
      <SocialLinksBlockPreview
        block={makeSocial({
          links: [
            { platform: 'twitter', url: 'https://x.com/me' },
            { platform: 'linkedin', url: 'https://li/me' },
          ],
        })}
        isSelected
        onChange={() => {}}
      />,
    );
    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(2);
    expect(selects[0]).toHaveValue('twitter');
    expect(selects[1]).toHaveValue('linkedin');
  });

  it('typing in the url input fires onChange with merged links', () => {
    const onChange = vi.fn();
    render(
      <SocialLinksBlockPreview
        block={makeSocial({ links: [{ platform: 'twitter', url: 'old' }] })}
        isSelected
        onChange={onChange}
      />,
    );
    const input = screen.getByPlaceholderText('https://...');
    fireEvent.change(input, { target: { value: 'https://new' } });
    expect(onChange).toHaveBeenCalledWith({
      links: [{ platform: 'twitter', url: 'https://new' }],
    });
  });

  it('changing the select updates the platform of that row', () => {
    const onChange = vi.fn();
    render(
      <SocialLinksBlockPreview
        block={makeSocial({ links: [{ platform: 'twitter', url: 'x' }] })}
        isSelected
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'linkedin' } });
    expect(onChange).toHaveBeenCalledWith({
      links: [{ platform: 'linkedin', url: 'x' }],
    });
  });

  it('clicking the close (x) button removes the link', () => {
    const onChange = vi.fn();
    render(
      <SocialLinksBlockPreview
        block={makeSocial({
          links: [
            { platform: 'twitter', url: 'a' },
            { platform: 'linkedin', url: 'b' },
          ],
        })}
        isSelected
        onChange={onChange}
      />,
    );
    // The two remove buttons; click the first.
    const removeButtons = screen.getAllByText('close');
    fireEvent.click(removeButtons[0]);
    expect(onChange).toHaveBeenCalledWith({
      links: [{ platform: 'linkedin', url: 'b' }],
    });
  });
});

// ===========================================================================
// EmailBlockEditor
// ===========================================================================
describe('EmailBlockEditor', () => {
  it('mounts BlockEditorProvider with the initial blocks + desktop viewport', () => {
    const onChange = vi.fn();
    render(<EmailBlockEditor blocks={[{ id: '1', type: 'heading' } as any]} onChange={onChange} />);
    const provider = screen.getByTestId('block-editor-provider');
    expect(provider).toHaveAttribute('data-block-count', '1');
    expect(provider).toHaveAttribute('data-viewport', 'desktop');
    expect(provider).toHaveAttribute('data-has-onchange', 'true');
  });

  it('passes EMAIL_BLOCK_TYPE_LIST (12 entries) through to EditorInner', () => {
    render(<EmailBlockEditor blocks={[]} onChange={() => {}} />);
    const inner = screen.getByTestId('editor-inner');
    // EMAIL_BLOCK_TYPE_LIST in the component is 12 entries long.
    expect(inner).toHaveAttribute('data-block-type-count', '12');
  });

  it('passes onChange down to EditorInner', () => {
    render(<EmailBlockEditor blocks={[]} onChange={vi.fn()} />);
    expect(screen.getByTestId('editor-inner')).toHaveAttribute('data-has-onchange', 'true');
  });

  it('wraps EditorInner in a 600px max-width container (email canvas)', () => {
    const { container } = render(<EmailBlockEditor blocks={[]} onChange={() => {}} />);
    expect(container.querySelector('.max-w-\\[600px\\]')).not.toBeNull();
  });

  it('includes the email-specific block types in its list', () => {
    render(<EmailBlockEditor blocks={[]} onChange={() => {}} />);
    // EditorInner stub renders <span data-block-type=...> per entry.
    expect(document.querySelector('[data-block-type="email-header"]')).not.toBeNull();
    expect(document.querySelector('[data-block-type="email-footer"]')).not.toBeNull();
    expect(document.querySelector('[data-block-type="social-links"]')).not.toBeNull();
  });

  it('includes the basic content block types', () => {
    render(<EmailBlockEditor blocks={[]} onChange={() => {}} />);
    for (const t of ['heading', 'text', 'image', 'button', 'quote']) {
      expect(document.querySelector(`[data-block-type="${t}"]`)).not.toBeNull();
    }
  });

  it('includes the layout block types', () => {
    render(<EmailBlockEditor blocks={[]} onChange={() => {}} />);
    for (const t of ['spacer', 'divider', 'columns', 'section']) {
      expect(document.querySelector(`[data-block-type="${t}"]`)).not.toBeNull();
    }
  });
});
