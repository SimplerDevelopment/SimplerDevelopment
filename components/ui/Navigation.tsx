'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { UserDropdown } from './UserDropdown';
import { SolutionsMegaMenu } from './SolutionsMegaMenu';

export function Navigation() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => setMobileMenuOpen(!mobileMenuOpen);
  const closeMobileMenu = () => setMobileMenuOpen(false);

  // Close menu on route change. Guarded so we only write state when the menu
  // is actually open; syncing UI visibility to the route is a legitimate
  // effect, not a cascading-render smell.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (mobileMenuOpen) closeMobileMenu();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lock scrolling while the drawer is open — on the ROOT element, not <body>.
  //
  // This was `document.body.style.overflow` and it failed twice over. Locking
  // body makes body a scroll container, which silently breaks the `sticky`
  // header above: its offset then resolves against a container that never
  // scrolls, so it renders at its static document position — 2,600px above the
  // viewport on a scrolled page. The drawer is anchored `top-16` on the
  // assumption the header is there, so opening the menu left a gap with page
  // content showing through and no visible way to close it.
  //
  // And it did not even lock: measured on production in both engines, a wheel
  // event still scrolled the page 2600 → 3000 with body overflow hidden.
  // Locking the root element holds the header at top:0 AND genuinely blocks
  // scroll (verified in WebKit and Chromium). Reverting this to `body` will
  // reintroduce a bug that reads as "the top bar disappears".
  useEffect(() => {
    const root = document.documentElement;
    if (mobileMenuOpen) {
      root.style.overflow = 'hidden';
    } else {
      root.style.overflow = '';
    }
    return () => {
      root.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const navLinks = [
    { href: '/solutions', label: 'Solutions' },
    // The one services entry in a nav that otherwise sells the product. It sits
    // second so the consulting funnel gets header placement without displacing
    // Solutions, which is still the primary product path. See PUX-091.
    { href: '/ai-consulting', label: 'AI Consulting' },
    { href: '/migrate', label: 'Migrate' },
    { href: '/about', label: 'About' },
    { href: '/blog', label: 'Blog' },
    { href: '/docs', label: 'Docs' },
  ];

  // Check if we're on a post edit/new screen
  const isPostEditScreen = pathname.includes('/posts/new') ||
                          pathname.includes('/posts/edit') ||
                          (pathname.match(/\/posts\/\d+/) !== null);

  return (
    <>
      {/* `retro` scopes the retro-future tokens (app/globals.css) to the nav.
          Safe to apply unconditionally: LayoutContent lists /admin and /portal
          in STANDALONE_PREFIXES and returns before rendering this, so the nav
          only ever appears on the public marketing surface. */}
      <nav className="retro sticky top-0 z-[60] border-b border-[color-mix(in_srgb,var(--retro-gold)_30%,transparent)] bg-[var(--retro-ink)] text-[var(--retro-cream)]">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              {isPostEditScreen && (
                <Link
                  href="/admin/posts"
                  className="flex items-center justify-center w-8 h-8 rounded hover:bg-[color-mix(in_srgb,var(--retro-cream)_12%,transparent)] transition-colors"
                  title="Back to Posts"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </Link>
              )}
              <Link href="/" className="font-display text-xl flex items-center gap-2" onClick={closeMobileMenu}>
                <Image
                  src="/iconLogo.png"
                  alt=""
                  width={56}
                  height={56}
                  className="nav-logo-icon"
                  priority
                />
                <span className="tracking-tight"><b>Simpler</b>Development</span>
              </Link>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-8">
              {!pathname.startsWith('/admin') && (
                <>
                  {navLinks.map((link) =>
                    link.href === '/solutions' ? (
                      <SolutionsMegaMenu key={link.href} />
                    ) : (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={`text-sm font-semibold transition-colors ${
                          pathname === link.href
                            ? 'text-[var(--retro-gold)]'
                            : 'text-[color-mix(in_srgb,var(--retro-cream)_85%,transparent)] hover:text-[var(--retro-gold)]'
                        }`}
                      >
                        {link.label}
                      </Link>
                    )
                  )}
                </>
              )}

              {/* Theme toggle removed: the retro marketing skin defines its palette
                  as fixed hex tokens under `.retro`, so light/dark has no effect on
                  any surface this nav renders over — verified by toggling `.dark`
                  and measuring the band background (unchanged). A control that
                  visibly does nothing is worse than no control. The portal and
                  admin keep their own toggle; this nav never renders there. */}

              {session ? (
                <UserDropdown user={session.user} />
              ) : !pathname.startsWith('/admin') ? (
                <>
                  <Link
                    href="/contact"
                    className="inline-flex items-center gap-2 rounded bg-[var(--retro-orange)] px-4 py-2 text-sm font-bold text-[var(--retro-cream)] transition-colors hover:bg-[var(--retro-rust)]"
                  >
                    Contact Us <span aria-hidden>🚀</span>
                  </Link>
                </>
              ) : (
                <Link
                  href="/admin/login"
                  className="text-sm font-semibold text-[color-mix(in_srgb,var(--retro-cream)_85%,transparent)] hover:text-[var(--retro-gold)] transition-colors"
                >
                  Login
                </Link>
              )}
            </div>

            {/* Mobile Menu Button & Theme Toggle */}
            <div className="flex items-center space-x-4 md:hidden">
              <button
                onClick={toggleMobileMenu}
                className="inline-flex items-center justify-center p-2 rounded hover:bg-[color-mix(in_srgb,var(--retro-cream)_12%,transparent)] transition-colors"
                aria-label="Toggle mobile menu"
                aria-expanded={mobileMenuOpen}
              >
                <svg
                  className={`h-6 w-6 transition-transform duration-300 ${mobileMenuOpen ? 'rotate-90' : ''}`}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  {mobileMenuOpen ? (
                    <path d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Backdrop Overlay */}
      <div
        className={`fixed inset-x-0 top-16 bottom-0 bg-black/60 backdrop-blur-sm z-40 md:hidden transition-opacity duration-300 ${
          mobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={closeMobileMenu}
        aria-hidden="true"
      />

      {/* Mobile Menu Slide-in Panel */}
      <div
        className={`retro fixed top-16 right-0 bottom-0 w-72 bg-[var(--retro-ink)] text-[var(--retro-cream)] border-l border-[color-mix(in_srgb,var(--retro-gold)_30%,transparent)] z-40 md:hidden transform transition-transform duration-300 ease-out ${
          mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-full overflow-y-auto">
          <div className="px-4 py-6 space-y-2">
            {!pathname.startsWith('/admin') && (
              <>
                <div className="eyebrow eyebrow--on-ink mb-4 px-3">
                  Navigation
                </div>
                {navLinks.map((link, index) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={closeMobileMenu}
                    className={`group flex items-center rounded px-4 py-4 text-lg font-semibold transition-colors ${
                      pathname === link.href
                        ? 'bg-[color-mix(in_srgb,var(--retro-gold)_18%,transparent)] text-[var(--retro-gold)]'
                        : 'hover:bg-[color-mix(in_srgb,var(--retro-cream)_12%,transparent)]'
                    }`}
                    style={{
                      animation: mobileMenuOpen ? `slideIn 0.3s ease-out ${index * 0.05}s both` : 'none'
                    }}
                  >
                    <span>{link.label}</span>
                  </Link>
                ))}

                {/* Mobile CTA */}
                <div className="pt-2 px-4 flex flex-col gap-2">
                  <Link
                    href="/contact"
                    onClick={closeMobileMenu}
                    className="flex w-full items-center justify-center gap-2 rounded bg-[var(--retro-orange)] px-4 py-3 text-base font-bold text-[var(--retro-cream)] transition-colors hover:bg-[var(--retro-rust)]"
                  >Contact Us <span aria-hidden>🚀</span></Link>
                </div>
              </>
            )}

            <div className="border-t pt-4 mt-4">
              {session ? (
                <div className="space-y-2">
                  <div className="px-4 py-2">
                    <div className="text-xs font-semibold text-muted-foreground tracking-wider mb-3">
                      Account
                    </div>
                    <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-accent/50">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-lg font-bold">
                        {(session.user.name?.[0] || session.user.email?.[0] || 'U').toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {session.user.name || 'User'}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {session.user.email}
                        </div>
                      </div>
                    </div>
                  </div>
                  <Link
                    href="/admin"
                    onClick={closeMobileMenu}
                    className="flex items-center px-4 py-4 rounded text-lg font-semibold hover:bg-[color-mix(in_srgb,var(--retro-cream)_12%,transparent)] transition-colors"
                  >
                    <span>Dashboard</span>
                  </Link>
                  <Link
                    href="/admin/settings"
                    onClick={closeMobileMenu}
                    className="flex items-center px-4 py-4 rounded text-lg font-semibold hover:bg-[color-mix(in_srgb,var(--retro-cream)_12%,transparent)] transition-colors"
                  >
                    <span>Settings</span>
                  </Link>
                </div>
              ) : (
                <Link
                  href="/admin/login"
                  onClick={closeMobileMenu}
                  className="flex items-center justify-center px-4 py-3 rounded text-base font-semibold text-[color-mix(in_srgb,var(--retro-cream)_70%,transparent)] hover:text-[var(--retro-gold)] transition-colors"
                >
                  Admin Login
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add keyframe animation */}
      <style jsx>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  );
}
