// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks for heavy deps
// ---------------------------------------------------------------------------

// framer-motion -> plain element passthrough
vi.mock('framer-motion', () => {
  const passthrough = (tag: string) =>
    function MotionMock({ children, className, style, onClick, whileHover, ...rest }: any) {
      return React.createElement(
        tag,
        {
          className,
          style,
          onClick,
          'data-motion': tag,
          'data-while-hover': whileHover ? JSON.stringify(whileHover) : undefined,
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
  return {
    motion,
    AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
  };
});

// next/link -> plain anchor
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

// BrandingContext — supply a controllable branding object per-test
const brandingState: { value: { borderRadius?: string } | null } = { value: null };
vi.mock('@/contexts/BrandingContext', () => ({
  useBranding: () => brandingState.value,
}));

// react-icons/md mocks — Vitest validates returned names against actual imports,
// so we enumerate all Md* names referenced by components/ui/Icon.tsx explicitly.
// Factory is hoisted above all imports, so the name list must live inline.
vi.mock('react-icons/md', () => {
  const NAMES = [
    'MdRocketLaunch', 'MdAltRoute', 'MdHandshake', 'MdSchool', 'MdTrendingUp',
    'MdVolunteerActivism', 'MdArrowForward', 'MdArrowBack', 'MdArrowUpward',
    'MdArrowDownward', 'MdNorthEast', 'MdClose', 'MdCheck', 'MdCheckCircle',
    'MdPlayCircle', 'MdInsights', 'MdSync', 'MdWorkspacePremium', 'MdStar',
    'MdStorefront', 'MdInventory2', 'MdLocalOffer', 'MdErrorOutline',
    'MdChevronLeft', 'MdChevronRight', 'MdOpenInNew', 'MdEdit', 'MdVisibility',
    'MdHistory', 'MdMenu', 'MdArticle', 'MdSmartButton', 'MdFormatQuote',
    'MdImage', 'MdImagesearchRoller', 'MdPhotoLibrary', 'MdCode', 'MdHeight',
    'MdHorizontalRule', 'MdViewColumn', 'MdCropFree', 'MdTab', 'MdExpandMore',
    'MdViewCarousel', 'MdSlideshow', 'MdTextRotationNone', 'MdCampaign',
    'MdGridView', 'MdFlip', 'MdBarChart', 'MdRateReview', 'MdApps', 'MdLoyalty',
    'MdCategory', 'MdShoppingCart', 'MdSell', 'MdSchedule', 'MdPoll', 'MdTitle',
    'MdNotes', 'MdSupport', 'MdLightbulb', 'MdPeople', 'MdChat', 'MdEmail',
    'MdPhone', 'MdLocationOn', 'MdSettings', 'MdInfo', 'MdWarning', 'MdDone',
    'MdAdd', 'MdRemove', 'MdSearch', 'MdBookmark', 'MdFavorite', 'MdShare',
    'MdDownload', 'MdUpload', 'MdRefresh', 'MdHome', 'MdBusinessCenter',
    'MdDashboard', 'MdAnalytics', 'MdAutoAwesome', 'MdLink', 'MdBadge',
    'MdGpsFixed', 'MdStorage', 'MdWorkspaces', 'MdMyLocation', 'MdGroup',
    'MdTune', 'MdAccountTree', 'MdHub', 'MdScale',
  ];
  const React = require('react');
  const make = (label: string) =>
    function MdIconMock({ className, style, 'aria-hidden': ariaHidden }: any) {
      return React.createElement(
        'span',
        {
          className,
          style,
          'aria-hidden': ariaHidden,
          'data-icon-component': label,
        },
        label,
      );
    };
  const exports: Record<string, ReturnType<typeof make>> = {};
  for (const name of NAMES) {
    exports[name] = make(name);
  }
  return exports;
});

// keyboardShortcuts util — provide deterministic data we can assert on
vi.mock('@/lib/utils/keyboardShortcuts', () => ({
  getShortcutsByCategory: () => ({
    editing: [
      { keys: 'mod+z', description: 'Undo last action', category: 'editing', handler: () => {} },
    ],
    blocks: [
      { keys: 'mod+d', description: 'Duplicate block', category: 'blocks', handler: () => {} },
    ],
    navigation: [],
    system: [
      { keys: '?', description: 'Show shortcuts', category: 'system', handler: () => {} },
    ],
  }),
  formatShortcutKeys: (keys: string) => keys.toUpperCase(),
  getCategoryName: (cat: string) => `CAT:${cat}`,
}));

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Footer } from '@/components/ui/Footer';
import { KeyboardShortcutReference } from '@/components/ui/KeyboardShortcutReference';

beforeEach(() => {
  brandingState.value = null;
});

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
describe('Card', () => {
  it('renders the title and description', () => {
    const { container } = render(
      <Card title="Hello" description="World" />,
    );
    const heading = container.querySelector('h3');
    expect(heading?.textContent).toBe('Hello');
    const desc = container.querySelector('p');
    expect(desc?.textContent).toBe('World');
  });

  it('does not wrap in an anchor when no link prop is given', () => {
    const { container } = render(<Card title="T" description="D" />);
    expect(container.querySelector('a')).toBeNull();
  });

  it('wraps content in a link when link prop is provided', () => {
    const { container } = render(
      <Card title="T" description="D" link="/somewhere" />,
    );
    const a = container.querySelector('a');
    expect(a).toBeTruthy();
    expect(a?.getAttribute('href')).toBe('/somewhere');
    // Also renders the "Learn more" affordance
    expect(container.textContent).toContain('Learn more');
  });

  it('renders an image when image prop is set', () => {
    const { container } = render(
      <Card title="Pic" description="d" image="/img.jpg" />,
    );
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/img.jpg');
    expect(img?.getAttribute('alt')).toBe('Pic');
  });

  it('renders subtitle when provided', () => {
    const { container } = render(
      <Card title="T" description="D" subtitle="Role" />,
    );
    // subtitle uses dangerouslySetInnerHTML in a <p>
    const ps = container.querySelectorAll('p');
    const hasSubtitle = Array.from(ps).some((p) => p.textContent === 'Role');
    expect(hasSubtitle).toBe(true);
  });

  it('applies branding borderRadius when branding context provides one', () => {
    brandingState.value = { borderRadius: '12px' };
    const { container } = render(
      <Card title="T" description="D" />,
    );
    const motionDiv = container.querySelector('[data-motion="div"]') as HTMLElement;
    expect(motionDiv.style.borderRadius).toBe('12px');
    // The default rounded-xl class is suppressed when branding sets radius
    expect(motionDiv.className).not.toContain('rounded-xl');
  });

  it('uses the rounded-xl utility when no branding borderRadius is set', () => {
    const { container } = render(<Card title="T" description="D" />);
    const motionDiv = container.querySelector('[data-motion="div"]') as HTMLElement;
    expect(motionDiv.className).toContain('rounded-xl');
  });

  it('merges custom className into the motion wrapper', () => {
    const { container } = render(
      <Card title="T" description="D" className="my-card" />,
    );
    const motionDiv = container.querySelector('[data-motion="div"]') as HTMLElement;
    expect(motionDiv.className).toContain('my-card');
  });

  it('renders the Icon when icon prop is provided', () => {
    const { container } = render(
      <Card title="T" description="D" icon="star" />,
    );
    // Our Icon mocks star -> Md icon span
    const iconEl = container.querySelector('[data-icon-component="MdStar"]');
    expect(iconEl).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Icon
// ---------------------------------------------------------------------------
describe('Icon', () => {
  it('returns null when name is empty', () => {
    const { container } = render(<Icon name="" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the mapped react-icons component for a known material name', () => {
    const { container } = render(<Icon name="rocket_launch" />);
    const span = container.querySelector('[data-icon-component="MdRocketLaunch"]');
    expect(span).toBeTruthy();
  });

  it('falls back to a material-icons span for an unknown name', () => {
    const { container } = render(<Icon name="totally_unknown_icon_xyz" />);
    const span = container.querySelector('span.material-icons');
    expect(span).toBeTruthy();
    expect(span?.textContent).toBe('totally_unknown_icon_xyz');
  });

  it('applies numeric size as fontSize pixels', () => {
    const { container } = render(<Icon name="star" size={32} />);
    const el = container.querySelector('[data-icon-component]') as HTMLElement;
    expect(el.style.fontSize).toBe('32px');
  });

  it('passes string sizes through directly', () => {
    const { container } = render(<Icon name="star" size="2rem" />);
    const el = container.querySelector('[data-icon-component]') as HTMLElement;
    expect(el.style.fontSize).toBe('2rem');
  });

  it('forwards className and style', () => {
    const { container } = render(
      <Icon name="star" className="my-icon" style={{ color: 'rgb(255, 0, 0)' }} />,
    );
    const el = container.querySelector('[data-icon-component]') as HTMLElement;
    expect(el.className).toContain('my-icon');
    expect(el.style.color).toBe('rgb(255, 0, 0)');
  });

  it('defaults aria-hidden to true', () => {
    const { container } = render(<Icon name="star" />);
    const el = container.querySelector('[data-icon-component]') as HTMLElement;
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it('honors a false aria-hidden override', () => {
    const { container } = render(<Icon name="star" aria-hidden={false} />);
    const el = container.querySelector('[data-icon-component]') as HTMLElement;
    expect(el.getAttribute('aria-hidden')).toBe('false');
  });
});

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------
describe('Footer', () => {
  it('renders the site name in a heading', () => {
    render(<Footer />);
    // siteConfig.name is "SimplerDevelopment"
    expect(screen.getAllByText(/SimplerDevelopment/).length).toBeGreaterThan(0);
  });

  it('renders the four major section headings', () => {
    render(<Footer />);
    expect(screen.getByText('Platform')).toBeTruthy();
    expect(screen.getByText('Company')).toBeTruthy();
    expect(screen.getByText('Get in Touch')).toBeTruthy();
  });

  it('renders the social links with proper external rel attrs', () => {
    const { container } = render(<Footer />);
    const linkedin = container.querySelector('a[aria-label="LinkedIn"]') as HTMLAnchorElement;
    expect(linkedin).toBeTruthy();
    expect(linkedin.getAttribute('target')).toBe('_blank');
    expect(linkedin.getAttribute('rel')).toContain('noopener');
    expect(container.querySelector('a[aria-label="GitHub"]')).toBeTruthy();
    expect(container.querySelector('a[aria-label="Twitter"]')).toBeTruthy();
  });

  it('renders a copyright with the current year', () => {
    const year = new Date().getFullYear();
    render(<Footer />);
    expect(screen.getByText(new RegExp(`© ${year}`))).toBeTruthy();
  });

  it('renders the contact email', () => {
    render(<Footer />);
    expect(screen.getByText('info@simplerdevelopment.com')).toBeTruthy();
  });

  it('links to /contact for the consultation CTA', () => {
    const { container } = render(<Footer />);
    const consultationLink = Array.from(container.querySelectorAll('a')).find(
      (a) =>
        a.getAttribute('href') === '/contact' &&
        a.textContent?.includes('Book a free consultation'),
    );
    expect(consultationLink).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// KeyboardShortcutReference
// ---------------------------------------------------------------------------
describe('KeyboardShortcutReference', () => {
  it('renders nothing when isOpen=false', () => {
    const { container } = render(
      <KeyboardShortcutReference isOpen={false} onClose={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the modal header when open', () => {
    render(<KeyboardShortcutReference isOpen onClose={() => {}} />);
    expect(screen.getByText('Keyboard Shortcuts')).toBeTruthy();
    expect(screen.getByText(/Speed up your workflow/i)).toBeTruthy();
  });

  it('renders one category section per non-empty category', () => {
    render(<KeyboardShortcutReference isOpen onClose={() => {}} />);
    // Mocked: editing, blocks, system are non-empty; navigation empty
    expect(screen.getByText('CAT:editing')).toBeTruthy();
    expect(screen.getByText('CAT:blocks')).toBeTruthy();
    expect(screen.getByText('CAT:system')).toBeTruthy();
    expect(screen.queryByText('CAT:navigation')).toBeNull();
  });

  it('formats the shortcut keys using the formatter', () => {
    render(<KeyboardShortcutReference isOpen onClose={() => {}} />);
    // formatShortcutKeys returns uppercased input in our mock
    expect(screen.getByText('MOD+Z')).toBeTruthy();
    expect(screen.getByText('MOD+D')).toBeTruthy();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutReference isOpen onClose={onClose} />);
    const closeBtn = screen.getByTitle('Close (Esc)');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <KeyboardShortcutReference isOpen onClose={onClose} />,
    );
    // Outer fixed-inset div is the backdrop
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when the modal body is clicked', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutReference isOpen onClose={onClose} />);
    const heading = screen.getByText('Keyboard Shortcuts');
    fireEvent.click(heading);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutReference isOpen onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not respond to Escape when isOpen=false', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutReference isOpen={false} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
