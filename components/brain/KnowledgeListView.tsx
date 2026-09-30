'use client';

// Knowledge as a list (PUX-159, design doc screen 18): "Every note, call and
// document your company has captured, filtered by topic." Shown under the
// redesign when no note is open; opening a row hands off to the existing
// three-pane editor (onSelect → ?id=). Import wires the upload route nothing
// in the UI called before. Type is computed (lib/brain/note-type.ts); topics
// ride along via ?withTopics=1.
import { useEffect, useMemo, useState } from 'react';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { EmptyState } from '@/components/portal/EmptyState';
import { sBtn, sBtnGhost } from '@/components/portal/portal-ui';
import { filterRows, shapeKnowledgeRows, typeCounts, type KnowledgeApiRow, type KnowledgeRow } from '@/lib/brain/knowledge-list-shape';
import { NOTE_TYPE_ICON, type NoteType } from '@/lib/brain/note-type';

interface Topic { id: number; name: string }
interface SavedSearch { id: number; name: string; icon: string; filters: { search?: string; tagPrefix?: string; tags?: string[] } }

const card = 'overflow-hidden rounded-2xl border border-border bg-card';
const chip = (on: boolean) => `rounded-full border px-2.5 py-1 text-xs transition-colors ${on ? 'border-primary bg-accent text-accent-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`;

export default function KnowledgeListView({ onSelect, onCreate, refreshTick = 0 }: { onSelect: (id: number) => void; onCreate: () => void; refreshTick?: number }) {
  const [rows, setRows] = useState<KnowledgeRow[] | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [saved, setSaved] = useState<SavedSearch[]>([]);
  const [type, setType] = useState<NoteType | null>(null);
  const [topicId, setTopicId] = useState<number | null>(null);
  const [query, setQuery] = useState<{ search?: string; tag?: string; tagPrefix?: string }>({});
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    const qs = new URLSearchParams({ sort: 'updated', order: 'desc', limit: '100', withTopics: '1' });
    if (query.search) qs.set('search', query.search);
    if (query.tag) qs.set('tag', query.tag);
    if (query.tagPrefix) qs.set('tagPrefix', query.tagPrefix);
    fetch(`/api/portal/brain/knowledge?${qs}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j) => setRows(shapeKnowledgeRows((j?.data?.items ?? []) as KnowledgeApiRow[])))
      .catch(() => setRows([]));
    return () => ctrl.abort();
  }, [query, tick, refreshTick]);

  useEffect(() => {
    fetch('/api/portal/brain/topics').then((r) => r.json()).then((j) => setTopics((j?.data?.items ?? j?.data ?? []) as Topic[])).catch(() => {});
    fetch('/api/portal/brain/saved-searches').then((r) => r.json()).then((j) => setSaved((j?.data?.items ?? []) as SavedSearch[])).catch(() => {});
  }, []);

  const counts = useMemo(() => typeCounts(rows ?? []), [rows]);
  const shown = useMemo(() => filterRows(rows ?? [], { type, topicId }), [rows, type, topicId]);

  async function importFile(file: File) {
    setBusy(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await fetch('/api/portal/brain/knowledge/upload', { method: 'POST', body: fd });
      if (r.ok) setTick((t) => t + 1);
    } finally { setBusy(false); }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-5 p-6">
        <PortalPageHeader
          eyebrow="Brain"
          title="Knowledge"
          subtitle={rows ? `${rows.length} note${rows.length === 1 ? '' : 's'} · ${rows.filter((r) => r.status === 'Needs review').length} need review` : 'Loading…'}
          actions={(
            <span className="flex gap-2">
              <label className={`${sBtnGhost} cursor-pointer ${busy ? 'opacity-50' : ''}`}>
                <span className="material-icons text-base">upload</span>Import
                <input type="file" className="sr-only" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} />
              </label>
              <button type="button" onClick={onCreate} className={sBtn}><span className="material-icons text-base">note_add</span>New note</button>
            </span>
          )}
        />

        <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="space-y-4">
            <section className={card}>
              <h3 className="px-3.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Type</h3>
              <div className="flex flex-wrap gap-1.5 px-3.5 pb-3">
                <button type="button" className={chip(type === null)} onClick={() => setType(null)}>All</button>
                {(Object.keys(counts) as NoteType[]).map((t) => (
                  <button key={t} type="button" className={chip(type === t)} onClick={() => setType(type === t ? null : t)}>{t} <span className="font-mono">{counts[t]}</span></button>
                ))}
              </div>
            </section>
            <section className={card}>
              <h3 className="px-3.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Topics</h3>
              {topics.length === 0 ? <p className="px-3.5 pb-3 text-xs text-muted-foreground">No topics yet — the Brain files notes here as it reads them.</p> : (
                <div className="flex flex-wrap gap-1.5 px-3.5 pb-3">
                  {topics.map((t) => <button key={t.id} type="button" className={chip(topicId === t.id)} onClick={() => setTopicId(topicId === t.id ? null : t.id)}>{t.name}</button>)}
                </div>
              )}
            </section>
            <section className={card}>
              <h3 className="px-3.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Saved searches</h3>
              {saved.length === 0 ? <p className="px-3.5 pb-3 text-xs text-muted-foreground">Save a search from the editor view and it lands here.</p> : (
                <ul className="pb-2">
                  {saved.map((s) => (
                    <li key={s.id}>
                      <button type="button" onClick={() => setQuery({ search: s.filters.search, tag: s.filters.tags?.[0], tagPrefix: s.filters.tagPrefix })} className="flex w-full items-center gap-2 px-3.5 py-1.5 text-left text-sm text-foreground hover:bg-muted/50">
                        <span className="material-icons text-base text-muted-foreground">{s.icon || 'bookmark'}</span>{s.name}
                      </button>
                    </li>
                  ))}
                  {(query.search || query.tag || query.tagPrefix) && <li><button type="button" onClick={() => setQuery({})} className="px-3.5 py-1.5 text-xs text-muted-foreground hover:text-foreground">Clear</button></li>}
                </ul>
              )}
            </section>
          </div>

          <section className={card}>
            {rows === null ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">Loading…</p>
            ) : shown.length === 0 ? (
              <EmptyState className="p-6" title="Everything your company knows, in one place." body="Paste notes, drop a call recording or a document, or import a page — the Brain reads it, files it by topic, and answers from it." cta={{ label: 'New note', icon: 'note_add', onClick: onCreate }} ghostLabel="Call · Doc · Meeting · Web" />
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr><th className="px-4 py-2">Title</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Source</th><th className="px-3 py-2">Topics</th><th className="px-3 py-2">Updated</th><th className="px-3 py-2">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {shown.map((r) => (
                    <tr key={r.id} onClick={() => onSelect(r.id)} className="cursor-pointer hover:bg-muted/50">
                      <td className="px-4 py-2.5 font-medium text-foreground">{r.title}</td>
                      <td className="px-3 py-2.5"><span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"><span className="material-icons text-[13px]">{NOTE_TYPE_ICON[r.type]}</span>{r.type}</span></td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.source}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.topics.map((t) => t.name).join(', ') || '—'}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.when}</td>
                      <td className="px-3 py-2.5">{r.status === 'Needs review' ? <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-[var(--studio-gold-soft)] text-[var(--studio-gold-ink)]">Needs review</span> : <span className="rounded-full px-2 py-0.5 text-[11px] bg-[var(--portal-ok-bg)] text-[var(--portal-ok)]">Reviewed</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
