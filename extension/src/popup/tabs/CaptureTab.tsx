import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiAuthError, ApiNetworkError, ApiNotConfiguredError } from '../../lib/api';
import type {
  Extract,
  ExtractedCompany,
  ExtractedPerson,
  NotesRelated,
  SearchCompany,
  SearchContact,
  SearchDeal,
  SlimNote,
} from '../../lib/types';
import type { ExtractedPage, ExtractedPageResponse, PageKind } from '../../lib/messages';
import { TagInput } from '../components/TagInput';
import { Spinner } from '../components/Spinner';
import type { ToastLevel } from '../components/Toast';

interface Props {
  portalUrl: string;
  onToast(level: ToastLevel, text: string, href?: string): void;
}

export function CaptureTab({ portalUrl, onToast }: Props) {
  const [page, setPage] = useState<ExtractedPage | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [extract, setExtract] = useState<Extract | null>(null);
  const [extractLoading, setExtractLoading] = useState(false);
  const [related, setRelated] = useState<NotesRelated | null>(null);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [selectedContact, setSelectedContact] = useState<SearchContact | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<SearchCompany | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<SearchDeal | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedNoteId, setSavedNoteId] = useState<string | number | null>(null);
  const [addedPeople, setAddedPeople] = useState<Record<number, { id: string | number; existing?: boolean }>>({});
  const [addedCompanies, setAddedCompanies] = useState<Record<number, { id: string | number; existing?: boolean }>>({});
  const [addingIdx, setAddingIdx] = useState<string | null>(null);
  const userTouchedRef = useRef({ title: false, body: false, tags: false });

  // Step 1: extract page from active tab
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id || !tab.url || !/^https?:/i.test(tab.url)) {
          setPageError('No capturable page in this tab.');
          return;
        }
        const resp = await new Promise<ExtractedPageResponse>((resolve, reject) => {
          chrome.tabs.sendMessage(
            tab.id!,
            { type: 'EXTRACT_PAGE' },
            (r: ExtractedPageResponse) => {
              const e = chrome.runtime.lastError;
              if (e) reject(new Error(e.message));
              else resolve(r);
            }
          );
        }).catch((e: Error) => ({ ok: false as const, error: e.message }));

        if (cancelled) return;

        if (!resp || !resp.ok) {
          setPageError(
            resp && !resp.ok
              ? `Couldn't read page (${resp.error}). Try reloading the tab.`
              : "Couldn't read page."
          );
          // still set a minimal page so user can save URL+title
          setPage({
            url: tab.url,
            title: tab.title ?? '',
            text: '',
            html: '',
            selection: '',
            pageKind: 'article',
          });
          return;
        }
        setPage(resp.data);
        if (!userTouchedRef.current.title) setTitle(resp.data.title || '');
      } catch (err) {
        if (cancelled) return;
        setPageError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Step 2: kick off /extract + /notes/related once we have a page
  useEffect(() => {
    if (!page) return;
    let cancelled = false;
    setExtractLoading(true);

    Promise.allSettled([
      api.extract({ url: page.url, title: page.title, text: page.text, html: page.html }),
      api.notesRelated(page.url, 5),
    ]).then(([extractRes, relatedRes]) => {
      if (cancelled) return;

      if (extractRes.status === 'fulfilled') {
        const ex = extractRes.value;
        setExtract(ex);
        // Pre-fill, but only if user hasn't touched the field
        if (!userTouchedRef.current.title) {
          const t = ex.suggestedNote?.title || page.title || '';
          setTitle(t);
        }
        if (!userTouchedRef.current.body) {
          const sel = page.selection.trim();
          const summary = ex.suggestedNote?.body || ex.summary || '';
          setBody(sel ? `> ${sel}\n\n${summary}`.trim() : summary);
        }
        if (!userTouchedRef.current.tags) {
          const fromExtract = ex.suggestedNote?.tags?.length
            ? ex.suggestedNote.tags
            : ex.tags ?? [];
          setTags(Array.from(new Set([...fromExtract, 'from-extension'])));
        }
      } else {
        const err = extractRes.reason;
        if (err instanceof ApiNotConfiguredError) {
          onToast('error', 'Not configured. Open settings.');
        } else if (err instanceof ApiAuthError) {
          onToast('error', 'Invalid API key. Open settings.');
        } else if (err instanceof ApiNetworkError) {
          onToast('error', "Couldn't reach portal.");
        } else {
          onToast('info', 'AI extract unavailable. You can still save manually.');
        }
        // Still set defaults so user can write
        if (!userTouchedRef.current.title) setTitle(page.title || '');
        if (!userTouchedRef.current.body) {
          const sel = page.selection.trim();
          setBody(sel ? `> ${sel}` : '');
        }
        if (!userTouchedRef.current.tags) setTags(['from-extension']);
      }
      setExtractLoading(false);

      if (relatedRes.status === 'fulfilled') {
        setRelated(relatedRes.value);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [page, onToast]);

  const tagSuggestions = useMemo(() => {
    if (!extract) return [];
    return Array.from(new Set([...(extract.tags ?? []), ...(extract.suggestedNote?.tags ?? [])]));
  }, [extract]);

  async function onSave() {
    if (!page) return;
    if (!title.trim()) {
      onToast('error', 'Title is required.');
      return;
    }
    setSaving(true);
    try {
      const note = await api.createNote({
        title: title.trim(),
        body,
        tags,
        sourceUrl: page.url,
        contactId: selectedContact?.id ?? undefined,
        companyId: selectedCompany?.id ?? undefined,
        dealId: selectedDeal?.id ?? undefined,
      });
      setSavedNoteId(note.id);
      const portal = portalUrl.replace(/\/+$/, '');
      onToast(
        'success',
        'Saved to Brain.',
        portal ? `${portal}/portal/brain/notes/${note.id}` : undefined
      );
      // refresh badge
      chrome.runtime.sendMessage({ type: 'REFRESH_BADGE' }).catch(() => {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onToast('error', msg);
    } finally {
      setSaving(false);
    }
  }

  async function onAddPerson(idx: number, p: ExtractedPerson) {
    setAddingIdx(`p:${idx}`);
    try {
      const { firstName, lastName } = splitName(p.name);
      const created = await api.createContact({
        firstName,
        lastName,
        email: p.email ?? undefined,
        title: p.title ?? undefined,
        displayName: p.name,
        source: 'extension',
      });
      setAddedPeople((m) => ({ ...m, [idx]: { id: created.id } }));
      onToast('success', `Added ${p.name} to CRM.`);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : String(err));
    } finally {
      setAddingIdx(null);
    }
  }

  async function onAddCompany(idx: number, c: ExtractedCompany) {
    setAddingIdx(`c:${idx}`);
    try {
      const created = await api.createCompany({
        name: c.name,
        domain: c.domain ?? undefined,
      });
      const existing = (created as { _existing?: boolean })._existing === true;
      setAddedCompanies((m) => ({ ...m, [idx]: { id: created.id, existing } }));
      onToast(existing ? 'info' : 'success', existing ? `${c.name} already in CRM.` : `Added ${c.name} to CRM.`);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : String(err));
    } finally {
      setAddingIdx(null);
    }
  }

  // Heuristic: an extracted person is "in CRM" if their email matches a related contact.
  function personInCrm(p: ExtractedPerson) {
    if (!p.email || !extract?.relatedRecords?.contacts) return undefined;
    const lc = p.email.toLowerCase();
    return extract.relatedRecords.contacts.find((c) => (c.email ?? '').toLowerCase() === lc);
  }

  function companyInCrm(c: ExtractedCompany) {
    if (!extract?.relatedRecords?.companies) return undefined;
    const dom = (c.domain ?? '').toLowerCase();
    const name = c.name.toLowerCase();
    return extract.relatedRecords.companies.find(
      (rc) => (dom && (rc.domain ?? '').toLowerCase() === dom) || rc.name.toLowerCase() === name,
    );
  }

  const people = extract?.entities?.people ?? [];
  const companies = extract?.entities?.companies ?? [];

  const portal = portalUrl.replace(/\/+$/, '');

  return (
    <div className="p-3 space-y-3 text-sm">
      {pageError && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-900 text-xs">
          {pageError}
        </div>
      )}

      {/* Page header */}
      {page && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-slate-50 border border-slate-200">
          <PageKindIcon kind={page.pageKind} />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-slate-900 truncate">{page.title || page.url}</div>
            <div className="text-xs text-slate-500 truncate">{page.url}</div>
          </div>
          <PageKindLabel kind={page.pageKind} />
        </div>
      )}

      {/* AI summary */}
      <Section title="AI Summary">
        {extractLoading ? (
          <SkeletonLines lines={3} />
        ) : extract?.summary ? (
          <p className="text-xs text-slate-600 leading-relaxed">{extract.summary}</p>
        ) : (
          <p className="text-xs text-slate-400">No summary available.</p>
        )}
      </Section>

      {/* Extracted entities — one-click "Add to CRM" */}
      {(people.length > 0 || companies.length > 0) && (
        <Section title="Detected in page">
          <div className="space-y-1.5">
            {people.map((p, i) => {
              const inCrm = personInCrm(p);
              const added = addedPeople[i];
              const busy = addingIdx === `p:${i}`;
              return (
                <EntityRow
                  key={`p-${i}`}
                  iconKind="person"
                  label={p.name}
                  sub={[p.title, p.company].filter(Boolean).join(' · ') || p.email || undefined}
                  rightSlot={
                    inCrm || added ? (
                      <a
                        href={portal && (inCrm?.id ?? added?.id) ? `${portal}/portal/crm/contacts/${inCrm?.id ?? added?.id}` : '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-emerald-700 hover:underline"
                      >
                        {inCrm ? 'In CRM' : added?.existing ? 'Existed' : 'Added'}
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onAddPerson(i, p)}
                        className="inline-flex items-center gap-1 rounded-full border border-brand-300 px-2 py-0.5 text-[11px] text-brand-700 hover:bg-brand-50 disabled:opacity-50"
                      >
                        {busy ? <Spinner size={10} /> : <span aria-hidden>+</span>}
                        Contact
                      </button>
                    )
                  }
                />
              );
            })}
            {companies.map((c, i) => {
              const inCrm = companyInCrm(c);
              const added = addedCompanies[i];
              const busy = addingIdx === `c:${i}`;
              return (
                <EntityRow
                  key={`c-${i}`}
                  iconKind="company"
                  label={c.name}
                  sub={[c.domain, c.description].filter(Boolean).join(' · ') || undefined}
                  rightSlot={
                    inCrm || added ? (
                      <a
                        href={portal && (inCrm?.id ?? added?.id) ? `${portal}/portal/crm/companies/${inCrm?.id ?? added?.id}` : '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-emerald-700 hover:underline"
                      >
                        {inCrm ? 'In CRM' : added?.existing ? 'Existed' : 'Added'}
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onAddCompany(i, c)}
                        className="inline-flex items-center gap-1 rounded-full border border-brand-300 px-2 py-0.5 text-[11px] text-brand-700 hover:bg-brand-50 disabled:opacity-50"
                      >
                        {busy ? <Spinner size={10} /> : <span aria-hidden>+</span>}
                        Company
                      </button>
                    )
                  }
                />
              );
            })}
          </div>
        </Section>
      )}

      {/* Form */}
      <div className="space-y-2">
        <Field label="Title">
          <input
            type="text"
            value={title}
            onChange={(e) => {
              userTouchedRef.current.title = true;
              setTitle(e.target.value);
            }}
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-500"
          />
        </Field>
        <Field label="Body">
          <textarea
            value={body}
            onChange={(e) => {
              userTouchedRef.current.body = true;
              setBody(e.target.value);
            }}
            rows={4}
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-500 resize-y"
          />
        </Field>
        <Field label="Tags">
          <TagInput
            value={tags}
            onChange={(next) => {
              userTouchedRef.current.tags = true;
              setTags(next);
            }}
            suggestions={tagSuggestions}
          />
        </Field>

        <details className="text-xs">
          <summary className="cursor-pointer text-slate-500 hover:text-slate-900 select-none">
            Attach to record (optional)
          </summary>
          <div className="mt-2 space-y-2">
            <ContactPicker value={selectedContact} onChange={setSelectedContact} />
            <CompanyPicker value={selectedCompany} onChange={setSelectedCompany} />
            <DealPicker value={selectedDeal} onChange={setSelectedDeal} />
          </div>
        </details>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !page}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && <Spinner size={14} />}
            {saving ? 'Saving...' : savedNoteId ? 'Save another' : 'Save Note'}
          </button>
          {savedNoteId && portal ? (
            <a
              href={`${portal}/portal/brain/notes/${savedNoteId}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-brand-700 hover:underline"
            >
              View in portal
            </a>
          ) : null}
        </div>
      </div>

      {/* Related notes */}
      <Section title="Already in Brain">
        {related === null ? (
          <SkeletonLines lines={2} />
        ) : (related.exact?.length ?? 0) + (related.domain?.length ?? 0) === 0 ? (
          <p className="text-xs text-slate-400">No related notes yet.</p>
        ) : (
          <div className="space-y-1.5">
            {related.exact?.length ? (
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wide text-slate-400">Exact URL</div>
                {related.exact.map((n) => (
                  <RelatedNote key={String(n.id)} note={n} portal={portal} />
                ))}
              </div>
            ) : null}
            {related.domain?.length ? (
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wide text-slate-400">Same domain</div>
                {related.domain.map((n) => (
                  <RelatedNote key={String(n.id)} note={n} portal={portal} />
                ))}
              </div>
            ) : null}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      {children}
    </div>
  );
}

function EntityRow({
  iconKind,
  label,
  sub,
  rightSlot,
}: {
  iconKind: 'person' | 'company';
  label: string;
  sub?: string;
  rightSlot: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white p-2">
      <PageKindIcon kind={iconKind} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-slate-900 truncate">{label}</div>
        {sub ? <div className="text-[11px] text-slate-500 truncate">{sub}</div> : null}
      </div>
      <div className="shrink-0">{rightSlot}</div>
    </div>
  );
}

function splitName(full: string): { firstName?: string; lastName?: string } {
  const trimmed = full.trim();
  if (!trimmed) return {};
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function SkeletonLines({ lines }: { lines: number }) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton h-3 w-full" />
      ))}
    </div>
  );
}

function PageKindIcon({ kind }: { kind: PageKind }) {
  if (kind === 'person') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-600 shrink-0">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    );
  }
  if (kind === 'company') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-600 shrink-0">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 21V9h6v12M3 9h18" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-600 shrink-0">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  );
}

function PageKindLabel({ kind }: { kind: PageKind }) {
  return (
    <span className="text-[10px] uppercase tracking-wide text-slate-400 shrink-0">{kind}</span>
  );
}

function RelatedNote({ note, portal }: { note: SlimNote; portal: string }) {
  return (
    <a
      href={portal ? `${portal}/portal/brain/notes/${note.id}` : '#'}
      target="_blank"
      rel="noreferrer"
      className="block rounded-md border border-slate-200 bg-white p-2 hover:border-brand-300 hover:bg-brand-50/40 transition-colors"
    >
      <div className="text-xs font-medium text-slate-900 truncate">{note.title}</div>
      {note.snippet ? (
        <div className="text-[11px] text-slate-500 line-clamp-2">{note.snippet}</div>
      ) : null}
    </a>
  );
}

// --- Pickers ---------------------------------------------------------------

function useDebouncedSearch<T>(
  search: string,
  loader: (q: string) => Promise<T[]>,
  delayMs = 250
): { items: T[]; loading: boolean } {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (search.length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const out = await loader(search);
        if (!cancelled) setItems(out);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, delayMs);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, delayMs, loader]);

  return { items, loading };
}

function ContactPicker({
  value,
  onChange,
}: {
  value: SearchContact | null;
  onChange(v: SearchContact | null): void;
}) {
  const [search, setSearch] = useState('');
  const { items, loading } = useDebouncedSearch(search, async (q) => {
    const out = await api.searchContacts(q, 6);
    return out.items;
  });
  if (value) {
    return (
      <PickedRow
        label="Contact"
        text={
          [value.firstName, value.lastName].filter(Boolean).join(' ').trim() ||
          value.email ||
          String(value.id)
        }
        onClear={() => onChange(null)}
      />
    );
  }
  return (
    <PickerInput
      placeholder="Search contacts..."
      value={search}
      onChange={setSearch}
      loading={loading}
    >
      {items.map((c) => (
        <button
          type="button"
          key={String(c.id)}
          className="block w-full text-left px-2 py-1 text-xs hover:bg-slate-100"
          onClick={() => {
            onChange(c);
            setSearch('');
          }}
        >
          <div className="font-medium text-slate-900 truncate">
            {[c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || `#${c.id}`}
          </div>
          {c.email ? <div className="text-slate-500 truncate">{c.email}</div> : null}
        </button>
      ))}
    </PickerInput>
  );
}

