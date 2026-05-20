import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type {
  ExtractedCompany,
  ExtractedPerson,
  SearchCompany,
} from '../../lib/types';
import { Spinner } from './Spinner';
import type { ToastLevel } from './Toast';

/**
 * URL workaround: the /extract route requires `z.string().url()`. For paste-zone
 * signatures we have no real source URL, so we send a non-routable but valid URL
 * (`https://about.invalid/signature`). All four candidates (about:blank,
 * about:signature, extension://signature, https://about.invalid/signature)
 * pass zod's url validator — we pick the most defensive form.
 */
const SIGNATURE_SOURCE_URL = 'https://about.invalid/signature';
const MAX_SIGNATURE_CHARS = 4000;

interface Props {
  onToast(level: ToastLevel, text: string, href?: string): void;
}

interface ContactDraft {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  title: string;
  company: SearchCompany | null;
}

const inputCls =
  'w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-500';

function emptyDraft(): ContactDraft {
  return { firstName: '', lastName: '', email: '', phone: '', title: '', company: null };
}

function splitName(full: string): { firstName: string; lastName: string } {
  const trimmed = (full || '').trim();
  if (!trimmed) return { firstName: '', lastName: '' };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function draftFromPerson(p: ExtractedPerson, signature: string): ContactDraft {
  const { firstName, lastName } = splitName(p.name);
  // Best-effort phone scrape from the raw signature; the model doesn't return it.
  const phoneMatch = signature.match(
    /(\+?\d[\d\s().-]{7,}\d)/,
  );
  return {
    firstName,
    lastName,
    email: p.email ?? '',
    phone: phoneMatch ? phoneMatch[1].trim() : '',
    title: p.title ?? '',
    company: null,
  };
}

export function SignaturePaste({ onToast }: Props) {
  const [open, setOpen] = useState(false);
  const [signature, setSignature] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [draft, setDraft] = useState<ContactDraft>(emptyDraft());
  const [hasExtracted, setHasExtracted] = useState(false);
  const [suggestedCompany, setSuggestedCompany] = useState<ExtractedCompany | null>(null);
  const [companyAdding, setCompanyAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const trimmedLen = signature.trim().length;
  const tooLong = signature.length > MAX_SIGNATURE_CHARS;

  async function handleExtract() {
    const text = signature.slice(0, MAX_SIGNATURE_CHARS).trim();
    if (!text) {
      onToast('error', 'Paste a signature first.');
      return;
    }
    setExtracting(true);
    try {
      const result = await api.extract({
        url: SIGNATURE_SOURCE_URL,
        title: 'Email signature',
        text,
      });
      const person = result.entities?.people?.[0] ?? null;
      const company = result.entities?.companies?.[0] ?? null;
      if (!person && !company) {
        onToast('info', 'No contact details detected.');
        setHasExtracted(true);
        setOpen(true);
        return;
      }
      if (person) {
        setDraft(draftFromPerson(person, text));
      } else {
        setDraft(emptyDraft());
      }
      setSuggestedCompany(company);
      setHasExtracted(true);
      setOpen(true);
      onToast('success', person ? `Extracted ${person.name}.` : 'Detected company.');
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : String(err));
    } finally {
      setExtracting(false);
    }
  }

  async function handleAddSuggestedCompany() {
    if (!suggestedCompany) return;
    setCompanyAdding(true);
    try {
      const created = await api.createCompany({
        name: suggestedCompany.name,
        domain: suggestedCompany.domain ?? undefined,
      });
      const existed = (created as { _existing?: boolean })._existing === true;
      const asPicked: SearchCompany = {
        id: created.id,
        name: created.name,
        domain: created.domain ?? null,
        industry: created.industry ?? null,
        logoUrl: created.logoUrl ?? null,
      };
      setDraft((d) => ({ ...d, company: asPicked }));
      setSuggestedCompany(null);
      onToast(
        existed ? 'info' : 'success',
        existed ? `${created.name} already in CRM.` : `Added ${created.name}.`,
      );
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : String(err));
    } finally {
      setCompanyAdding(false);
    }
  }

  async function handleSaveContact(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.firstName && !draft.lastName && !draft.email) {
      onToast('error', 'Provide a name or email.');
      return;
    }
    setSaving(true);
    try {
      const row = await api.createContact({
        firstName: draft.firstName.trim() || undefined,
        lastName: draft.lastName.trim() || undefined,
        email: draft.email.trim() || undefined,
        phone: draft.phone.trim() || undefined,
        title: draft.title.trim() || undefined,
        companyId: draft.company?.id ?? undefined,
        source: 'extension-signature',
      });
      onToast('success', `Contact saved (#${row.id}).`);
      // Reset everything so the user can paste a new signature.
      setSignature('');
      setDraft(emptyDraft());
      setSuggestedCompany(null);
      setHasExtracted(false);
      setOpen(false);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function clearAll() {
    setSignature('');
    setDraft(emptyDraft());
    setSuggestedCompany(null);
    setHasExtracted(false);
    setOpen(false);
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2">
          <SignatureIcon />
          <span className="text-sm font-medium text-slate-900">Paste an email signature</span>
        </span>
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div className="border-t border-slate-200 p-3 space-y-2">
          <textarea
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            rows={4}
            placeholder={
              "e.g.\nJane Doe\nVP Engineering · Acme Corp\njane@acme.com · 415-555-1212"
            }
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-500 resize-y font-mono"
          />
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>
              {trimmedLen} char{trimmedLen === 1 ? '' : 's'}
              {tooLong && (
                <span className="ml-2 text-amber-600">
                  (will trim to {MAX_SIGNATURE_CHARS})
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={clearAll}
              className="text-slate-400 hover:text-slate-700"
            >
              Clear
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExtract}
              disabled={extracting || trimmedLen === 0}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {extracting && <Spinner size={14} />}
              {extracting ? 'Extracting...' : 'Extract'}
            </button>
            <span className="text-[11px] text-slate-400">
              Sends to AI extract; no source URL needed.
            </span>
          </div>

          {suggestedCompany && (
            <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs">
              <span className="text-amber-900 flex-1 truncate">
                Suggested company: <strong>{suggestedCompany.name}</strong>
                {suggestedCompany.domain ? ` (${suggestedCompany.domain})` : ''}
              </span>
              <button
                type="button"
                onClick={handleAddSuggestedCompany}
                disabled={companyAdding}
                className="inline-flex items-center gap-1 rounded-full border border-brand-300 px-2 py-0.5 text-[11px] text-brand-700 hover:bg-brand-50 disabled:opacity-50"
              >
                {companyAdding ? <Spinner size={10} /> : <span aria-hidden>+</span>}
                Add to CRM
              </button>
            </div>
          )}

          {hasExtracted && (
            <ContactDraftForm
              draft={draft}
              setDraft={setDraft}
              saving={saving}
              onSubmit={handleSaveContact}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ContactDraftForm({
  draft,
  setDraft,
  saving,
  onSubmit,
}: {
  draft: ContactDraft;
  setDraft(updater: (d: ContactDraft) => ContactDraft): void;
  saving: boolean;
  onSubmit(e: React.FormEvent): void;
}) {
  const update = <K extends keyof ContactDraft>(k: K, v: ContactDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  return (
    <form onSubmit={onSubmit} className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
        Pre-filled contact
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="First name">
          <input
            className={inputCls}
            value={draft.firstName}
            onChange={(e) => update('firstName', e.target.value)}
          />
        </Field>
        <Field label="Last name">
          <input
            className={inputCls}
            value={draft.lastName}
            onChange={(e) => update('lastName', e.target.value)}
          />
        </Field>
      </div>
      <Field label="Email">
        <input
          type="email"
          className={inputCls}
          value={draft.email}
          onChange={(e) => update('email', e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Phone">
          <input
            className={inputCls}
            value={draft.phone}
            onChange={(e) => update('phone', e.target.value)}
          />
        </Field>
        <Field label="Title">
          <input
            className={inputCls}
            value={draft.title}
            onChange={(e) => update('title', e.target.value)}
          />
        </Field>
      </div>
      <Field label="Company">
        <CompanyPicker
          value={draft.company}
          onChange={(v) => update('company', v)}
        />
      </Field>
      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving && <Spinner size={14} />}
          {saving ? 'Saving...' : 'Save Contact'}
        </button>
      </div>
    </form>
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
  const [options, setOptions] = useState<SearchCompany[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (value) return;
    if (search.length < 2) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const out = await api.searchCompanies(search, 6);
        if (!cancelled) setOptions(out.items);
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, value]);

  if (value) {
    return (
      <div className="inline-flex items-center justify-between gap-2 w-full rounded-md bg-brand-50 border border-brand-200 px-2 py-1 text-xs">
        <span className="truncate font-medium text-brand-800">{value.name}</span>
        <button
          type="button"
          className="text-brand-700 opacity-70 hover:opacity-100"
          onClick={() => onChange(null)}
          aria-label="Clear company"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="relative">
        <input
          className={inputCls}
          value={search}
          placeholder="Search companies..."
          onChange={(e) => setSearch(e.target.value)}
        />
        {loading && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
            <Spinner size={12} />
          </div>
        )}
      </div>
      {search.length >= 2 && options.length > 0 && (
        <div className="max-h-32 overflow-y-auto rounded-md border border-slate-200 bg-white">
          {options.map((c) => (
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
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function SignatureIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-brand-600"
    >
      <path d="M3 17c2.5-1 5-2 7.5-7 1.5 5 4 6 6.5 6s3 .5 4 1" />
      <path d="M3 21h18" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

