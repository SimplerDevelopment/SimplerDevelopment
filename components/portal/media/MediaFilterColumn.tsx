'use client';

/**
 * PUX-188 (design doc screen 47): the media filters as a left column —
 * search, a type list, and brand when the client has branding profiles.
 * Same state as the legacy inline row; studio-only (page gates on the flag).
 */

import { pInput, pSelect } from '@/components/portal/portal-ui';

const TYPES: { value: string; label: string; icon: string }[] = [
  { value: 'all', label: 'All files', icon: 'perm_media' },
  { value: 'image', label: 'Images', icon: 'image' },
  { value: 'video', label: 'Video', icon: 'videocam' },
  { value: 'application', label: 'Documents', icon: 'description' },
];

export default function MediaFilterColumn({
  search, setSearch, filter, setFilter, profileFilter, setProfileFilter, brandingProfiles, total,
}: {
  search: string; setSearch: (v: string) => void;
  filter: string; setFilter: (v: string) => void;
  profileFilter: string; setProfileFilter: (v: string) => void;
  brandingProfiles: { id: number; name: string }[];
  total: number;
}) {
  return (
    <aside className="space-y-4" aria-label="Media filters">
      <input type="search" placeholder="Search files…" value={search} onChange={(e) => setSearch(e.target.value)} className={pInput} aria-label="Search media" />
      <ul className="space-y-0.5">
        {TYPES.map((t) => {
          const active = filter === t.value;
          return (
            <li key={t.value}>
              <button type="button" aria-pressed={active} onClick={() => setFilter(t.value)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ${active ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}>
                <span className="material-icons text-base">{t.icon}</span>
                {t.label}
                {t.value === 'all' && <span className={`ml-auto tabular-nums text-xs ${active ? 'text-background/70' : 'text-muted-foreground/70'}`}>{total}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {brandingProfiles.length > 0 && (
        <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
          Brand
          <select value={profileFilter} onChange={(e) => setProfileFilter(e.target.value)} className={pSelect}>
            <option value="">All brands</option>
            {brandingProfiles.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
            <option value="unassigned">Unassigned</option>
          </select>
        </label>
      )}
    </aside>
  );
}
