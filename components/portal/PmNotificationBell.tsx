'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const POLL_MS = 60_000;

export default function PmNotificationBell() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const res = await fetch('/api/portal/notifications?unread=1&limit=1');
        const data = await res.json();
        if (!cancelled && data.success) setUnread(data.data.unread ?? 0);
      } catch {
        // network glitches; the next poll will recover
      }
    }
    tick();
    const handle = setInterval(tick, POLL_MS);
    return () => { cancelled = true; clearInterval(handle); };
  }, []);

  return (
    <Link
      href="/portal/notifications"
      className="relative p-2 rounded-lg hover:bg-accent transition-colors"
      aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
    >
      <span className="material-icons text-muted-foreground">notifications</span>
      {unread > 0 && (
        <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}
