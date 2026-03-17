'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { siteConfig } from '@/config/site';
import { ThemeToggle } from './ThemeToggle';
import { UserDropdown } from './UserDropdown';
import { Button } from './Button';

export function Navigation() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => setMobileMenuOpen(!mobileMenuOpen);
  const closeMobileMenu = () => setMobileMenuOpen(false);

  // Close menu on route change
  useEffect(() => {
    closeMobileMenu();
  }, [pathname]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [mobileMenuOpen]);

  const navLinks = [
    { href: '/solutions', label: 'Solutions' },
    { href: '/about', label: 'About' },
    { href: '/blog', label: 'Blog' },
  ];

  // Check if we're on a post edit/new screen
  const isPostEditScreen = pathname.includes('/posts/new') ||
                          pathname.includes('/posts/edit') ||
                          (pathname.match(/\/posts\/\d+/) !== null);

  return (
    <>
      <nav className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              {isPostEditScreen && (
                <Link
                  href="/admin/posts"
                  className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-accent transition-colors"
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
              <Link href="/" className="text-xl font-heading flex items-center" onClick={closeMobileMenu}>
                <img src="/iconLogo.png" alt="" className="h-14 w-14 -mr-2 dark:brightness-0 dark:invert transition-[filter] duration-300" />
                <span><b>Simpler</b> Development</span>
              </Link>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-8">
              {!pathname.startsWith('/admin') && (
                <>
                  {navLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`text-sm font-heading font-semibold hover:text-primary transition-colors ${
                        pathname === link.href ? 'text-primary' : ''
                      }`}
                    >
                      {link.label}
                    </Link>
                  ))}
                </>
              )}

              <ThemeToggle />

              {session ? (
                <UserDropdown user={session.user} />
              ) : !pathname.startsWith('/admin') ? (
                <Button href="/contact" size="sm">
                  Book a Call
                </Button>
              ) : (
                <Link
                  href="/admin/login"
                  className="text-sm font-heading font-semibold hover:text-primary transition-colors"
                >
                  Login
                </Link>
              )}
            </div>

            {/* Mobile Menu Button & Theme Toggle */}
            <div className="flex items-center space-x-4 md:hidden">
              <ThemeToggle />
              <button
                onClick={toggleMobileMenu}
                className="inline-flex items-center justify-center p-2 rounded-md hover:bg-accent transition-all duration-200 hover:scale-110"
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
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden transition-opacity duration-300 ${
          mobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={closeMobileMenu}
        aria-hidden="true"
      />

      {/* Mobile Menu Slide-in Panel */}
      <div
        className={`fixed top-16 right-0 bottom-0 w-72 bg-background border-l shadow-2xl z-40 md:hidden transform transition-transform duration-300 ease-out ${
          mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-full overflow-y-auto">
          <div className="px-4 py-6 space-y-2">
            {!pathname.startsWith('/admin') && (
              <>
                <div className="text-xs font-semibold text-muted-foreground tracking-wider mb-4 px-3">
                  Navigation
                </div>
                {navLinks.map((link, index) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={closeMobileMenu}
                    className={`group flex items-center px-4 py-4 rounded-lg text-lg font-heading font-semibold hover:bg-primary/10 hover:text-primary transition-all duration-200 hover:translate-x-1 ${
                      pathname === link.href ? 'bg-primary/10 text-primary' : ''
                    }`}
                    style={{
                      animation: mobileMenuOpen ? `slideIn 0.3s ease-out ${index * 0.05}s both` : 'none'
                    }}
                  >
                    <span>{link.label}</span>
                  </Link>
                ))}

                {/* Mobile CTA */}
                <div className="pt-2 px-4">
                  <Button href="/contact" size="md" className="w-full justify-center" onClick={closeMobileMenu}>
                    Book a Call
                  </Button>
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
                    className="flex items-center px-4 py-4 rounded-lg text-lg font-heading font-semibold hover:bg-accent transition-all duration-200 hover:translate-x-1"
                  >
                    <span>Dashboard</span>
                  </Link>
                  <Link
                    href="/admin/settings"
                    onClick={closeMobileMenu}
                    className="flex items-center px-4 py-4 rounded-lg text-lg font-heading font-semibold hover:bg-accent transition-all duration-200 hover:translate-x-1"
                  >
                    <span>Settings</span>
                  </Link>
                </div>
              ) : (
                <Link
                  href="/admin/login"
                  onClick={closeMobileMenu}
                  className="flex items-center justify-center px-4 py-3 rounded-lg text-base font-heading font-semibold text-muted-foreground hover:text-primary transition-all duration-200"
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
