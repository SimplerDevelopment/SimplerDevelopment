'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import type { NavGroup } from '../_lib/nav';
import { DocsSidebarNav } from './DocsSidebarNav';

/**
 * Docs shell: sticky header (brand + theme toggle + portal CTA + mobile menu)
 * and the left navigation rail. The page content (article + on-this-page rail)
 * is rendered as children in the main column.
 */
export function DocsChrome({ nav, children }: { nav: NavGroup[]; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <div className="docs-root min-h-screen bg-background text-foreground">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="rounded-md p-2 hover:bg-accent lg:hidden"
            aria-label="Toggle navigation"
            aria-expanded={mobileOpen}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/iconLogo.png" alt="SimplerDevelopment" width={28} height={28} className="rounded" priority />
            <span className="hidden font-semibold tracking-tight sm:inline">SimplerDevelopment</span>
            <span className="rounded-md border border-border px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
              Docs
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-1.5">
            <a
              href="https://github.com/modelcontextprotocol"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:inline-block"
            >
              MCP spec ↗
            </a>
            <ThemeToggle />
            <Link
              href="/portal"
              className="rounded-md bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Portal <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ── Body: left rail + content ──────────────────────────────────────── */}
      <div className="mx-auto flex w-full max-w-[90rem]">
        <aside className="docs-scroll sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 overflow-y-auto border-r border-border px-3 py-6 lg:block">
          <DocsSidebarNav groups={nav} />
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      {/* ── Mobile drawer ──────────────────────────────────────────────────── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className="docs-scroll absolute left-0 top-0 h-full w-72 max-w-[80vw] overflow-y-auto border-r border-border bg-background px-3 py-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between px-2">
              <span className="font-semibold tracking-tight">Documentation</span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-1.5 hover:bg-accent"
                aria-label="Close navigation"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <DocsSidebarNav groups={nav} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
