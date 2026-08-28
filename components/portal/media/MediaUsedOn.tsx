'use client';

/**
 * PUX-188 (design doc screen 47): "Used on n pages" — one read of
 * /api/portal/media/[id]/usages (posts on this client's websites whose block
 * JSON contains the file's URL), each page linking to its editor.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Usage = { count: number; capped: boolean; pages: { id: number; title: string; websiteId: number | null }[] };

export default function MediaUsedOn({ mediaId }: { mediaId: number }) {
  const [usage, setUsage] = useState<Usage | null>(null);
  // Callers mount this with key={mediaId}, so a new file starts from null without a setState in the effect.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/portal/media/${mediaId}/usages`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d.success) setUsage(d.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [mediaId]);
  if (!usage) return <p className="text-xs text-muted-foreground">Checking where it’s used…</p>;
  const n = usage.count;
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-foreground">
        {n === 0 ? 'Not used on any page yet' : `Used on ${usage.capped ? `${n}+` : n} ${n === 1 ? 'page' : 'pages'}`}
      </p>
      {usage.pages.length > 0 && (
        <ul className="space-y-0.5 text-xs">
          {usage.pages.map((p) => (
            <li key={p.id}>
              {p.websiteId
                ? <Link href={`/portal/websites/${p.websiteId}/posts/${p.id}/edit`} className="text-muted-foreground hover:text-foreground hover:underline">{p.title || 'Untitled'}</Link>
                : <span className="text-muted-foreground">{p.title || 'Untitled'}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
