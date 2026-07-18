// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Lightweight StyleSettings stand-in. The real component pulls in dozens of
// dependencies (style-editor inputs, theme tokens, etc.) which we don't need
// to exercise here — ElementStyleEditor's own logic is the unit under test.
vi.mock('@/components/blocks/visual/StyleSettings', () => ({
  StyleSettings: ({ block, onChange, currentViewport }: {
    block: { id?: string; type?: string; style?: Record<string, unknown> };
    onChange: (u: { style?: Record<string, unknown> }) => void;
    currentViewport: string;
  }) => (
    <div data-testid="style-settings">
      <span data-testid="ss-block-type">{block?.type ?? ''}</span>
      <span data-testid="ss-viewport">{currentViewport}</span>
      <span data-testid="ss-style">{JSON.stringify(block?.style ?? {})}</span>
      <button
        type="button"
        data-testid="ss-emit"
        onClick={() => onChange({ style: { color: 'red' } })}
      >
        emit
      </button>
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Components under test
// ---------------------------------------------------------------------------

import { PresenceCursor } from '@/components/portal/visual-editor/PresenceCursor';
import { PresenceAvatars } from '@/components/portal/visual-editor/PresenceAvatars';
import { ElementStyleEditor } from '@/components/portal/visual-editor/ElementStyleEditor';
import { BlockContextMenu } from '@/components/portal/visual-editor/BlockContextMenu';

// ---------------------------------------------------------------------------
// PresenceCursor
// ---------------------------------------------------------------------------

describe('PresenceCursor', () => {
  it('positions the wrapper at the given coords and shows the peer name', () => {
    const { container } = render(
      <PresenceCursor x={120} y={42} color="#ff8800" name="Ada" />,
    );

    const wrap = container.firstElementChild as HTMLElement;
    expect(wrap).toBeTruthy();
    expect(wrap.style.left).toBe('120px');
    expect(wrap.style.top).toBe('42px');
    // React serializes the `aria-hidden` boolean prop to the string "true".
    expect(wrap.hasAttribute('aria-hidden')).toBe(true);
    expect(wrap.textContent).toContain('Ada');
  });

  it('uses the peer color for both the SVG fill and the label background', () => {
    const { container } = render(
      <PresenceCursor x={0} y={0} color="#aabbcc" name="Grace" />,
    );

    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('fill')).toBe('#aabbcc');

    // The label is the wrapper's second child (the first is the <svg/>).
    const wrap = container.firstElementChild as HTMLElement;
    const label = wrap.lastElementChild as HTMLElement;
    expect(label).toBeTruthy();
    expect(label.tagName.toLowerCase()).toBe('div');
    // jsdom normalizes hex colors to their rgb() equivalent in inline style
    // — verify the color flows through in either form.
    const styleAttr = label.getAttribute('style') ?? '';
    expect(
      styleAttr.includes('#aabbcc') || styleAttr.includes('rgb(170, 187, 204)'),
    ).toBe(true);
    expect(label.textContent).toBe('Grace');
  });
});

// ---------------------------------------------------------------------------
// PresenceAvatars
// ---------------------------------------------------------------------------

function peer(overrides: {
  clientId: string;
  name: string;
  color?: string;
  avatar?: string | null;
}) {
  return {
    clientId: overrides.clientId,
    user: {
      id: overrides.clientId,
      name: overrides.name,
      color: overrides.color ?? '#3366ff',
      avatar: overrides.avatar ?? null,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('PresenceAvatars', () => {
  it('returns null when there are no peers', () => {
    const { container } = render(<PresenceAvatars peers={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a fallback material-icons person glyph when peer has no avatar', () => {
    const { container } = render(
      <PresenceAvatars peers={[peer({ clientId: 'a', name: 'Ada' })]} />,
    );

    const wrapper = container.querySelector('[aria-label="Online collaborators"]');
    expect(wrapper).toBeTruthy();

    const icon = container.querySelector('span.material-icons');
    expect(icon?.textContent).toBe('person');

    // No <img> when avatar is absent
    expect(container.querySelector('img')).toBeNull();

    // Title tooltip surfaces the peer name
    const slot = container.querySelector('[title="Ada"]');
    expect(slot).toBeTruthy();
  });

  it('renders an <img> when the peer has an avatar URL', () => {
    const { container } = render(
      <PresenceAvatars
        peers={[peer({ clientId: 'b', name: 'Bea', avatar: 'https://x/y.png' })]}
      />,
    );
    const img = container.querySelector('img') as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img!.getAttribute('src')).toBe('https://x/y.png');
    expect(img!.getAttribute('alt')).toBe('Bea');
  });

  it('caps the visible avatars at 5 and renders a +N overflow pill', () => {
    const peers = Array.from({ length: 8 }, (_, i) =>
      peer({ clientId: `p${i}`, name: `Peer${i}` }),
    );
    const { container } = render(<PresenceAvatars peers={peers} />);

    // 5 visible avatar slots + 1 overflow slot = 6 direct children
    const wrapper = container.querySelector('[aria-label="Online collaborators"]');
    expect(wrapper?.children.length).toBe(6);

    // Overflow pill text: peers (8) - visible (5) = 3
    expect(container.textContent).toContain('+3');

    const overflow = container.querySelector('[title="3 more"]');
    expect(overflow).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// ElementStyleEditor
// ---------------------------------------------------------------------------

describe('ElementStyleEditor', () => {
  function makeBlock(type: string, extras: Record<string, unknown> = {}) {
    return {
      id: 'blk-1',
      type,
      props: {},
      style: { background: 'blue' },
      ...extras,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  it('falls through to flat StyleSettings for single-element block types', () => {
    const onChange = vi.fn();
    render(
      <ElementStyleEditor
        block={makeBlock('not-a-multi-element-type')}
        onChange={onChange}
        currentViewport="desktop"
      />,
    );

    // No element sub-tab bar
    expect(screen.queryByText('Title')).toBeNull();
    expect(screen.queryByText('Subtitle')).toBeNull();

    // StyleSettings rendered
    expect(screen.getByTestId('style-settings')).toBeTruthy();
    expect(screen.getByTestId('ss-viewport').textContent).toBe('desktop');
  });

  it('renders sub-tabs for multi-element blocks and starts on _block', () => {
    const onChange = vi.fn();
    render(
      <ElementStyleEditor
        block={makeBlock('hero')}
        onChange={onChange}
        currentViewport="mobile"
      />,
    );

    // Sub-tab labels for hero
    expect(screen.getByText('Block')).toBeTruthy();
    expect(screen.getByText('Title')).toBeTruthy();
    expect(screen.getByText('Subtitle')).toBeTruthy();

    // Block-level: style passed through is the block's own style
    expect(screen.getByTestId('ss-style').textContent).toContain('"background":"blue"');

    // Block-level emit hits onChange with style payload (block-level path)
    fireEvent.click(screen.getByTestId('ss-emit'));
    expect(onChange).toHaveBeenCalledWith({ style: { color: 'red' } });
  });

  it('switches to element-level styling and writes to elementStyles[key] on change', () => {
    const onChange = vi.fn();
    render(
      <ElementStyleEditor
        block={makeBlock('hero', {
          elementStyles: { title: { fontSize: 20 } },
        })}
        onChange={onChange}
        currentViewport="tablet"
      />,
    );

    // Switch to the "Title" sub-element tab
    fireEvent.click(screen.getByText('Title'));

    // StyleSettings now sees the title's per-element style
    expect(screen.getByTestId('ss-style').textContent).toContain('"fontSize":20');

    // Emitting now should merge into elementStyles.title
    fireEvent.click(screen.getByTestId('ss-emit'));
    expect(onChange).toHaveBeenCalledTimes(1);
    const call = onChange.mock.calls[0][0];
    expect(call.elementStyles).toBeTruthy();
    expect(call.elementStyles.title).toEqual({ fontSize: 20, color: 'red' });
  });
});

// ---------------------------------------------------------------------------
// BlockContextMenu
// ---------------------------------------------------------------------------

describe('BlockContextMenu', () => {
  function setup(overrides: Partial<React.ComponentProps<typeof BlockContextMenu>> = {}) {
    const handlers = {
      onClose: vi.fn(),
      onDuplicate: vi.fn(),
      onCopy: vi.fn(),
      onPaste: vi.fn(),
      onGroup: vi.fn(),
      onSaveAsTemplate: vi.fn(),
      onDelete: vi.fn(),
    };
    const utils = render(
      <BlockContextMenu
        contextMenu={{ x: 50, y: 80 }}
        selectedCount={1}
        {...handlers}
        {...overrides}
      />,
    );
    return { ...utils, ...handlers };
  }

  it('positions the menu at the given coords and shows the singular header', () => {
    const { container } = setup();
    // Second fixed div is the menu; first is the close-on-outside-click overlay.
    const divs = container.querySelectorAll('div.fixed');
    const menu = divs[1] as HTMLElement;
    expect(menu.style.left).toBe('50px');
    expect(menu.style.top).toBe('80px');
    expect(menu.textContent).toContain('Block');
    expect(menu.textContent).not.toContain('blocks');
  });

  it('shows the pluralized header when multiple blocks are selected', () => {
    const { container } = setup({ selectedCount: 4 });
    expect(container.textContent).toContain('4 blocks');
  });

  it('disables Group when fewer than 2 blocks are selected', () => {
    const { getByText } = setup({ selectedCount: 1 });
    const groupBtn = getByText('Group into Section').closest('button') as HTMLButtonElement;
    expect(groupBtn.disabled).toBe(true);
    expect(groupBtn.getAttribute('title')).toContain('Select 2 or more');
  });

  it('enables Group when 2 or more blocks are selected', () => {
    const { getByText } = setup({ selectedCount: 3 });
    const groupBtn = getByText('Group into Section').closest('button') as HTMLButtonElement;
    expect(groupBtn.disabled).toBe(false);
  });

  it('fires the matching handler AND onClose for each action item', () => {
    const { getByText, onDuplicate, onCopy, onPaste, onSaveAsTemplate, onDelete, onClose } = setup();

    fireEvent.click(getByText('Duplicate'));
    expect(onDuplicate).toHaveBeenCalledTimes(1);

    fireEvent.click(getByText('Copy'));
    expect(onCopy).toHaveBeenCalledTimes(1);

    fireEvent.click(getByText('Paste'));
    expect(onPaste).toHaveBeenCalledTimes(1);

    fireEvent.click(getByText('Save as Template'));
    expect(onSaveAsTemplate).toHaveBeenCalledTimes(1);

    fireEvent.click(getByText('Delete'));
    expect(onDelete).toHaveBeenCalledTimes(1);

    // Every click also closes the menu
    expect(onClose).toHaveBeenCalledTimes(5);
  });

  it('closes the menu on outside (overlay) click', () => {
    const { container, onClose } = setup();
    const overlay = container.querySelector('div.fixed.inset-0') as HTMLElement;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes the menu when the overlay receives a contextmenu event', () => {
    const { container, onClose } = setup();
    const overlay = container.querySelector('div.fixed.inset-0') as HTMLElement;
    fireEvent.contextMenu(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
