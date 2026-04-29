'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/portal/settings/profile', label: 'Profile', icon: 'person' },
  { href: '/portal/settings/billing', label: 'Billing', icon: 'payments' },
  { href: '/portal/settings/team', label: 'Team', icon: 'group' },
  { href: '/portal/settings/ai', label: 'AI Assistant', icon: 'smart_toy' },
  { href: '/portal/settings/api-keys', label: 'API Keys', icon: 'vpn_key' },
  { href: '/portal/settings/integrations', label: 'Integrations', icon: 'integration_instructions' },
  { href: '/portal/settings/support', label: 'Support', icon: 'support_agent' },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your account, billing, team, and support.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map(tab => {
          const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/');
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
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

      <div>{children}</div>
    </div>
  );
}
