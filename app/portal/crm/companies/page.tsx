'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import CrmCustomFieldFilters from '@/components/portal/CrmCustomFieldFilters';
import CompanyMap, { type MapCompany } from '@/components/portal/CompanyMap';
import MediaPicker from '@/components/admin/MediaPicker';
import { formatMoney } from '@/lib/utils/money';

interface Company {
  id: number;
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  logoUrl: string | null;
  notes: string | null;
  // Drizzle returns NUMERIC as string over the wire; we parse on the client.
  latitude: string | null;
  longitude: string | null;
  contactCount: number;
  totalDealValue: number;
  createdAt: string;
}

const sizeOptions = [
  { value: '1-10', label: '1-10 employees' },
  { value: '11-50', label: '11-50 employees' },
  { value: '51-200', label: '51-200 employees' },
  { value: '201-500', label: '201-500 employees' },
  { value: '501-1000', label: '501-1000 employees' },
  { value: '1001+', label: '1001+ employees' },
];

const LIMIT = 25;

export default function CrmCompaniesPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [customFilters, setCustomFilters] = useState<Record<number, string>>({});

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    domain: '',
    industry: '',
    size: '',
    phone: '',
    website: '',
    address: '',
    latitude: '',
    longitude: '',
    logoUrl: '',
    notes: '',
  });

  const fetchCompanies = async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (search) params.set('search', search);
    for (const [fid, val] of Object.entries(customFilters)) {
      if (val) params.append('cf', `${fid}:${val}`);
    }
    const res = await fetch(`/api/portal/crm/companies?${params}`);
    const d = await res.json();
    setCompanies(d.data?.companies ?? d.data ?? []);
    setTotal(d.data?.total ?? (Array.isArray(d.data) ? d.data.length : 0));
    setLoading(false);
  };

  useEffect(() => {
    fetchCompanies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page, customFilters]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const payload: Record<string, unknown> = {
      name: form.name,
      domain: form.domain,
      industry: form.industry,
      size: form.size,
      phone: form.phone,
      website: form.website,
      address: form.address,
      logoUrl: form.logoUrl,
      notes: form.notes,
    };
    if (form.latitude.trim() !== '') payload.latitude = form.latitude.trim();
    if (form.longitude.trim() !== '') payload.longitude = form.longitude.trim();
    const res = await fetch('/api/portal/crm/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const d = await res.json();
    setSaving(false);
    if (!d.success) {
      setError(d.message ?? 'Failed to create company.');
      return;
    }
    setShowForm(false);
    setForm({ name: '', domain: '', industry: '', size: '', phone: '', website: '', address: '', latitude: '', longitude: '', logoUrl: '', notes: '' });
    setPage(1);
    fetchCompanies();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {loading ? '' : `${total} compan${total !== 1 ? 'ies' : 'y'}`}
        </p>
        <button
          onClick={() => setShowForm(f => !f)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors shrink-0"
        >
          <span className="material-icons text-base">{showForm ? 'close' : 'domain_add'}</span>
          {showForm ? 'Cancel' : 'Add Company'}
        </button>
      </div>

      {/* Inline form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h3 className="font-semibold text-foreground">New Company</h3>
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              <span className="material-icons text-base">error</span>
              {error}
            </div>
          )}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Name *</label>
              <input
                required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Domain</label>
              <input
                value={form.domain}
                onChange={e => setForm(f => ({ ...f, domain: e.target.value }))}
                placeholder="example.com"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Industry</label>
              <input
                value={form.industry}
                onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Size</label>
              <select
                value={form.size}
                onChange={e => setForm(f => ({ ...f, size: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">Select size</option>
                {sizeOptions.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Phone</label>
              <input
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Website</label>
              <input
                value={form.website}
                onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
                placeholder="https://example.com"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Address</label>
              <textarea
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                rows={2}
                placeholder="123 Main St, City, State"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
              />
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Latitude</label>
                  <input
                    type="number"
                    step="any"
                    min={-90}
                    max={90}
                    value={form.latitude}
                    onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))}
                    placeholder="e.g. 40.7128"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Longitude</label>
                  <input
                    type="number"
                    step="any"
                    min={-180}
                    max={180}
                    value={form.longitude}
                    onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))}
                    placeholder="e.g. -74.0060"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Auto-derived from address on save if left blank.</p>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <MediaPicker
                value={form.logoUrl}
                onChange={(url) => setForm(f => ({ ...f, logoUrl: url }))}
                label="Logo"
                mimeTypeFilter="image"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving && <span className="material-icons animate-spin text-sm">refresh</span>}
              Create Company
            </button>
          </div>
        </form>
      )}

      {/* Search + custom field filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-md flex-1 min-w-[200px]">
          <span className="material-icons text-base text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2">search</span>
          <input
            placeholder="Search companies..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <CrmCustomFieldFilters
          entityType="company"
          values={customFilters}
          onChange={v => { setCustomFilters(v); setPage(1); }}
        />
      </div>

      {/* Grid + Map (2-column on lg+) */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
        </div>
      ) : companies.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <span className="material-icons text-4xl text-muted-foreground mb-3 block">business</span>
          <p className="text-muted-foreground mb-4">No companies found.</p>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
          >
            Add First Company
          </button>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          {/* Column 1 — companies */}
          <div className="grid sm:grid-cols-2 gap-4 content-start">
            {companies.map(c => {
              const isHovered = hoveredId === c.id;
              return (
              <div
                key={c.id}
                onClick={() => router.push(`/portal/crm/companies/${c.id}`)}
                onMouseEnter={() => setHoveredId(c.id)}
                onMouseLeave={() => setHoveredId(prev => (prev === c.id ? null : prev))}
                className={`bg-card border rounded-xl p-5 transition-all cursor-pointer group ${
                  isHovered
                    ? 'border-primary ring-2 ring-primary/30 shadow-md'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    {c.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.logoUrl}
                        alt={`${c.name} logo`}
                        className="w-10 h-10 rounded-lg object-contain bg-background border border-border shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-background border border-border flex items-center justify-center shrink-0">
                        <span className="material-icons text-base text-muted-foreground">business</span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">{c.name}</h3>
                      {c.domain && (
                        <p className="text-xs text-muted-foreground truncate">{c.domain}</p>
                      )}
                    </div>
                  </div>
                  <span className="material-icons text-base text-muted-foreground shrink-0">chevron_right</span>
                </div>

                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <span className="material-icons text-sm">person</span>
                    {c.contactCount} contact{c.contactCount !== 1 ? 's' : ''}
                  </div>
                  <div className="font-semibold text-foreground">
                    {formatMoney(c.totalDealValue)}
                  </div>
                </div>
              </div>
              );
            })}
          </div>

          {/* Column 2 — map of current page's items (sticky to top of viewport).
              `self-start` is critical: without it, grid items default to
              align-self: stretch, which would balloon this element to the full
              height of the left column and prevent position:sticky from ever
              activating. */}
          <div className="lg:self-start lg:sticky lg:top-0 h-[28rem] lg:h-[calc(100vh-2rem)] rounded-xl border border-border overflow-hidden bg-card">
            <CompanyMap
              companies={companies
                .map<MapCompany | null>(c => {
                  const lat = c.latitude !== null ? Number(c.latitude) : NaN;
                  const lng = c.longitude !== null ? Number(c.longitude) : NaN;
                  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
                  return { id: c.id, name: c.name, latitude: lat, longitude: lng, domain: c.domain };
                })
                .filter((x): x is MapCompany => x !== null)}
              onMarkerClick={(id) => router.push(`/portal/crm/companies/${id}`)}
              onMarkerHover={setHoveredId}
              highlightedId={hoveredId}
            />
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-4 flex-wrap pt-2">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-1">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="material-icons text-base">chevron_left</span>
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 2, totalPages - 4));
              const p = start + i;
              if (p > totalPages) return null;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    p === page
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border hover:bg-accent'
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="material-icons text-base">chevron_right</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
