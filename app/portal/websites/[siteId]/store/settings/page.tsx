'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

interface StoreSettings {
  enabled: boolean;
  storeName: string;
  currency: string;
  taxRate: number;
  taxInclusive: boolean;
  requiresShipping: boolean;
  lowStockThreshold: number;
  orderPrefix: string;
  enableReviews: boolean;
  stripeConnected: boolean;
  stripeAccountId?: string | null;
  payoutSchedule?: string | null;
  platformFeePercent?: number | null;
}

const currencies = [
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'GBP', label: 'GBP - British Pound' },
  { value: 'CAD', label: 'CAD - Canadian Dollar' },
  { value: 'AUD', label: 'AUD - Australian Dollar' },
];

export default function StoreSettingsPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const base = `/api/portal/websites/${siteId}/store`;

  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [connectingStripe, setConnectingStripe] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${base}/settings`);
      const data = await res.json();
      if (data.success) setSettings(data.data);
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        ...settings,
        taxRate: settings.taxRate / 100, // Convert percentage to decimal for API
      };
      const res = await fetch(`${base}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Settings saved successfully.');
        load();
      } else {
        setError(data.message || 'Failed to save settings.');
      }
    } catch {
      setError('Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const connectStripe = async () => {
    setConnectingStripe(true);
    setError('');
    try {
      const res = await fetch(`${base}/stripe-connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success && data.data?.url) {
        window.location.href = data.data.url;
      } else {
        setError(data.message || 'Failed to start Stripe Connect.');
      }
    } catch {
      setError('Something went wrong.');
    } finally {
      setConnectingStripe(false);
    }
  };

  const updateField = <K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
    setError('');
    setSuccess('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="max-w-4xl mx-auto text-center py-16">
        <span className="material-icons text-4xl text-muted-foreground/40">error_outline</span>
        <p className="text-muted-foreground mt-2">Could not load store settings.</p>
      </div>
    );
  }

  const inputClass =
    'w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';
  const labelClass = 'text-sm font-medium text-foreground';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Store Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">Configure your store preferences and payment setup.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving && <span className="material-icons text-base animate-spin">refresh</span>}
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
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

      {/* General Settings */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-lg text-muted-foreground">settings</span>
          General
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className={labelClass}>Store Name</label>
            <input
              value={settings.storeName}
              onChange={(e) => updateField('storeName', e.target.value)}
              placeholder="My Store"
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Currency</label>
            <select value={settings.currency} onChange={(e) => updateField('currency', e.target.value)} className={inputClass}>
              {currencies.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Order Prefix</label>
            <input
              value={settings.orderPrefix}
              onChange={(e) => updateField('orderPrefix', e.target.value)}
              placeholder="ORD-"
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Low Stock Threshold</label>
            <input
              type="number"
              min="0"
              value={settings.lowStockThreshold}
              onChange={(e) => updateField('lowStockThreshold', parseInt(e.target.value) || 0)}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Tax Settings */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-lg text-muted-foreground">receipt</span>
          Tax
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className={labelClass}>Tax Rate (%)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={settings.taxRate}
              onChange={(e) => updateField('taxRate', parseFloat(e.target.value) || 0)}
              placeholder="0"
              className={inputClass}
            />
            <p className="text-xs text-muted-foreground">Enter as percentage (e.g. 8.5 for 8.5%)</p>
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Tax Inclusive</label>
            <div className="flex items-center gap-3 pt-1.5">
              <button
                type="button"
                onClick={() => updateField('taxInclusive', !settings.taxInclusive)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.taxInclusive ? 'bg-primary' : 'bg-border'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.taxInclusive ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-sm text-muted-foreground">
                {settings.taxInclusive ? 'Prices include tax' : 'Tax added at checkout'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Shipping & Reviews Toggles */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-lg text-muted-foreground">toggle_on</span>
          Features
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-1.5">
            <label className={labelClass}>Requires Shipping</label>
            <div className="flex items-center gap-3 pt-1.5">
              <button
                type="button"
                onClick={() => updateField('requiresShipping', !settings.requiresShipping)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.requiresShipping ? 'bg-primary' : 'bg-border'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.requiresShipping ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-sm text-muted-foreground">
                {settings.requiresShipping ? 'Products require shipping by default' : 'No shipping by default'}
              </span>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Enable Reviews</label>
            <div className="flex items-center gap-3 pt-1.5">
              <button
                type="button"
                onClick={() => updateField('enableReviews', !settings.enableReviews)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.enableReviews ? 'bg-primary' : 'bg-border'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.enableReviews ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-sm text-muted-foreground">
                {settings.enableReviews ? 'Customers can leave reviews' : 'Reviews disabled'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stripe Connect */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-lg text-muted-foreground">credit_card</span>
          Stripe Connect
        </h2>
        {settings.stripeConnected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="material-icons text-green-600">check_circle</span>
              <span className="text-sm font-medium text-green-700 dark:text-green-400">Stripe Connected</span>
            </div>
            {settings.stripeAccountId && (
              <p className="text-xs text-muted-foreground font-mono">Account: {settings.stripeAccountId}</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {settings.payoutSchedule && (
                <div>
                  <p className="text-xs text-muted-foreground">Payout Schedule</p>
                  <p className="text-sm text-foreground font-medium">{settings.payoutSchedule}</p>
                </div>
              )}
              {settings.platformFeePercent != null && (
                <div>
                  <p className="text-xs text-muted-foreground">Platform Fee</p>
                  <p className="text-sm text-foreground font-medium">{settings.platformFeePercent}%</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Connect your Stripe account to accept payments. You will be redirected to Stripe to complete onboarding.
            </p>
            <button
              onClick={connectStripe}
              disabled={connectingStripe}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#635BFF] text-white rounded-lg text-sm font-medium hover:bg-[#5851DB] transition-colors disabled:opacity-50"
            >
              {connectingStripe ? (
                <span className="material-icons text-base animate-spin">refresh</span>
              ) : (
                <span className="material-icons text-base">link</span>
              )}
              {connectingStripe ? 'Connecting...' : 'Connect Stripe'}
            </button>
          </div>
        )}
      </div>

      {/* Bottom save */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving && <span className="material-icons text-base animate-spin">refresh</span>}
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
