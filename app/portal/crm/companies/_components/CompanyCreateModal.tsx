// PUX-203: extracted verbatim from app/portal/crm/companies/page.tsx (the
// `showForm && (...)` create-form modal block). Behaviour-preserving move only.
'use client';

import MediaPicker from '@/components/admin/MediaPicker';
import { pBtnPrimary, pCard, pInput } from '@/components/portal/portal-ui';

const sizeOptions = [
  { value: '1-10', label: '1-10 employees' },
  { value: '11-50', label: '11-50 employees' },
  { value: '51-200', label: '51-200 employees' },
  { value: '201-500', label: '201-500 employees' },
  { value: '501-1000', label: '501-1000 employees' },
  { value: '1001+', label: '1001+ employees' },
];

interface CompanyFormState {
  name: string;
  domain: string;
  industry: string;
  size: string;
  phone: string;
  website: string;
  address: string;
  latitude: string;
  longitude: string;
  logoUrl: string;
  notes: string;
}

interface CompanyCreateModalProps {
  form: CompanyFormState;
  setForm: React.Dispatch<React.SetStateAction<CompanyFormState>>;
  saving: boolean;
  error: string;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export default function CompanyCreateModal({ form, setForm, saving, error, onSubmit, onClose }: CompanyCreateModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={onClose}>
    <form onSubmit={onSubmit} onClick={e => e.stopPropagation()} className={`${pCard} my-8 w-full max-w-3xl p-6 space-y-4`}>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-foreground">New Company</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
          <span className="material-icons text-base">close</span>
        </button>
      </div>
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
            className={pInput}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Domain</label>
          <input
            value={form.domain}
            onChange={e => setForm(f => ({ ...f, domain: e.target.value }))}
            placeholder="example.com"
            className={pInput}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Industry</label>
          <input
            value={form.industry}
            onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}
            className={pInput}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Size</label>
          <select
            value={form.size}
            onChange={e => setForm(f => ({ ...f, size: e.target.value }))}
            className={pInput}
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
            className={pInput}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Website</label>
          <input
            value={form.website}
            onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
            placeholder="https://example.com"
            className={pInput}
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Address</label>
          <textarea
            value={form.address}
            onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
            rows={2}
            placeholder="123 Main St, City, State"
            className={`${pInput} resize-y`}
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
                className={pInput}
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
                className={pInput}
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
            className={`${pInput} resize-y`}
          />
        </div>
      </div>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className={pBtnPrimary}
        >
          {saving && <span className="material-icons animate-spin text-sm">refresh</span>}
          Create Company
        </button>
      </div>
    </form>
    </div>
  );
}
