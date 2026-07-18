// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Shared mocks for heavy deps
// ---------------------------------------------------------------------------

// next/link -> render as plain <a>
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) =>
    React.createElement('a', { href, ...rest }, children),
}));

// framer-motion -> plain element passthrough (we use it inside Card)
vi.mock('framer-motion', () => {
  const passthrough = (tag: string) =>
    function MotionMock({ children, className, style, whileHover, ...rest }: any) {
      return React.createElement(
        tag,
        {
          className,
          style,
          'data-motion': tag,
          'data-while-hover': whileHover ? '1' : '0',
          ...rest,
        },
        children,
      );
    };
  const motion: any = new Proxy(
    {},
    {
      get: (_target, prop: string) => passthrough(prop),
    },
  );
  return { motion };
});

// Branding context — controllable per test
const brandingState: { value: { borderRadius?: string } | null } = { value: null };
vi.mock('@/contexts/BrandingContext', () => ({
  useBranding: () => brandingState.value,
}));

// Icon component — render a simple placeholder so we can assert on it.
vi.mock('@/components/ui/Icon', () => ({
  __esModule: true,
  Icon: ({ name, className, size, style }: any) =>
    React.createElement(
      'span',
      {
        'data-testid': 'icon',
        'data-icon-name': name,
        'data-icon-size': String(size ?? ''),
        className,
        style,
      },
      name,
    ),
}));

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------
import { Card } from '@/components/ui/Card';
import { Footer } from '@/components/ui/Footer';
import { KeyboardShortcutReference } from '@/components/ui/KeyboardShortcutReference';
import { EmailPreviewPane } from '@/components/email/EmailPreviewPane';

