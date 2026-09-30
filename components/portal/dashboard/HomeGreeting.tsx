'use client';

// The redesign's Home masthead (PUX-145): "Tuesday 26 August" / "Good
// afternoon, Marta." Time of day and "today" belong to the VIEWER's clock, not
// the server's UTC — so both render a neutral string on the server and the
// local one on the client. useSyncExternalStore with a server snapshot is the
// React 19 idiom for exactly that: no effect, no setState, no hydration
// mismatch, no timezone column to add.
import { useSyncExternalStore } from 'react';

const never = () => () => {};
const dayPart = () => { const h = new Date().getHours(); return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'; };
const today = () => new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });

export function Greeting({ name }: { name?: string | null }) {
  const part = useSyncExternalStore(never, dayPart, () => null);
  const who = name ? `, ${name}` : '';
  return <>{part ? `Good ${part}${who}.` : `Welcome back${who}.`}</>;
}

export function TodayLine({ tail }: { tail?: string }) {
  const day = useSyncExternalStore(never, today, () => null);
  return <>{day ?? 'Today'}{tail ? ` · ${tail}` : ''}</>;
}
