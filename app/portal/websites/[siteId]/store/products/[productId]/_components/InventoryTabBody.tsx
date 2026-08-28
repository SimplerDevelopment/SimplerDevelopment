'use client';
// Extracted verbatim for PUX-210 — see page.tsx `activeTab === 'inventory'` body.

import type { ProductForm } from '../page';
import { pInput, pSectionTitle } from '@/components/portal/portal-ui';

interface InventoryTabBodyProps {
  form: ProductForm;
  updateField: <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => void;
}

export function InventoryTabBody({ form, updateField }: InventoryTabBodyProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
      <h2 className={`${pSectionTitle} flex items-center gap-2`}>
        <span className="material-icons text-lg text-muted-foreground">inventory</span>
        Inventory
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">SKU</label>
          <input value={form.sku} onChange={(e) => updateField('sku', e.target.value)} placeholder="SKU-001" className={pInput} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Barcode</label>
          <input value={form.barcode} onChange={(e) => updateField('barcode', e.target.value)} placeholder="123456789" className={pInput} />
        </div>
      </div>
      <div className="space-y-1.5">
        <label id="product-track-inventory-label" className="text-sm font-medium text-foreground">Track Inventory</label>
        <div className="flex items-center gap-3 pt-1.5">
          <button
            type="button" role="switch" aria-checked={form.trackInventory} aria-labelledby="product-track-inventory-label"
            onClick={() => updateField('trackInventory', !form.trackInventory)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              form.trackInventory ? 'bg-primary' : 'bg-border'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                form.trackInventory ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          <span className="text-sm text-muted-foreground">{form.trackInventory ? 'Enabled' : 'Disabled'}</span>
        </div>
      </div>
      {form.trackInventory && (
        <div className="space-y-1.5 max-w-xs">
          <label className="text-sm font-medium text-foreground">Quantity</label>
          <input
            type="number"
            min="0"
            value={form.quantity}
            onChange={(e) => updateField('quantity', parseInt(e.target.value) || 0)}
            className={pInput}
          />
        </div>
      )}
    </div>
  );
}