function CompanyPicker({
  value,
  onChange,
}: {
  value: SearchCompany | null;
  onChange(v: SearchCompany | null): void;
}) {
  const [search, setSearch] = useState('');
  const { items, loading } = useDebouncedSearch(search, async (q) => {
    const out = await api.searchCompanies(q, 6);
    return out.items;
  });
  if (value) {
    return <PickedRow label="Company" text={value.name} onClear={() => onChange(null)} />;
  }
  return (
    <PickerInput
      placeholder="Search companies..."
      value={search}
      onChange={setSearch}
      loading={loading}
    >
      {items.map((c) => (
        <button
          type="button"
          key={String(c.id)}
          className="block w-full text-left px-2 py-1 text-xs hover:bg-slate-100"
          onClick={() => {
            onChange(c);
            setSearch('');
          }}
        >
          <div className="font-medium text-slate-900 truncate">{c.name}</div>
          {c.domain ? <div className="text-slate-500 truncate">{c.domain}</div> : null}
        </button>
      ))}
    </PickerInput>
  );
}

function DealPicker({
  value,
  onChange,
}: {
  value: SearchDeal | null;
  onChange(v: SearchDeal | null): void;
}) {
  const [items, setItems] = useState<SearchDeal[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    api.listDeals('open', 20).then(
      (out) => {
        if (!cancelled) setItems(out.items);
      },
      () => {
        if (!cancelled) setItems([]);
      }
    ).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (value) {
    return <PickedRow label="Deal" text={value.title} onClear={() => onChange(null)} />;
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-slate-400 w-16 shrink-0">Deal</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-700 hover:border-brand-400"
        >
          {open ? 'Hide' : 'Pick a deal'}
        </button>
        {loading && <Spinner size={12} />}
      </div>
      {open && (
        <div className="max-h-32 overflow-y-auto rounded-md border border-slate-200 bg-white">
          {items.length === 0 && !loading ? (
            <div className="text-xs text-slate-400 px-2 py-1">No open deals.</div>
          ) : (
            items.map((d) => (
              <button
                type="button"
                key={String(d.id)}
                className="block w-full text-left px-2 py-1 text-xs hover:bg-slate-100"
                onClick={() => {
                  onChange(d);
                  setOpen(false);
                }}
              >
                <div className="font-medium text-slate-900 truncate">{d.title}</div>
                {d.stage ? <div className="text-slate-500 truncate">{d.stage}</div> : null}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function PickedRow({
  label,
  text,
  onClear,
}: {
  label: string;
  text: string;
  onClear(): void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wide text-slate-400 w-16 shrink-0">{label}</span>
      <div className="flex-1 inline-flex items-center justify-between gap-2 rounded-md bg-brand-50 border border-brand-200 px-2 py-1 text-xs">
        <span className="truncate font-medium text-brand-800">{text}</span>
        <button
          type="button"
          className="text-brand-700 opacity-70 hover:opacity-100"
          onClick={onClear}
          aria-label="Clear"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function PickerInput({
  value,
  onChange,
  placeholder,
  loading,
  children,
}: {
  value: string;
  onChange(v: string): void;
  placeholder: string;
  loading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-brand-500"
        />
        {loading && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
            <Spinner size={12} />
          </div>
        )}
      </div>
      {value.length >= 2 && (
        <div className="max-h-32 overflow-y-auto rounded-md border border-slate-200 bg-white">
          {children}
        </div>
      )}
    </div>
  );
}
