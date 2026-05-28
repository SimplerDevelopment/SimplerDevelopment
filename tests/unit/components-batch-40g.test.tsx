// @vitest-environment jsdom
/**
 * Unit tests for 4 small UI components (batch 40g):
 *
 *   - AnimatedText  (components/ui/AnimatedText.tsx)
 *   - ThemeToggle   (components/ui/ThemeToggle.tsx)
 *   - Accordion / AccordionItem (components/ui/Accordion.tsx)
 *   - UserDropdown  (components/ui/UserDropdown.tsx)
 *
 * Renders each with @testing-library/react in jsdom. We mock framer-motion,
 * next-auth/react, next/link, and the local useTheme hook so the tests stay
 * deterministic and don't pull in animation / auth runtimes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Cross-cutting mocks
// ---------------------------------------------------------------------------

// framer-motion: every motion.<tag> renders the plain tag, forwarding children
// and className so we can still inspect the DOM.
vi.mock('framer-motion', () => {
  const passthrough = (tag: string) =>
    function MotionMock({ children, className, style }: any) {
      return React.createElement(
        tag,
        { className, style, 'data-motion': tag },
        children,
      );
    };
  const motion: any = new Proxy(
    {},
    {
      get: (_target, prop: string) => passthrough(prop),
    },
  );
  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

// next/link → plain <a>
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// next-auth/react — capture signOut so we can assert it was called.
const signOutMock = vi.fn();
vi.mock('next-auth/react', () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSession: () => ({ data: null, status: 'unauthenticated' }),
}));

// useTheme — fully controllable from the test side.
const themeState = {
  resolvedTheme: 'light' as 'light' | 'dark',
  toggleTheme: vi.fn(),
};
vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => themeState,
}));

import { AnimatedText } from '@/components/ui/AnimatedText';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Accordion, AccordionItem } from '@/components/ui/Accordion';
import { UserDropdown } from '@/components/ui/UserDropdown';

// ---------------------------------------------------------------------------
// AnimatedText
// ---------------------------------------------------------------------------

describe('AnimatedText', () => {
  it('renders one element per letter of the input text', () => {
    const { container } = render(<AnimatedText text="hi" />);
    const letters = container.querySelectorAll('[data-motion="span"]');
    expect(letters.length).toBe(2);
    expect(letters[0].textContent).toBe('h');
    expect(letters[1].textContent).toBe('i');
  });

  it('substitutes a non-breaking space for ASCII space characters', () => {
    const { container } = render(<AnimatedText text="a b" />);
    const letters = container.querySelectorAll('[data-motion="span"]');
    expect(letters.length).toBe(3);
    // ASCII space → non-breaking space (U+00A0)
    expect(letters[1].textContent).toBe(' ');
  });

  it('applies the className prop to the outer wrapper span', () => {
    const { container } = render(
      <AnimatedText text="x" className="hello-world" />,
    );
    const outer = container.firstChild as HTMLElement;
    expect(outer.tagName).toBe('SPAN');
    expect(outer.className).toContain('hello-world');
  });

  it('renders an empty wrapper when given an empty string', () => {
    const { container } = render(<AnimatedText text="" />);
    const letters = container.querySelectorAll('[data-motion="span"]');
    expect(letters.length).toBe(0);
  });

  it('accepts an isHovered flag without throwing', () => {
    const { container } = render(<AnimatedText text="ab" isHovered />);
    const letters = container.querySelectorAll('[data-motion="span"]');
    expect(letters.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// ThemeToggle
// ---------------------------------------------------------------------------

describe('ThemeToggle', () => {
  beforeEach(() => {
    themeState.resolvedTheme = 'light';
    themeState.toggleTheme = vi.fn();
  });

  it('renders a button labelled "Toggle theme"', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: /Toggle theme/i })).toBeTruthy();
  });

  it('renders the moon icon path when resolvedTheme is "light"', () => {
    themeState.resolvedTheme = 'light';
    const { container } = render(<ThemeToggle />);
    const path = container.querySelector('path');
    expect(path?.getAttribute('d') ?? '').toMatch(/M20\.354 15\.354/);
  });

  it('renders the sun icon path when resolvedTheme is "dark"', () => {
    themeState.resolvedTheme = 'dark';
    const { container } = render(<ThemeToggle />);
    const path = container.querySelector('path');
    expect(path?.getAttribute('d') ?? '').toMatch(/M12 3v1/);
  });

  it('invokes toggleTheme when the button is clicked', () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: /Toggle theme/i }));
    expect(themeState.toggleTheme).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Accordion / AccordionItem
// ---------------------------------------------------------------------------

describe('Accordion', () => {
  it('renders its children inside a wrapper div', () => {
    const { container } = render(
      <Accordion>
        <div data-testid="kid">child</div>
      </Accordion>,
    );
    expect(screen.getByTestId('kid')).toBeTruthy();
    expect((container.firstChild as HTMLElement).tagName).toBe('DIV');
  });

  it('merges the className prop into the wrapper', () => {
    const { container } = render(
      <Accordion className="extra-class">
        <div>child</div>
      </Accordion>,
    );
    expect((container.firstChild as HTMLElement).className).toContain('extra-class');
  });
});

describe('AccordionItem', () => {
  it('hides body content by default', () => {
    render(
      <AccordionItem title="Section 1">
        <p>Hidden body</p>
      </AccordionItem>,
    );
    expect(screen.getByText('Section 1')).toBeTruthy();
    expect(screen.queryByText('Hidden body')).toBeNull();
  });

  it('shows body content when defaultOpen is true', () => {
    render(
      <AccordionItem title="Section 2" defaultOpen>
        <p>Visible body</p>
      </AccordionItem>,
    );
    expect(screen.getByText('Visible body')).toBeTruthy();
  });

  it('toggles the body when the header button is clicked', () => {
    render(
      <AccordionItem title="Toggle me">
        <p>Body text</p>
      </AccordionItem>,
    );
    expect(screen.queryByText('Body text')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Toggle me/ }));
    expect(screen.getByText('Body text')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Toggle me/ }));
    expect(screen.queryByText('Body text')).toBeNull();
  });

  it('adds the rotate-180 class to the chevron when open', () => {
    const { container } = render(
      <AccordionItem title="Open" defaultOpen>
        <p>Body</p>
      </AccordionItem>,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').toContain('rotate-180');
  });
});

// ---------------------------------------------------------------------------
// UserDropdown
// ---------------------------------------------------------------------------

describe('UserDropdown', () => {
  beforeEach(() => {
    signOutMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the initials of the user name in the trigger', () => {
    render(<UserDropdown user={{ name: 'Ada Lovelace', email: 'ada@example.com' }} />);
    expect(screen.getByText('AL')).toBeTruthy();
  });

  it('renders a "?" placeholder when the user has no name', () => {
    render(<UserDropdown user={{ name: null, email: 'noname@example.com' }} />);
    expect(screen.getByText('?')).toBeTruthy();
  });

  it('caps initials to 2 characters even for long names', () => {
    render(
      <UserDropdown
        user={{ name: 'One Two Three Four Five', email: 'x@example.com' }}
      />,
    );
    // First letters joined: "OTTFF" → sliced to 2 → "OT"
    expect(screen.getByText('OT')).toBeTruthy();
  });

  it('does not show the menu before the trigger is clicked', () => {
    render(<UserDropdown user={{ name: 'Ada', email: 'a@x.com' }} />);
    expect(screen.queryByText(/Dashboard/)).toBeNull();
    expect(screen.queryByText(/Settings/)).toBeNull();
    expect(screen.queryByText(/Logout/)).toBeNull();
  });

  it('opens the menu when the avatar trigger is clicked', () => {
    render(<UserDropdown user={{ name: 'Ada', email: 'a@x.com' }} />);
    // The trigger is the only button on first render.
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(screen.getByText('Dashboard')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByText('Logout')).toBeTruthy();
    // User info row shows in the open menu.
    expect(screen.getByText('Ada')).toBeTruthy();
    expect(screen.getByText('a@x.com')).toBeTruthy();
  });

  it('invokes signOut with the / callback URL when Logout is clicked', () => {
    render(<UserDropdown user={{ name: 'Ada', email: 'a@x.com' }} />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    fireEvent.click(screen.getByText('Logout'));
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: '/' });
  });

  it('closes the menu when an outside mousedown is dispatched', () => {
    render(<UserDropdown user={{ name: 'Ada', email: 'a@x.com' }} />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(screen.getByText('Dashboard')).toBeTruthy();

    // Click outside the dropdown — dispatch a mousedown on document.body.
    fireEvent.mouseDown(document.body);

    expect(screen.queryByText('Dashboard')).toBeNull();
  });
});
