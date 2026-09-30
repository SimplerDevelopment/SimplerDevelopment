'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useFeatureFlag } from '@/components/portal/FeatureFlagsProvider';

import { SETTINGS_TABS as tabs } from './_lib/tabs';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // PUX-195: the same links as a left index column under the flag.
  const studio = useFeatureFlag('portal-redesign');

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        {/* This is the page-level h1 for every /portal/settings/** route
            (bypasses <PortalPageHeader/>) — child route content must start
            its own headings at h2, not h3, or the outline skips a level. */}
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your account, billing, team, and support.</p>
      </div>

      {studio ? (
        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
          <nav aria-label="Settings sections" className="space-y-0.5">
            {tabs.map(tab => {
              const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/');
              return (
                <Link key={tab.href} href={tab.href} aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors ${isActive ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}>
                  <span className="material-icons text-base">{tab.icon}</span>
                  {tab.label}
                </Link>
              );
            })}
          </nav>
          <div>{children}</div>
        </div>
      ) : (
        <>
      {/* Tabs */}
      <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0 scrollbar-thin">
        <div className="flex items-center gap-1 border-b border-border whitespace-nowrap">
          {tabs.map(tab => {
            const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/');
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                }`}
              >
                <span className="material-icons text-base">{tab.icon}</span>
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div>{children}</div>
        </>
      )}
    </div>
  );
}
