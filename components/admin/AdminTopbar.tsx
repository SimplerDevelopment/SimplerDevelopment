'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { crumbsForPath } from '@/lib/admin/nav';

/**
 * Sticky top bar: breadcrumbs (left) + global search / ⌘K trigger, theme
 * toggle and notifications (right). The search button dispatches the same
 * window event the ⌘K shortcut uses, so CommandPalette stays decoupled.
 */
export default function AdminTopbar({
  theme,
  onToggleTheme,
}: {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}) {
  const pathname = usePathname();
  const crumbs = crumbsForPath(pathname);

  const openPalette = () => window.dispatchEvent(new CustomEvent('admin:openCommandPalette'));

  return (
    <header
      className="sticky top-0 z-20 h-14 flex items-center gap-3.5 px-5 border-b border-border"
      style={{
        background: 'color-mix(in srgb, var(--background) 80%, transparent)',
        backdropFilter: 'saturate(180%) blur(12px)',
        WebkitBackdropFilter: 'saturate(180%) blur(12px)',
      }}
    >
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 min-w-0 text-[13px] text-muted-foreground">
        <span className="material-icons text-base shrink-0">{pathname === '/admin' ? 'space_dashboard' : 'chevron_right'}</span>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <span key={c.href} className="flex items-center gap-2 min-w-0">
              {i > 0 && <span className="text-muted-foreground opacity-50">/</span>}
              {last ? (
                <span className="text-foreground font-medium truncate">{c.label}</span>
              ) : (
                <Link href={c.href} className="hover:text-foreground transition-colors truncate">{c.label}</Link>
              )}
            </span>
          );
        })}
      </nav>

      <button
        onClick={openPalette}
        className="ml-auto flex items-center gap-2 h-8 pl-2.5 pr-2 min-w-[230px] rounded-md border border-border bg-[var(--admin-surface-2)] text-muted-foreground text-[13px] hover:border-[var(--admin-border-strong)] transition-colors"
      >
        <span className="material-icons text-base">search</span>
        <span className="truncate">Search clients, pages, actions…</span>
        <kbd className="ml-auto font-mono text-[11px] px-1.5 py-px rounded border border-border bg-card text-muted-foreground">⌘K</kbd>
      </button>

      <button
        onClick={() => alert('Notifications — coming soon')}
        className="grid place-items-center w-8 h-8 rounded-md border border-border bg-[var(--admin-surface-2)] text-foreground hover:border-[var(--admin-border-strong)] transition-colors"
        aria-label="Notifications"
      >
        <span className="material-icons text-[18px]">notifications</span>
      </button>

      <button
        onClick={onToggleTheme}
        className="grid place-items-center w-8 h-8 rounded-md border border-border bg-[var(--admin-surface-2)] text-foreground hover:border-[var(--admin-border-strong)] transition-colors"
        aria-label="Toggle theme"
      >
        <span className="material-icons text-[18px]">{theme === 'dark' ? 'light_mode' : 'dark_mode'}</span>
      </button>
    </header>
  );
}
