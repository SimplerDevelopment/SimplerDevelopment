'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/portal/publishing/board',       label: 'Board',       icon: 'view_kanban' },
  { href: '/portal/publishing/calendar',    label: 'Calendar',    icon: 'calendar_month' },
  { href: '/portal/publishing/campaigns',   label: 'Campaigns',   icon: 'campaign' },
  { href: '/portal/publishing/tags',        label: 'Tags',        icon: 'sell' },
  { href: '/portal/publishing/permissions', label: 'Permissions', icon: 'lock', adminOnly: true },
] as const;

export default function PublishingTabs({ canManage }: { canManage: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="border-b border-gray-200 dark:border-gray-800">
      <ul className="flex flex-wrap gap-1 -mb-px">
        {TABS.filter((t) => !t.adminOnly || canManage).map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(tab.href + '/');
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={
                  'inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ' +
                  (active
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100')
                }
              >
                <span className="material-symbols-outlined text-base">{tab.icon}</span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
