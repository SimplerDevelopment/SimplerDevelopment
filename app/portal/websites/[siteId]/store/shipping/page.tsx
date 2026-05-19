'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

type RateSource = 'manual' | 'easypost';

interface ShippingRate {
  id?: number;
  name: string;
  rateType: string; // 'flat' | 'weight_based' | 'price_based' | 'free' | 'live'
  price: number; // cents (manual) or 0 (live)
  minDeliveryDays?: number | null;
  maxDeliveryDays?: number | null;
  freeAbove?: number | null;
  provider?: RateSource;
  carrierCode?: string | null;
  serviceCode?: string | null;
  liveRateOnly?: boolean;
}

interface ShippingZone {
  id: number;
  name: string;
  countries: string[];
  rates: ShippingRate[];
}

function formatMoney(cents: number) {
  return '$' + (cents / 100).toFixed(2);
}

function centsToDollars(cents: number) {
  return cents ? (cents / 100).toFixed(2) : '';
}

function dollarsToCents(dollars: string) {
  const num = parseFloat(dollars);
  return isNaN(num) ? 0 : Math.round(num * 100);
}

const rateTypeLabels: Record<string, string> = {
  flat: 'Flat Rate',
  weight_based: 'Weight Based',
  price_based: 'Price Based',
  free: 'Free Shipping',
  live: 'Live Carrier',
};

const CARRIER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Any carrier' },
  { value: 'USPS', label: 'USPS' },
  { value: 'UPSDAP', label: 'UPS' },
  { value: 'FedExDefault', label: 'FedEx' },
  { value: 'DHLExpress', label: 'DHL Express' },
];

