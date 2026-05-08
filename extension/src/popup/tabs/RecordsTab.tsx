import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { SearchCompany } from '../../lib/types';
import { Spinner } from '../components/Spinner';
import { SignaturePaste } from '../components/SignaturePaste';
import type { ToastLevel } from '../components/Toast';

interface Props {
  onToast(level: ToastLevel, text: string, href?: string): void;
}

type Mode = 'idle' | 'contact' | 'company';

export function RecordsTab({ onToast }: Props) {
  const [mode, setMode] = useState<Mode>('idle');

  return (
    <div className="p-3 space-y-3 text-sm">
      <SignaturePaste onToast={onToast} />

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode(mode === 'contact' ? 'idle' : 'contact')}
          className={`flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium ${
            mode === 'contact'
              ? 'border-brand-500 bg-brand-50 text-brand-800'
              : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300'
          }`}
        >
          <PlusIcon />
          New Contact
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === 'company' ? 'idle' : 'company')}
          className={`flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium ${
            mode === 'company'
              ? 'border-brand-500 bg-brand-50 text-brand-800'
              : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300'
          }`}
        >
          <PlusIcon />
          New Company
        </button>
      </div>

      {mode === 'contact' && <ContactForm onToast={onToast} onDone={() => setMode('idle')} />}
      {mode === 'company' && <CompanyForm onToast={onToast} onDone={() => setMode('idle')} />}

      {mode === 'idle' && (
        <div className="text-xs text-slate-500 leading-relaxed">
          Quickly add a contact or company to your CRM. To attach a captured page to one of these records,
          use the <strong>Attach to record</strong> dropdown on the Capture tab.
        </div>
      )}
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</span>
      {children}
      {hint ? <span className="block text-[10px] text-slate-400">{hint}</span> : null}
    </label>
  );
}

const inputCls =
  'w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-500';

function ContactForm({
  onToast,
  onDone,
}: {
  onToast(level: ToastLevel, text: string, href?: string): void;
  onDone(): void;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('');
  const [companySearch, setCompanySearch] = useState('');
  const [companyOptions, setCompanyOptions] = useState<SearchCompany[]>([]);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [company, setCompany] = useState<SearchCompany | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (company) return;
    if (companySearch.length < 2) {
      setCompanyOptions([]);
      return;
    }
    let cancelled = false;
    setCompanyLoading(true);
    const t = setTimeout(async () => {
      try {
        const out = await api.searchCompanies(companySearch, 6);
        if (!cancelled) setCompanyOptions(out.items);
      } catch {
        if (!cancelled) setCompanyOptions([]);
      } finally {
        if (!cancelled) setCompanyLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [companySearch, company]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName && !lastName && !email) {
      onToast('error', 'Provide a name or email.');
      return;
    }
    setSaving(true);
    try {
      const row = await api.createContact({
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        title: title.trim() || undefined,
        companyId: company?.id ?? undefined,
        source: 'extension',
      });
      onToast(
        'success',
        `Contact saved (#${row.id}).`
      );
      // Clear
      setFirstName('');
      setLastName('');
      setEmail('');
      setPhone('');
      setTitle('');
      setCompany(null);
      setCompanySearch('');
      onDone();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="First name">
          <input className={inputCls} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </Field>
        <Field label="Last name">
          <input className={inputCls} value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </Field>
      </div>
      <Field label="Email">
        <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Phone">
          <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Title">
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
      </div>

      <Field label="Company">
        {company ? (
          <div className="inline-flex items-center justify-between gap-2 w-full rounded-md bg-brand-50 border border-brand-200 px-2 py-1 text-xs">
            <span className="truncate font-medium text-brand-800">{company.name}</span>
            <button
              type="button"
              className="text-brand-700 opacity-70 hover:opacity-100"
              onClick={() => setCompany(null)}
              aria-label="Clear"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="relative">
              <input
                className={inputCls}
                value={companySearch}
                placeholder="Search companies..."
                onChange={(e) => setCompanySearch(e.target.value)}
              />
              {companyLoading && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
                  <Spinner size={12} />
                </div>
              )}
            </div>
            {companySearch.length >= 2 && companyOptions.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded-md border border-slate-200 bg-white">
                {companyOptions.map((c) => (
                  <button
                    type="button"
                    key={String(c.id)}
                    className="block w-full text-left px-2 py-1 text-xs hover:bg-slate-100"
                    onClick={() => {
                      setCompany(c);
                      setCompanySearch('');
                    }}
                  >
                    <div className="font-medium text-slate-900 truncate">{c.name}</div>
                    {c.domain ? <div className="text-slate-500 truncate">{c.domain}</div> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
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
        <button
          type="button"
          onClick={onDone}
          className="text-xs text-slate-500 hover:text-slate-900"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function CompanyForm({
  onToast,
  onDone,
}: {
  onToast(level: ToastLevel, text: string, href?: string): void;
  onDone(): void;
}) {
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [industry, setIndustry] = useState('');
  const [size, setSize] = useState('');
  const [website, setWebsite] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      onToast('error', 'Company name is required.');
      return;
    }
    setSaving(true);
    try {
      const row = await api.createCompany({
        name: name.trim(),
        domain: domain.trim() || undefined,
        industry: industry.trim() || undefined,
        size: size.trim() || undefined,
        website: website.trim() || undefined,
        address: address.trim() || undefined,
      });
      onToast('success', row._existing ? `Existing company (#${row.id}).` : `Company saved (#${row.id}).`);
      setName('');
      setDomain('');
      setIndustry('');
      setSize('');
      setWebsite('');
      setAddress('');
      onDone();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
      <Field label="Name">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Domain">
          <input className={inputCls} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" />
        </Field>
        <Field label="Industry">
          <input className={inputCls} value={industry} onChange={(e) => setIndustry(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Size">
          <input className={inputCls} value={size} onChange={(e) => setSize(e.target.value)} placeholder="11-50" />
        </Field>
        <Field label="Website">
          <input className={inputCls} value={website} onChange={(e) => setWebsite(e.target.value)} />
        </Field>
      </div>
      <Field label="Address">
        <input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} />
      </Field>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving && <Spinner size={14} />}
          {saving ? 'Saving...' : 'Save Company'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-xs text-slate-500 hover:text-slate-900"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