beforeEach(() => {
  brandingState.value = null;
});

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
describe('Card', () => {
  it('renders the title and description', () => {
    const { container } = render(<Card title="My Title" description="A description." />);
    expect(container.textContent).toContain('My Title');
    expect(container.textContent).toContain('A description.');
  });

  it('renders subtitle when provided', () => {
    const { container } = render(
      <Card title="t" subtitle="The Subtitle" description="d" />,
    );
    expect(container.textContent).toContain('The Subtitle');
  });

  it('omits subtitle markup when not provided', () => {
    const { container } = render(<Card title="t" description="d" />);
    // only title + description paragraphs/headings should be present — no third <p>
    expect(container.querySelectorAll('p').length).toBe(1);
  });

  it('renders an image when an image URL is supplied', () => {
    const { container } = render(
      <Card title="Foo" description="d" image="/img.png" />,
    );
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/img.png');
    expect(img?.getAttribute('alt')).toBe('Foo');
  });

  it('renders an Icon when icon name is provided, parsing iconSize', () => {
    render(<Card title="t" description="d" icon="star" iconSize="32" />);
    const icon = screen.getByTestId('icon');
    expect(icon.getAttribute('data-icon-name')).toBe('star');
    expect(icon.getAttribute('data-icon-size')).toBe('32');
  });

  it('falls back to default icon size 48 when iconSize is not supplied', () => {
    render(<Card title="t" description="d" icon="star" />);
    const icon = screen.getByTestId('icon');
    expect(icon.getAttribute('data-icon-size')).toBe('48');
  });

  it('wraps the card in a link when link is provided', () => {
    const { container } = render(
      <Card title="t" description="d" link="/somewhere" />,
    );
    const anchor = container.querySelector('a[href="/somewhere"]');
    expect(anchor).toBeTruthy();
    expect(container.textContent).toContain('Learn more');
  });

  it('does not render a "Learn more" CTA when no link is provided', () => {
    const { container } = render(<Card title="t" description="d" />);
    expect(container.textContent).not.toContain('Learn more');
  });

  it('applies branding borderRadius via inline style when branding provides it', () => {
    brandingState.value = { borderRadius: '12px' };
    const { container } = render(<Card title="t" description="d" />);
    const motionDiv = container.querySelector('[data-motion="div"]') as HTMLElement;
    expect(motionDiv.style.borderRadius).toBe('12px');
    // when branding sets borderRadius, the default rounded-xl class is dropped
    expect(motionDiv.className).not.toMatch(/\brounded-xl\b/);
  });

  it('uses the default rounded-xl class when no branding borderRadius is present', () => {
    const { container } = render(<Card title="t" description="d" />);
    const motionDiv = container.querySelector('[data-motion="div"]') as HTMLElement;
    expect(motionDiv.className).toMatch(/\brounded-xl\b/);
  });

  it('accepts a custom className on the inner motion div', () => {
    const { container } = render(
      <Card title="t" description="d" className="custom-x" />,
    );
    const motionDiv = container.querySelector('[data-motion="div"]') as HTMLElement;
    expect(motionDiv.className).toContain('custom-x');
  });

  it('renders title/subtitle/description as HTML via dangerouslySetInnerHTML', () => {
    const { container } = render(
      <Card
        title="<em>Tee</em>"
        subtitle="<strong>Sub</strong>"
        description="<span>Desc</span>"
      />,
    );
    expect(container.querySelector('h3 em')?.textContent).toBe('Tee');
    expect(container.querySelector('p strong')?.textContent).toBe('Sub');
    // description paragraph carries the span
    const descSpan = Array.from(container.querySelectorAll('p span')).find(
      (s) => s.textContent === 'Desc',
    );
    expect(descSpan).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------
describe('Footer', () => {
  it('renders the site name in the brand header', () => {
    render(<Footer />);
    // siteConfig.name is 'SimplerDevelopment' — appears at least twice (brand + copyright)
    const matches = screen.getAllByText(/SimplerDevelopment/);
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('renders the current year in the copyright line', () => {
    const { container } = render(<Footer />);
    const year = new Date().getFullYear();
    expect(container.textContent).toContain(String(year));
  });

  it('renders the contact email', () => {
    const { container } = render(<Footer />);
    expect(container.textContent).toContain('info@simplerdevelopment.com');
  });

  it('renders platform feature links to /solutions/*', () => {
    const { container } = render(<Footer />);
    expect(container.querySelector('a[href="/solutions/websites"]')).toBeTruthy();
    expect(container.querySelector('a[href="/solutions/email-marketing"]')).toBeTruthy();
    expect(container.querySelector('a[href="/solutions/crm"]')).toBeTruthy();
    expect(container.querySelector('a[href="/solutions/booking"]')).toBeTruthy();
    expect(container.querySelector('a[href="/solutions"]')).toBeTruthy();
  });

  it('renders company nav links', () => {
    const { container } = render(<Footer />);
    expect(container.querySelector('a[href="/about"]')).toBeTruthy();
    expect(container.querySelector('a[href="/apps-and-products"]')).toBeTruthy();
    expect(container.querySelector('a[href="/blog"]')).toBeTruthy();
    // two /contact links (one in nav, one in CTA)
    expect(container.querySelectorAll('a[href="/contact"]').length).toBeGreaterThanOrEqual(2);
  });

  it('renders accessible social media links with aria-labels', () => {
    render(<Footer />);
    expect(screen.getByLabelText('LinkedIn')).toBeTruthy();
    expect(screen.getByLabelText('GitHub')).toBeTruthy();
    expect(screen.getByLabelText('Twitter')).toBeTruthy();
  });

  it('opens external social links in a new tab with rel noopener noreferrer', () => {
    render(<Footer />);
    const linkedin = screen.getByLabelText('LinkedIn') as HTMLAnchorElement;
    expect(linkedin.getAttribute('target')).toBe('_blank');
    expect(linkedin.getAttribute('rel')).toContain('noopener');
    expect(linkedin.getAttribute('rel')).toContain('noreferrer');
  });
});

// ---------------------------------------------------------------------------
// KeyboardShortcutReference
// ---------------------------------------------------------------------------
describe('KeyboardShortcutReference', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <KeyboardShortcutReference isOpen={false} onClose={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal heading and helper text when open', () => {
    render(<KeyboardShortcutReference isOpen onClose={() => {}} />);
    expect(screen.getByText('Keyboard Shortcuts')).toBeTruthy();
    expect(screen.getByText(/Speed up your workflow/i)).toBeTruthy();
  });

  it('renders category headings for known categories', () => {
    render(<KeyboardShortcutReference isOpen onClose={() => {}} />);
    // category section names are uppercased via class; the textContent stays as-is
    // there should be at least one h3 element under content
    const h3s = document.querySelectorAll('h3');
    expect(h3s.length).toBeGreaterThan(0);
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutReference isOpen onClose={onClose} />);
    fireEvent.click(screen.getByTitle(/close/i));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <KeyboardShortcutReference isOpen onClose={onClose} />,
    );
    // backdrop is the outermost div with fixed inset-0
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when an inner click is captured (stopPropagation)', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutReference isOpen onClose={onClose} />);
    // clicking inside the modal heading should not bubble to backdrop
    fireEvent.click(screen.getByText('Keyboard Shortcuts'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose on Escape key when open', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutReference isOpen onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not listen for Escape when closed', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutReference isOpen={false} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores non-Escape keys when open', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutReference isOpen onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'a' });
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// EmailPreviewPane
// ---------------------------------------------------------------------------
describe('EmailPreviewPane', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // Helper — sleep using the real clock (used to wait out the 500ms debounce).
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it('shows the empty-state hint when blocks is empty', () => {
    render(<EmailPreviewPane blocks={[]} />);
    expect(screen.getByText(/Add blocks to see preview/i)).toBeTruthy();
  });

  it('renders the Email Preview toolbar label', () => {
    render(<EmailPreviewPane blocks={[]} />);
    expect(screen.getByText(/Email Preview/i)).toBeTruthy();
  });

  it('fetches preview HTML after the debounce when blocks exist, then renders an iframe', async () => {
    const mockFetch = vi.fn(async () =>
      ({
        ok: true,
        json: async () => ({ success: true, data: { html: '<p>hi</p>' } }),
      } as unknown as Response),
    ) as unknown as typeof fetch;
    global.fetch = mockFetch;

    const { container } = render(
      <EmailPreviewPane blocks={[{ id: 'b1', type: 'text' } as any]} />,
    );

    // Initially no iframe — the 500ms debounce hasn't fired yet.
    expect(container.querySelector('iframe')).toBeNull();

    await act(async () => {
      await wait(700);
    });

    await waitFor(() => {
      expect(container.querySelector('iframe')).not.toBeNull();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/portal/email/render-preview',
      expect.objectContaining({ method: 'POST' }),
    );

    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe.getAttribute('srcdoc')).toBe('<p>hi</p>');
    expect(iframe.getAttribute('sandbox')).toBe('allow-same-origin');
  });

  it('toggles desktop / mobile width via the toolbar buttons', async () => {
    const mockFetch = vi.fn(async () =>
      ({
        ok: true,
        json: async () => ({ success: true, data: { html: '<p>hi</p>' } }),
      } as unknown as Response),
    ) as unknown as typeof fetch;
    global.fetch = mockFetch;

    const { container } = render(
      <EmailPreviewPane blocks={[{ id: 'b1', type: 'text' } as any]} />,
    );

    await act(async () => {
      await wait(700);
    });

    await waitFor(() => {
      expect(container.querySelector('iframe')).not.toBeNull();
    });

    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    const widthWrap = iframe.parentElement as HTMLElement;
    expect(widthWrap.style.width).toBe('600px');

    // The two toolbar buttons live in the header; the previewer also adds <button>s for our test target — we want only the header ones.
    const toolbarButtons = container.querySelectorAll('button');
    fireEvent.click(toolbarButtons[1]);
    expect(widthWrap.style.width).toBe('320px');

    fireEvent.click(toolbarButtons[0]);
    expect(widthWrap.style.width).toBe('600px');
  });

  it('does not invoke fetch when blocks is empty even after debounce', async () => {
    const mockFetch = vi.fn() as unknown as typeof fetch;
    global.fetch = mockFetch;

    render(<EmailPreviewPane blocks={[]} />);
    await act(async () => {
      await wait(700);
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('silently ignores fetch errors and stops the loading state', async () => {
    const mockFetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    global.fetch = mockFetch;

    const { container } = render(
      <EmailPreviewPane blocks={[{ id: 'b1', type: 'text' } as any]} />,
    );

    await act(async () => {
      await wait(700);
    });

    // After the error settles, no iframe is rendered and the loading hint is gone.
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.queryByText(/Rendering preview/i)).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