export default function ShippingSettingsPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const base = `/api/portal/websites/${siteId}/store/shipping`;

  const [zones, setZones] = useState<ShippingZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedZone, setExpandedZone] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Zone form
  const [showZoneForm, setShowZoneForm] = useState(false);
  const [editingZone, setEditingZone] = useState<ShippingZone | null>(null);
  const [zoneForm, setZoneForm] = useState({ name: '', countries: '' });

  // Rate form
  const [showRateForm, setShowRateForm] = useState<number | null>(null);
  const [editingRate, setEditingRate] = useState<ShippingRate | null>(null);
  const [rateSource, setRateSource] = useState<RateSource>('manual');
  const [rateForm, setRateForm] = useState({
    name: '',
    rateType: 'flat',
    price: 0,
    minDeliveryDays: '',
    maxDeliveryDays: '',
    freeAbove: 0,
    carrierCode: '',
    serviceCode: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(base);
      const data = await res.json();
      if (data.success) setZones(data.data || []);
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreateZone = () => {
    setEditingZone(null);
    setZoneForm({ name: '', countries: '' });
    setShowZoneForm(true);
    setError('');
  };

  const openEditZone = (zone: ShippingZone) => {
    setEditingZone(zone);
    setZoneForm({ name: zone.name, countries: zone.countries.join(', ') });
    setShowZoneForm(true);
    setError('');
  };

  const saveZone = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        name: zoneForm.name,
        countries: zoneForm.countries
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean),
      };
      const url = editingZone ? `${base}/${editingZone.id}` : base;
      const method = editingZone ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setShowZoneForm(false);
        setEditingZone(null);
        setSuccess(editingZone ? 'Zone updated.' : 'Zone created.');
        load();
      } else {
        setError(data.message || 'Failed to save zone.');
      }
    } catch {
      setError('Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const deleteZone = async (zoneId: number) => {
    if (!confirm('Delete this shipping zone and all its rates?')) return;
    try {
      await fetch(`${base}/${zoneId}`, { method: 'DELETE' });
      setSuccess('Zone deleted.');
      load();
    } catch {
      setError('Failed to delete zone.');
    }
  };

  const resetRateForm = () => {
    setRateSource('manual');
    setRateForm({
      name: '',
      rateType: 'flat',
      price: 0,
      minDeliveryDays: '',
      maxDeliveryDays: '',
      freeAbove: 0,
      carrierCode: '',
      serviceCode: '',
    });
  };

  const openCreateRate = (zoneId: number) => {
    setEditingRate(null);
    resetRateForm();
    setShowRateForm(zoneId);
    setError('');
  };

  const openEditRate = (zoneId: number, rate: ShippingRate) => {
    setEditingRate(rate);
    const isLive = rate.liveRateOnly === true || rate.provider === 'easypost';
    setRateSource(isLive ? 'easypost' : 'manual');
    setRateForm({
      name: rate.name,
      rateType: rate.rateType || 'flat',
      price: rate.price || 0,
      minDeliveryDays: rate.minDeliveryDays != null ? String(rate.minDeliveryDays) : '',
      maxDeliveryDays: rate.maxDeliveryDays != null ? String(rate.maxDeliveryDays) : '',
      freeAbove: rate.freeAbove || 0,
      carrierCode: rate.carrierCode || '',
      serviceCode: rate.serviceCode || '',
    });
    setShowRateForm(zoneId);
    setError('');
  };

  const saveRate = async (e: React.FormEvent, zoneId: number) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const isLive = rateSource === 'easypost';
      const payload = isLive
        ? {
            name: rateForm.name,
            provider: 'easypost' as const,
            liveRateOnly: true,
            rateType: 'live',
            price: 0,
            carrierCode: rateForm.carrierCode || null,
            serviceCode: rateForm.serviceCode.trim() || null,
            minDeliveryDays: rateForm.minDeliveryDays ? parseInt(rateForm.minDeliveryDays) : null,
            maxDeliveryDays: rateForm.maxDeliveryDays ? parseInt(rateForm.maxDeliveryDays) : null,
          }
        : {
            name: rateForm.name,
            provider: 'manual' as const,
            liveRateOnly: false,
            carrierCode: null,
            serviceCode: null,
            rateType: rateForm.rateType,
            price: rateForm.price,
            minDeliveryDays: rateForm.minDeliveryDays ? parseInt(rateForm.minDeliveryDays) : null,
            maxDeliveryDays: rateForm.maxDeliveryDays ? parseInt(rateForm.maxDeliveryDays) : null,
            freeAbove: rateForm.freeAbove || null,
          };
      const url = editingRate ? `${base}/${zoneId}/rates/${editingRate.id}` : `${base}/${zoneId}/rates`;
      const method = editingRate ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setShowRateForm(null);
        setEditingRate(null);
        setSuccess(editingRate ? 'Rate updated.' : 'Rate created.');
        load();
      } else {
        setError(data.message || 'Failed to save rate.');
      }
    } catch {
      setError('Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const deleteRate = async (zoneId: number, rateId: number) => {
    if (!confirm('Delete this shipping rate?')) return;
    try {
      await fetch(`${base}/${zoneId}/rates/${rateId}`, { method: 'DELETE' });
      setSuccess('Rate deleted.');
      load();
    } catch {
      setError('Failed to delete rate.');
    }
  };

  const inputClass =
    'w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Shipping</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage shipping zones and rates.</p>
        </div>
        <button
          onClick={showZoneForm ? () => setShowZoneForm(false) : openCreateZone}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <span className="material-icons text-base">{showZoneForm ? 'close' : 'add'}</span>
          {showZoneForm ? 'Cancel' : 'Add Zone'}
        </button>
      </div>

      {/* Live-rates info banner */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-800 text-sm dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300">
        <span className="material-icons text-base mt-0.5">info</span>
        <p>
          Live carrier rates require EasyPost to be enabled in{' '}
          <a
            href={`/portal/websites/${siteId}/store/settings`}
            className="font-medium underline hover:no-underline"
          >
            Store Settings &rarr; Shipping Provider
          </a>
          .
        </p>
      </div>

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          <span className="material-icons text-base">error</span>
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm dark:bg-green-900/20 dark:border-green-800 dark:text-green-400">
          <span className="material-icons text-base">check_circle</span>
          {success}
        </div>
      )}

      {/* Zone Form */}
      {showZoneForm && (
        <form onSubmit={saveZone} className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-foreground">{editingZone ? 'Edit Zone' : 'New Shipping Zone'}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Zone Name</label>
              <input
                value={zoneForm.name}
                onChange={(e) => setZoneForm((p) => ({ ...p, name: e.target.value }))}
                required
                placeholder="e.g. Domestic, International"
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Countries</label>
              <input
                value={zoneForm.countries}
                onChange={(e) => setZoneForm((p) => ({ ...p, countries: e.target.value }))}
                placeholder="US, CA, GB (comma separated)"
                className={inputClass}
              />
              <p className="text-xs text-muted-foreground">Country codes, comma separated. Leave empty for all countries.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowZoneForm(false)}
              className="px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving && <span className="material-icons text-base animate-spin">refresh</span>}
              {editingZone ? 'Update' : 'Create'} Zone
            </button>
          </div>
        </form>
      )}

      {/* Zones List */}
      {zones.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 flex flex-col items-center text-center">
          <span className="material-icons text-4xl text-muted-foreground/40 mb-2">local_shipping</span>
          <h2 className="font-semibold text-foreground mb-1">No shipping zones</h2>
          <p className="text-sm text-muted-foreground">Create a shipping zone to define rates for different regions.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {zones.map((zone) => (
            <div key={zone.id} className="bg-card border border-border rounded-xl overflow-hidden">
              {/* Zone header */}
              <div
                className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-muted/20 transition-colors"
                onClick={() => setExpandedZone(expandedZone === zone.id ? null : zone.id)}
              >
                <div>
                  <h3 className="font-semibold text-foreground">{zone.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {zone.countries.length > 0 ? zone.countries.join(', ') : 'All countries'}
                    {' -- '}
                    {zone.rates.length} rate{zone.rates.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditZone(zone);
                    }}
                    className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                  >
                    <span className="material-icons text-base">edit</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteZone(zone.id);
                    }}
                    className="p-1.5 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                  >
                    <span className="material-icons text-base">delete</span>
                  </button>
                  <span className="material-icons text-muted-foreground">
                    {expandedZone === zone.id ? 'expand_less' : 'expand_more'}
                  </span>
                </div>
              </div>

              {/* Expanded rates */}
              {expandedZone === zone.id && (
                <div className="border-t border-border px-6 py-4 space-y-4">
                  {zone.rates.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-left">
                            <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Name</th>
                            <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Source</th>
                            <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Carrier</th>
                            <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Service</th>
                            <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Type</th>
                            <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Price</th>
                            <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Delivery</th>
                            <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Free Above</th>
                            <th className="px-3 py-2 text-xs font-medium text-muted-foreground w-20"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {zone.rates.map((rate) => {
                            const isLive = rate.liveRateOnly === true || rate.provider === 'easypost';
                            return (
                              <tr key={rate.id}>
                                <td className="px-3 py-2 font-medium text-foreground">{rate.name}</td>
                                <td className="px-3 py-2 text-muted-foreground">
                                  {isLive ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 text-xs font-medium">
                                      <span className="material-icons text-xs">cloud</span>
                                      EasyPost
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                                      <span className="material-icons text-xs">edit_note</span>
                                      Manual
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">
                                  {rate.carrierCode || (isLive ? 'Any' : '--')}
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">
                                  {rate.serviceCode || (isLive ? 'Any' : '--')}
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">
                                  {rateTypeLabels[rate.rateType] || rate.rateType}
                                </td>
                                <td className="px-3 py-2 text-foreground">
                                  {isLive ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 text-xs font-bold tracking-wide">
                                      <span className="material-icons text-xs">local_shipping</span>
                                      LIVE
                                    </span>
                                  ) : rate.rateType === 'free' ? (
                                    'Free'
                                  ) : (
                                    formatMoney(rate.price)
                                  )}
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">
                                  {rate.minDeliveryDays != null && rate.maxDeliveryDays != null
                                    ? `${rate.minDeliveryDays}-${rate.maxDeliveryDays} days`
                                    : rate.minDeliveryDays != null
                                    ? `${rate.minDeliveryDays}+ days`
                                    : '--'}
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">
                                  {!isLive && rate.freeAbove ? formatMoney(rate.freeAbove) : '--'}
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => openEditRate(zone.id, rate)}
                                      className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                      <span className="material-icons text-sm">edit</span>
                                    </button>
                                    <button
                                      onClick={() => rate.id && deleteRate(zone.id, rate.id)}
                                      className="p-1 text-muted-foreground hover:text-red-600 transition-colors"
                                    >
                                      <span className="material-icons text-sm">delete</span>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Rate Form */}
                  {showRateForm === zone.id ? (
                    <form onSubmit={(e) => saveRate(e, zone.id)} className="p-4 bg-muted/20 rounded-lg space-y-4">
                      <h4 className="font-medium text-foreground text-sm">
                        {editingRate ? 'Edit Rate' : 'New Rate'}
                      </h4>

                      {/* Rate source toggle */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">Rate source</label>
                        <div className="flex gap-2">
                          <label
                            className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                              rateSource === 'manual'
                                ? 'border-primary bg-primary/5 text-foreground'
                                : 'border-border bg-background text-muted-foreground hover:border-primary/40'
                            }`}
                          >
                            <input
                              type="radio"
                              name="rateSource"
                              value="manual"
                              checked={rateSource === 'manual'}
                              onChange={() => setRateSource('manual')}
                              className="accent-primary"
                            />
                            <span className="material-icons text-base">edit_note</span>
                            <span className="text-sm font-medium">Manual</span>
                          </label>
                          <label
                            className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                              rateSource === 'easypost'
                                ? 'border-primary bg-primary/5 text-foreground'
                                : 'border-border bg-background text-muted-foreground hover:border-primary/40'
                            }`}
                          >
                            <input
                              type="radio"
                              name="rateSource"
                              value="easypost"
                              checked={rateSource === 'easypost'}
                              onChange={() => setRateSource('easypost')}
                              className="accent-primary"
                            />
                            <span className="material-icons text-base">cloud</span>
                            <span className="text-sm font-medium">Live carrier rates</span>
                          </label>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {/* Name (both modes) */}
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-foreground">Name</label>
                          <input
                            value={rateForm.name}
                            onChange={(e) => setRateForm((p) => ({ ...p, name: e.target.value }))}
                            required
                            placeholder={rateSource === 'easypost' ? 'Live carrier rate' : 'Standard, Express...'}
                            className={inputClass}
                          />
                        </div>

                        {/* Manual-only fields */}
                        {rateSource === 'manual' && (
                          <>
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-foreground">Type</label>
                              <select
                                value={rateForm.rateType}
                                onChange={(e) => setRateForm((p) => ({ ...p, rateType: e.target.value }))}
                                className={inputClass}
                              >
                                <option value="flat">Flat Rate</option>
                                <option value="weight_based">Weight Based</option>
                                <option value="price_based">Price Based</option>
                                <option value="free">Free Shipping</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-foreground">Price ($)</label>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={centsToDollars(rateForm.price)}
                                onChange={(e) => setRateForm((p) => ({ ...p, price: dollarsToCents(e.target.value) }))}
                                disabled={rateForm.rateType === 'free'}
                                className={inputClass}
                              />
                            </div>
                          </>
                        )}

                        {/* Live-only fields */}
                        {rateSource === 'easypost' && (
                          <>
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-foreground">Carrier</label>
                              <select
                                value={rateForm.carrierCode}
                                onChange={(e) => setRateForm((p) => ({ ...p, carrierCode: e.target.value }))}
                                className={inputClass}
                              >
                                {CARRIER_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-foreground">Service</label>
                              <input
                                value={rateForm.serviceCode}
                                onChange={(e) => setRateForm((p) => ({ ...p, serviceCode: e.target.value }))}
                                placeholder="Leave blank to allow all services from this carrier"
                                className={inputClass}
                              />
                              <p className="text-[11px] text-muted-foreground">
                                Examples: Priority, Ground, Express. Exact match against EasyPost service codes.
                              </p>
                            </div>
                          </>
                        )}

                        {/* Delivery days (both modes) */}
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-foreground">Min Days</label>
                          <input
                            type="number"
                            min="0"
                            value={rateForm.minDeliveryDays}
                            onChange={(e) => setRateForm((p) => ({ ...p, minDeliveryDays: e.target.value }))}
                            placeholder="e.g. 3"
                            className={inputClass}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-foreground">Max Days</label>
                          <input
                            type="number"
                            min="0"
                            value={rateForm.maxDeliveryDays}
                            onChange={(e) => setRateForm((p) => ({ ...p, maxDeliveryDays: e.target.value }))}
                            placeholder="e.g. 7"
                            className={inputClass}
                          />
                        </div>

                        {/* Free above (manual only) */}
                        {rateSource === 'manual' && (
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-foreground">Free Above ($)</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={centsToDollars(rateForm.freeAbove)}
                              onChange={(e) => setRateForm((p) => ({ ...p, freeAbove: dollarsToCents(e.target.value) }))}
                              placeholder="Optional"
                              className={inputClass}
                            />
                          </div>
                        )}
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowRateForm(null);
                            setEditingRate(null);
                          }}
                          className="px-3 py-1.5 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-accent transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={saving}
                          className="flex items-center gap-2 px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                          {saving && <span className="material-icons text-sm animate-spin">refresh</span>}
                          {editingRate ? 'Update' : 'Add'} Rate
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      onClick={() => openCreateRate(zone.id)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary hover:bg-accent rounded-lg transition-colors"
                    >
                      <span className="material-icons text-sm">add</span>
                      Add Rate
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
