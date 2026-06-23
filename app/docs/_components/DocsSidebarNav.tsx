'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavGroup } from '../_lib/nav';

function href(slug: string): string {
  return slug ? `/docs/${slug}` : '/docs';
}

/** The grouped sidebar list. Shared by the desktop rail and the mobile drawer. */
export function DocsSidebarNav({
  groups,
  onNavigate,
}: {
  groups: NavGroup[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-6 pb-10">
      {groups.map((group, gi) => (
        <div key={gi}>
          {group.label && (
            <p className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </p>
          )}
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const target = href(item.slug);
              const active = pathname === target;
              return (
                <li key={item.slug || 'index'}>
                  <Link
                    href={target}
                    onClick={onNavigate}
                    data-active={active}
                    className="docs-nav-link block rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
