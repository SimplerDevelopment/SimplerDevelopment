'use client';
// Extracted verbatim for PUX-210 — see page.tsx `activeTab === 'details'` body.

import type { ProductForm } from '../page';
import { pInput, pSelect, pSectionTitle } from '@/components/portal/portal-ui';

interface DetailsTabBodyProps {
  form: ProductForm;
  updateField: <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => void;
  handleNameChange: (name: string) => void;
}

export function DetailsTabBody({ form, updateField, handleNameChange }: DetailsTabBodyProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
      <h2 className={`${pSectionTitle} flex items-center gap-2`}>
        <span className="material-icons text-lg text-muted-foreground">info</span>
        Basic Information
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Name</label>
          <input value={form.name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Product name" className={pInput} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Slug</label>
          <input
            value={form.slug}
            onChange={(e) => updateField('slug', e.target.value)}
            placeholder="product-slug"
            className={`${pInput} font-mono`}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">Short Description</label>
        <input
          value={form.shortDescription}
          onChange={(e) => updateField('shortDescription', e.target.value)}
          placeholder="Brief summary"
          className={pInput}
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">Description</label>
        <textarea
          value={form.description}
          onChange={(e) => updateField('description', e.target.value)}
          placeholder="Full product description..."
          rows={5}
          className={pInput}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="product-status" className="text-sm font-medium text-foreground">Status</label>
          <select id="product-status" value={form.status} onChange={(e) => updateField('status', e.target.value)} className={pSelect}>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label id="product-featured-label" className="text-sm font-medium text-foreground">Featured</label>
          <div className="flex items-center gap-3 pt-1.5">
            <button
              type="button" role="switch" aria-checked={form.featured} aria-labelledby="product-featured-label"
              onClick={() => updateField('featured', !form.featured)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                form.featured ? 'bg-primary' : 'bg-border'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  form.featured ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-sm text-muted-foreground">{form.featured ? 'Yes' : 'No'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
