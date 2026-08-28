/**
 * PUX-195 (design doc screen 54): the settings landing — one card per real
 * leaf. No sessions card: NextAuth runs JWT-only with no sessions table.
 */
import Link from 'next/link';
import { SETTINGS_TABS } from '../_lib/tabs';

export default function SettingsIndex() {
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-label="Settings index">
      {SETTINGS_TABS.map((t) => (
        <Link key={t.href} href={t.href} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-[var(--studio-line-strong)]">
          <span className="material-icons text-xl text-muted-foreground">{t.icon}</span>
          <span>
            <span className="block font-medium text-foreground">{t.label}</span>
            <span className="block text-sm text-muted-foreground">{t.description}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
