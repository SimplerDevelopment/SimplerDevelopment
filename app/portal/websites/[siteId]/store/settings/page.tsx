'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost, pCard, pCardPad, pSectionTitle, pInput, pSelect } from '@/components/portal/portal-ui';

interface ShipFromAddress {
  name?: string | null;
  company?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone?: string | null;
}

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
  // Customer portal
  enableCustomerAccounts: boolean;
  enableGuestCheckout: boolean;
  enableWishlist: boolean;
  enableOrderTracking: boolean;
  enableCustomerSupport: boolean;
  customerPortalWelcomeMessage?: string | null;
  supportEmail?: string | null;
  returnPolicyUrl?: string | null;
  shippingPolicyUrl?: string | null;
  // Shipping provider
  shippingProvider: 'manual' | 'easypost';
  easypostApiKeyConfigured: boolean;
  easypostApiKeyLast4: string | null;
  easypostMode: 'test' | 'production' | null;
  easypostWebhookSecret: string | null;
  shipFromAddress: ShipFromAddress | null;
  defaultParcelLengthIn: string | number | null;
  defaultParcelWidthIn: string | number | null;
  defaultParcelHeightIn: string | number | null;
  defaultParcelWeightOz: string | number | null;
  liveRatesFallback: boolean;
  // Stripe BYOK
  stripeMode: 'connect' | 'byok';
  stripeByokAllowed: boolean;
  stripeSecretKeyConfigured: boolean;
  stripeSecretKeyLast4: string | null;
  stripePublishableKey: string | null;
  stripeWebhookSecretConfigured: boolean;
  // Printful fulfillment
  fulfillmentProvider: 'manual' | 'printful';
  printfulApiKeyConfigured: boolean;
  printfulApiKeyLast4: string | null;
  printfulStoreId: string | null;
}

interface StripeTestResultOk {
  account: {
    id: string;
    business_name?: string | null;
    charges_enabled: boolean;
    payouts_enabled: boolean;
  };
}

interface StripeTestResultErr {
  message: string;
  code?: string;
}

type StripeTestResult =
  | { ok: true; data: StripeTestResultOk }
  | { ok: false; error: StripeTestResultErr };

interface TestResultOk {
  ok: true;
  rateCount: number;
  sampleRates: Array<{ carrier: string; service: string; amountCents: number; estDeliveryDays: number | null }>;
}

interface TestResultErr {
  ok: false;
  message: string;
  code?: string;
}

type TestResult = TestResultOk | TestResultErr;

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
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // Stripe BYOK state
  const [stripeSecretInput, setStripeSecretInput] = useState('');
  const [savingStripeSecret, setSavingStripeSecret] = useState(false);
  const [stripeWebhookInput, setStripeWebhookInput] = useState('');
  const [savingStripeWebhook, setSavingStripeWebhook] = useState(false);
  const [testingStripe, setTestingStripe] = useState(false);
  const [stripeTestResult, setStripeTestResult] = useState<StripeTestResult | null>(null);
  const [webhookUrlCopied, setWebhookUrlCopied] = useState(false);

  // Printful state
  const [printfulApiKeyInput, setPrintfulApiKeyInput] = useState('');
  const [savingPrintfulApiKey, setSavingPrintfulApiKey] = useState(false);

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
    void load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      // Strip read-only / dedicated-flow fields before PUT.
      const {
        easypostApiKeyConfigured: _ro1,
        easypostApiKeyLast4: _ro2,
        stripeConnected: _ro3,
        stripeAccountId: _ro4,
        payoutSchedule: _ro5,
        platformFeePercent: _ro6,
        // Stripe BYOK read-only fields (server-derived or admin-controlled)
        stripeByokAllowed: _ro7,
        stripeSecretKeyConfigured: _ro8,
        stripeSecretKeyLast4: _ro9,
        stripeWebhookSecretConfigured: _ro10,
        // Printful read-only fields (server-derived)
        printfulApiKeyConfigured: _ro11,
        printfulApiKeyLast4: _ro12,
        ...mutable
      } = settings;
      void _ro1; void _ro2; void _ro3; void _ro4; void _ro5; void _ro6;
      void _ro7; void _ro8; void _ro9; void _ro10; void _ro11; void _ro12;
      const payload = {
        ...mutable,
        taxRate: settings.taxRate / 100, // Convert percentage to decimal for API
        defaultParcelLengthIn: settings.defaultParcelLengthIn === '' || settings.defaultParcelLengthIn === null
          ? null
          : Number(settings.defaultParcelLengthIn),
        defaultParcelWidthIn: settings.defaultParcelWidthIn === '' || settings.defaultParcelWidthIn === null
          ? null
          : Number(settings.defaultParcelWidthIn),
        defaultParcelHeightIn: settings.defaultParcelHeightIn === '' || settings.defaultParcelHeightIn === null
          ? null
          : Number(settings.defaultParcelHeightIn),
        defaultParcelWeightOz: settings.defaultParcelWeightOz === '' || settings.defaultParcelWeightOz === null
          ? null
          : Number(settings.defaultParcelWeightOz),
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

  const updateShipFromField = <K extends keyof ShipFromAddress>(key: K, value: ShipFromAddress[K]) => {
    if (!settings) return;
    const current: ShipFromAddress = settings.shipFromAddress ?? {
      line1: '', city: '', state: '', postalCode: '', country: 'US',
    };
    setSettings({ ...settings, shipFromAddress: { ...current, [key]: value } });
    setError('');
    setSuccess('');
  };

  const saveApiKey = async () => {
    if (!apiKeyInput) return;
    setSavingApiKey(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${base}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ easypostApiKeyPlaintext: apiKeyInput }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('EasyPost API key saved.');
        setApiKeyInput('');
        await load();
      } else {
        setError(data.message || 'Failed to save key.');
      }
    } catch {
      setError('Something went wrong.');
    } finally {
      setSavingApiKey(false);
    }
  };

  const clearApiKey = async () => {
    setSavingApiKey(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${base}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ easypostApiKeyClear: true }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('EasyPost API key cleared.');
        await load();
      } else {
        setError(data.message || 'Failed to clear key.');
      }
    } catch {
      setError('Something went wrong.');
    } finally {
      setSavingApiKey(false);
    }
  };

  const testConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await fetch(`${base}/easypost/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({
          ok: true,
          rateCount: data.data.rateCount,
          sampleRates: data.data.sampleRates,
        });
      } else {
        setTestResult({ ok: false, message: data.message || 'Connection test failed', code: data.code });
      }
    } catch {
      setTestResult({ ok: false, message: 'Network error running test' });
    } finally {
      setTestingConnection(false);
    }
  };

  const parcelNumber = (v: string | number | null | undefined): string => {
    if (v === null || v === undefined) return '';
    return String(v);
  };

  // Stripe BYOK handlers ──────────────────────────────────────────────
  const saveStripeSecret = async () => {
    if (!stripeSecretInput) return;
    setSavingStripeSecret(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${base}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stripeSecretKeyPlaintext: stripeSecretInput }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Stripe secret key saved.');
        setStripeSecretInput('');
        await load();
      } else {
        setError(data.message || 'Failed to save secret key.');
      }
    } catch {
      setError('Something went wrong.');
    } finally {
      setSavingStripeSecret(false);
    }
  };

  const clearStripeSecret = async () => {
    setSavingStripeSecret(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${base}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stripeSecretKeyClear: true }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Stripe secret key cleared.');
        await load();
      } else {
        setError(data.message || 'Failed to clear secret key.');
      }
    } catch {
      setError('Something went wrong.');
    } finally {
      setSavingStripeSecret(false);
    }
  };

  const saveStripeWebhookSecret = async () => {
    if (!stripeWebhookInput) return;
    setSavingStripeWebhook(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${base}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stripeWebhookSecretPlaintext: stripeWebhookInput }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Stripe webhook secret saved.');
        setStripeWebhookInput('');
        await load();
      } else {
        setError(data.message || 'Failed to save webhook secret.');
      }
    } catch {
      setError('Something went wrong.');
    } finally {
      setSavingStripeWebhook(false);
    }
  };

  const clearStripeWebhookSecret = async () => {
    setSavingStripeWebhook(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${base}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stripeWebhookSecretClear: true }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Stripe webhook secret cleared.');
        await load();
      } else {
        setError(data.message || 'Failed to clear webhook secret.');
      }
    } catch {
      setError('Something went wrong.');
    } finally {
      setSavingStripeWebhook(false);
    }
  };

  const testStripeConnection = async () => {
    setTestingStripe(true);
    setStripeTestResult(null);
    try {
      const res = await fetch(`${base}/stripe/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        setStripeTestResult({ ok: true, data: data.data });
      } else {
        setStripeTestResult({ ok: false, error: { message: data.message || 'Connection test failed', code: data.code } });
      }
    } catch {
      setStripeTestResult({ ok: false, error: { message: 'Network error running test' } });
    } finally {
      setTestingStripe(false);
    }
  };

  const stripeMode = settings?.stripeMode ?? 'connect';
  const stripeByokAllowed = settings?.stripeByokAllowed ?? false;
  const stripeWebhookUrl = `${
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_APP_URL) || 'https://app.simplerdevelopment.com'
  }/api/stripe/webhook/ecommerce?siteId=${siteId}`;

  const copyWebhookUrl = async () => {
    try {
      await navigator.clipboard.writeText(stripeWebhookUrl);
      setWebhookUrlCopied(true);
      setTimeout(() => setWebhookUrlCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  // Printful API key handlers ─────────────────────────────────────────────
  const savePrintfulApiKey = async () => {
    if (!printfulApiKeyInput) return;
    setSavingPrintfulApiKey(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${base}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printfulApiKeyPlaintext: printfulApiKeyInput }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Printful API key saved.');
        setPrintfulApiKeyInput('');
        await load();
      } else {
        setError(data.message || 'Failed to save Printful API key.');
      }
    } catch {
      setError('Something went wrong.');
    } finally {
      setSavingPrintfulApiKey(false);
    }
  };

  const clearPrintfulApiKey = async () => {
    setSavingPrintfulApiKey(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${base}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printfulApiKeyClear: true }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Printful API key cleared.');
        await load();
      } else {
        setError(data.message || 'Failed to clear Printful API key.');
      }
    } catch {
      setError('Something went wrong.');
    } finally {
      setSavingPrintfulApiKey(false);
    }
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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PortalPageHeader
        eyebrow="Store"
        title="Store Settings"
        subtitle="Configure your store preferences and payment setup."
        actions={
          <button onClick={handleSave} disabled={saving} className={pBtnPrimary}>
            {saving && <span className="material-icons text-base animate-spin">refresh</span>}
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        }
      />

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
      <div className={`${pCard} p-6 space-y-4`}>
        <h2 className={`${pSectionTitle} flex items-center gap-2`}>
          <span className="material-icons text-lg text-muted-foreground">settings</span>
          General
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Store Name</label>
            <input
              value={settings.storeName ?? ''}
              onChange={(e) => updateField('storeName', e.target.value)}
              placeholder="My Store"
              className={pInput}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Currency</label>
            <select value={settings.currency} onChange={(e) => updateField('currency', e.target.value)} className={pSelect}>
              {currencies.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Order Prefix</label>
            <input
              value={settings.orderPrefix ?? ''}
              onChange={(e) => updateField('orderPrefix', e.target.value)}
              placeholder="ORD-"
              className={pInput}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Low Stock Threshold</label>
            <input
              type="number"
              min="0"
              value={settings.lowStockThreshold ?? 0}
              onChange={(e) => updateField('lowStockThreshold', parseInt(e.target.value) || 0)}
              className={pInput}
            />
          </div>
        </div>
      </div>

      {/* Tax Settings */}
      <div className={`${pCard} p-6 space-y-4`}>
        <h2 className={`${pSectionTitle} flex items-center gap-2`}>
          <span className="material-icons text-lg text-muted-foreground">receipt</span>
          Tax
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Tax Rate (%)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={settings.taxRate ?? 0}
              onChange={(e) => updateField('taxRate', parseFloat(e.target.value) || 0)}
              placeholder="0"
              className={pInput}
            />
            <p className="text-xs text-muted-foreground">Enter as percentage (e.g. 8.5 for 8.5%)</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Tax Inclusive</label>
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
      <div className={`${pCard} p-6 space-y-4`}>
        <h2 className={`${pSectionTitle} flex items-center gap-2`}>
          <span className="material-icons text-lg text-muted-foreground">toggle_on</span>
          Features
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Requires Shipping</label>
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
            <label className="text-sm font-medium text-foreground">Enable Reviews</label>
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

      {/* Customer Portal */}
      <div className={`${pCard} p-6 space-y-4`}>
        <h2 className={`${pSectionTitle} flex items-center gap-2`}>
          <span className="material-icons text-lg text-muted-foreground">person</span>
          Customer Portal
        </h2>
        <p className="text-sm text-muted-foreground">Configure the customer-facing account portal for your store.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {([
            { key: 'enableCustomerAccounts' as const, label: 'Customer Accounts', desc: 'Allow customers to create accounts and sign in' },
            { key: 'enableGuestCheckout' as const, label: 'Guest Checkout', desc: 'Allow checkout without creating an account' },
            { key: 'enableWishlist' as const, label: 'Wishlist', desc: 'Customers can save products to a wishlist' },
            { key: 'enableOrderTracking' as const, label: 'Order Tracking', desc: 'Customers can view order status and shipping' },
            { key: 'enableCustomerSupport' as const, label: 'Customer Support', desc: 'Customers can send support messages' },
            { key: 'enableReviews' as const, label: 'Product Reviews', desc: 'Customers can leave product reviews' },
          ] as const).map(toggle => (
            <div key={toggle.key} className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{toggle.label}</label>
              <div className="flex items-center gap-3 pt-1.5">
                <button
                  type="button"
                  onClick={() => updateField(toggle.key, !settings[toggle.key])}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings[toggle.key] ? 'bg-primary' : 'bg-border'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings[toggle.key] ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className="text-sm text-muted-foreground">{toggle.desc}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Support Email</label>
            <input
              value={settings.supportEmail ?? ''}
              onChange={(e) => updateField('supportEmail', e.target.value || null)}
              placeholder="support@yourstore.com"
              className={pInput}
            />
            <p className="text-xs text-muted-foreground">Where customer support messages are forwarded</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Return Policy URL</label>
            <input
              value={settings.returnPolicyUrl ?? ''}
              onChange={(e) => updateField('returnPolicyUrl', e.target.value || null)}
              placeholder="https://yourstore.com/returns"
              className={pInput}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Shipping Policy URL</label>
            <input
              value={settings.shippingPolicyUrl ?? ''}
              onChange={(e) => updateField('shippingPolicyUrl', e.target.value || null)}
              placeholder="https://yourstore.com/shipping"
              className={pInput}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium text-foreground">Welcome Message</label>
            <textarea
              value={settings.customerPortalWelcomeMessage ?? ''}
              onChange={(e) => updateField('customerPortalWelcomeMessage', e.target.value || null)}
              placeholder="Welcome to your account! Here you can track orders, manage your wishlist, and more."
              rows={3}
              className={pInput}
            />
            <p className="text-xs text-muted-foreground">Shown on the customer portal dashboard</p>
          </div>
        </div>
      </div>

      {/* Stripe Connect */}
      <div className={`${pCard} p-6 space-y-4`}>
        <h2 className={`${pSectionTitle} flex items-center gap-2`}>
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

      {/* Shipping Provider */}
      <div className={`${pCard} p-6 space-y-4`}>
        <h2 className={`${pSectionTitle} flex items-center gap-2`}>
          <span className="material-icons text-lg text-muted-foreground">local_shipping</span>
          Shipping Provider
        </h2>
        <p className="text-sm text-muted-foreground">
          Choose how shipping rates are calculated. Manual uses your zone-based rates; EasyPost fetches live carrier rates and prints labels.
        </p>

        <div className="flex flex-wrap gap-3">
          {(['manual', 'easypost'] as const).map((opt) => (
            <label
              key={opt}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer text-sm ${
                settings.shippingProvider === opt
                  ? 'border-primary bg-primary/5 text-foreground'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground'
              }`}
            >
              <input
                type="radio"
                name="shippingProvider"
                className="sr-only"
                checked={settings.shippingProvider === opt}
                onChange={() => updateField('shippingProvider', opt)}
              />
              <span className="material-icons text-base">
                {opt === 'manual' ? 'tune' : 'bolt'}
              </span>
              {opt === 'manual' ? 'Manual' : 'EasyPost'}
            </label>
          ))}
        </div>

        {settings.shippingProvider === 'easypost' && (
          <div className="space-y-5 pt-2 border-t border-border">
            {/* API key */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">EasyPost API Key</label>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="material-icons text-base text-muted-foreground">
                  {settings.easypostApiKeyConfigured ? 'lock' : 'lock_open'}
                </span>
                <span className={settings.easypostApiKeyConfigured ? 'text-foreground' : 'text-muted-foreground'}>
                  {settings.easypostApiKeyConfigured
                    ? `Key set, ends in …${settings.easypostApiKeyLast4 ?? '????'}`
                    : 'No key configured'}
                </span>
                {settings.easypostApiKeyConfigured && (
                  <button
                    type="button"
                    onClick={clearApiKey}
                    disabled={savingApiKey}
                    className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-muted/40 transition-colors disabled:opacity-50"
                  >
                    <span className="material-icons text-sm">delete</span>
                    Clear key
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="EZAK... or EZTK..."
                  className={pInput}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={saveApiKey}
                  disabled={savingApiKey || !apiKeyInput}
                  className={`${pBtnPrimary} whitespace-nowrap`}
                >
                  {savingApiKey && <span className="material-icons text-base animate-spin">refresh</span>}
                  Save key
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Stored encrypted at rest (AES-256-GCM). The plaintext is never echoed back to the browser.
              </p>
            </div>

            {/* Mode + Webhook secret */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Mode</label>
                <select
                  value={settings.easypostMode ?? 'test'}
                  onChange={(e) => updateField('easypostMode', e.target.value as 'test' | 'production')}
                  className={pSelect}
                >
                  <option value="test">Test</option>
                  <option value="production">Production</option>
                </select>
                <p className="text-xs text-muted-foreground">Test mode returns fake rates and never bills real money.</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Webhook Secret</label>
                <input
                  type="text"
                  value={settings.easypostWebhookSecret ?? ''}
                  onChange={(e) => updateField('easypostWebhookSecret', e.target.value || null)}
                  placeholder="HMAC secret from EasyPost"
                  className={pInput}
                />
                <p className="text-xs text-muted-foreground">
                  Set this in EasyPost dashboard → Webhooks → secret. URL to register:{' '}
                  <code className="font-mono text-[11px] bg-muted/40 px-1 py-0.5 rounded">
                    https://&lt;your-site&gt;/api/webhooks/easypost?websiteId={siteId}
                  </code>{' '}
                  (replace with your actual domain).
                </p>
              </div>
            </div>

            {/* Ship-from address */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span className="material-icons text-base text-muted-foreground">place</span>
                Ship-From Address
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Name</label>
                  <input
                    value={settings.shipFromAddress?.name ?? ''}
                    onChange={(e) => updateShipFromField('name', e.target.value || null)}
                    className={pInput}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Company</label>
                  <input
                    value={settings.shipFromAddress?.company ?? ''}
                    onChange={(e) => updateShipFromField('company', e.target.value || null)}
                    className={pInput}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-sm font-medium text-foreground">Address Line 1</label>
                  <input
                    value={settings.shipFromAddress?.line1 ?? ''}
                    onChange={(e) => updateShipFromField('line1', e.target.value)}
                    className={pInput}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-sm font-medium text-foreground">Address Line 2</label>
                  <input
                    value={settings.shipFromAddress?.line2 ?? ''}
                    onChange={(e) => updateShipFromField('line2', e.target.value || null)}
                    className={pInput}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">City</label>
                  <input
                    value={settings.shipFromAddress?.city ?? ''}
                    onChange={(e) => updateShipFromField('city', e.target.value)}
                    className={pInput}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">State / Province</label>
                  <input
                    value={settings.shipFromAddress?.state ?? ''}
                    onChange={(e) => updateShipFromField('state', e.target.value)}
                    className={pInput}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Postal Code</label>
                  <input
                    value={settings.shipFromAddress?.postalCode ?? ''}
                    onChange={(e) => updateShipFromField('postalCode', e.target.value)}
                    className={pInput}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Country (2-letter)</label>
                  <input
                    value={settings.shipFromAddress?.country ?? 'US'}
                    onChange={(e) => updateShipFromField('country', (e.target.value || 'US').toUpperCase())}
                    maxLength={2}
                    className={pInput}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-sm font-medium text-foreground">Phone</label>
                  <input
                    value={settings.shipFromAddress?.phone ?? ''}
                    onChange={(e) => updateShipFromField('phone', e.target.value || null)}
                    className={pInput}
                  />
                </div>
              </div>
            </div>

            {/* Default parcel */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span className="material-icons text-base text-muted-foreground">inventory_2</span>
                Default Parcel
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Length (in)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={parcelNumber(settings.defaultParcelLengthIn)}
                    onChange={(e) => updateField('defaultParcelLengthIn', e.target.value === '' ? null : e.target.value)}
                    className={pInput}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Width (in)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={parcelNumber(settings.defaultParcelWidthIn)}
                    onChange={(e) => updateField('defaultParcelWidthIn', e.target.value === '' ? null : e.target.value)}
                    className={pInput}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Height (in)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={parcelNumber(settings.defaultParcelHeightIn)}
                    onChange={(e) => updateField('defaultParcelHeightIn', e.target.value === '' ? null : e.target.value)}
                    className={pInput}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Weight (oz)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={parcelNumber(settings.defaultParcelWeightOz)}
                    onChange={(e) => updateField('defaultParcelWeightOz', e.target.value === '' ? null : e.target.value)}
                    className={pInput}
                  />
                </div>
              </div>
            </div>

            {/* Live rates fallback */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Live Rates Fallback</label>
              <div className="flex items-center gap-3 pt-1.5">
                <button
                  type="button"
                  onClick={() => updateField('liveRatesFallback', !settings.liveRatesFallback)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.liveRatesFallback ? 'bg-primary' : 'bg-border'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.liveRatesFallback ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className="text-sm text-muted-foreground">Show manual rates when live rates fail</span>
              </div>
            </div>

            {/* Test connection */}
            <div className="space-y-3 pt-2 border-t border-border">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Test Connection</h3>
                  <p className="text-xs text-muted-foreground">
                    Sends a synthetic shipment from your ship-from address to San Francisco and quotes rates.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={testConnection}
                  disabled={testingConnection}
                  className={`${pBtnGhost} whitespace-nowrap`}
                >
                  {testingConnection ? (
                    <span className="material-icons text-base animate-spin">refresh</span>
                  ) : (
                    <span className="material-icons text-base">network_check</span>
                  )}
                  {testingConnection ? 'Testing...' : 'Test connection'}
                </button>
              </div>
              {testResult && (testResult.ok ? (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300">
                  <div className="flex items-center gap-2 font-medium">
                    <span className="material-icons text-base">check_circle</span>
                    Got {testResult.rateCount} rate{testResult.rateCount === 1 ? '' : 's'}
                  </div>
                  {testResult.sampleRates.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs">
                      {testResult.sampleRates.map((r, i) => (
                        <li key={i} className="font-mono">
                          {r.carrier} · {r.service} · ${(r.amountCents / 100).toFixed(2)}
                          {r.estDeliveryDays != null ? ` · ${r.estDeliveryDays}d` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
                  <div className="flex items-center gap-2 font-medium">
                    <span className="material-icons text-base">error</span>
                    {testResult.message}
                  </div>
                  {testResult.code && (
                    <p className="mt-1 text-xs font-mono opacity-80">code: {testResult.code}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Fulfillment Provider */}
      <div className={`${pCard} p-6 space-y-4`}>
        <h2 className={`${pSectionTitle} flex items-center gap-2`}>
          <span className="material-icons text-lg text-muted-foreground">print</span>
          Fulfillment
        </h2>
        <p className="text-sm text-muted-foreground">
          Choose how orders are fulfilled. Manual means you handle fulfillment yourself; Printful automatically submits print-on-demand orders.
        </p>

        <div className="flex flex-wrap gap-3">
          {(['manual', 'printful'] as const).map((opt) => (
            <label
              key={opt}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer text-sm ${
                settings.fulfillmentProvider === opt
                  ? 'border-primary bg-primary/5 text-foreground'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground'
              }`}
            >
              <input
                type="radio"
                name="fulfillmentProvider"
                className="sr-only"
                checked={settings.fulfillmentProvider === opt}
                onChange={() => updateField('fulfillmentProvider', opt)}
              />
              <span className="material-icons text-base">
                {opt === 'manual' ? 'tune' : 'print'}
              </span>
              {opt === 'manual' ? 'Manual' : 'Printful (Print-on-Demand)'}
            </label>
          ))}
        </div>

        {settings.fulfillmentProvider === 'printful' && (
          <div className="space-y-5 pt-2 border-t border-border">
            {/* API key */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Printful API Key</label>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="material-icons text-base text-muted-foreground">
                  {settings.printfulApiKeyConfigured ? 'lock' : 'lock_open'}
                </span>
                <span className={settings.printfulApiKeyConfigured ? 'text-foreground' : 'text-muted-foreground'}>
                  {settings.printfulApiKeyConfigured
                    ? `Key set, ends in …${settings.printfulApiKeyLast4 ?? '????'}`
                    : 'No key configured'}
                </span>
                {settings.printfulApiKeyConfigured && (
                  <button
                    type="button"
                    onClick={clearPrintfulApiKey}
                    disabled={savingPrintfulApiKey}
                    className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-muted/40 transition-colors disabled:opacity-50"
                  >
                    <span className="material-icons text-sm">delete</span>
                    Clear key
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={printfulApiKeyInput}
                  onChange={(e) => setPrintfulApiKeyInput(e.target.value)}
                  placeholder="Printful API key"
                  className={pInput}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={savePrintfulApiKey}
                  disabled={savingPrintfulApiKey || !printfulApiKeyInput}
                  className={`${pBtnPrimary} whitespace-nowrap`}
                >
                  {savingPrintfulApiKey && <span className="material-icons text-base animate-spin">refresh</span>}
                  Save key
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter your Printful API key from Printful &rarr; Dashboard &rarr; API &rarr; Keys. Stored encrypted at rest (AES-256-GCM).
              </p>
            </div>

            {/* Printful Store ID */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Printful Store ID</label>
              <input
                type="text"
                value={settings.printfulStoreId ?? ''}
                onChange={(e) => updateField('printfulStoreId', e.target.value || null)}
                placeholder="e.g. 12345678"
                className={pInput}
              />
              <p className="text-xs text-muted-foreground">
                Found in your Printful dashboard URL or under Store Settings. Saved with the main &quot;Save Settings&quot; button.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Stripe Payment Provider (BYOK) */}
      <div className={`${pCard} p-6 space-y-4`}>
        <h2 className={`${pSectionTitle} flex items-center gap-2`}>
          <span className="material-icons text-lg text-muted-foreground">account_balance</span>
          Stripe Payment Provider
        </h2>

        {!stripeByokAllowed ? (
          <div className="flex items-start gap-3 p-4 bg-muted/30 border border-border rounded-lg text-sm">
            <span className="material-icons text-base text-muted-foreground mt-0.5">info</span>
            <div>
              <p className="text-foreground font-medium">Stripe BYOK is not enabled for this site.</p>
              <p className="text-muted-foreground mt-1">
                Contact SimplerDevelopment to enable using your own Stripe account.
              </p>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Choose whether payments route through SimplerDevelopment Connect or your own Stripe account (BYOK).
            </p>

            {/* Mode radio */}
            <div className="flex flex-wrap gap-3">
              {([
                { value: 'connect' as const, label: 'Connect', icon: 'hub', desc: 'Default — SimplerDevelopment Connect' },
                { value: 'byok' as const, label: 'BYOK', icon: 'vpn_key', desc: 'Your own Stripe account' },
              ]).map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer text-sm ${
                    stripeMode === opt.value
                      ? 'border-primary bg-primary/5 text-foreground'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <input
                    type="radio"
                    name="stripeMode"
                    className="sr-only"
                    checked={stripeMode === opt.value}
                    onChange={() => updateField('stripeMode', opt.value)}
                  />
                  <span className="material-icons text-base">{opt.icon}</span>
                  {opt.label}
                  <span className="text-xs text-muted-foreground hidden sm:inline">— {opt.desc}</span>
                </label>
              ))}
            </div>

            {stripeMode === 'byok' && (
              <div className="space-y-5 pt-2 border-t border-border">
                {/* Secret Key */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Secret Key</label>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="material-icons text-base text-muted-foreground">
                      {settings.stripeSecretKeyConfigured ? 'lock' : 'lock_open'}
                    </span>
                    <span className={settings.stripeSecretKeyConfigured ? 'text-foreground' : 'text-muted-foreground'}>
                      {settings.stripeSecretKeyConfigured
                        ? `Configured (ends in …${settings.stripeSecretKeyLast4 ?? '????'})`
                        : 'No key configured'}
                    </span>
                    {settings.stripeSecretKeyConfigured && (
                      <button
                        type="button"
                        onClick={clearStripeSecret}
                        disabled={savingStripeSecret}
                        className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-muted/40 transition-colors disabled:opacity-50"
                      >
                        <span className="material-icons text-sm">delete</span>
                        Clear key
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={stripeSecretInput}
                      onChange={(e) => setStripeSecretInput(e.target.value)}
                      placeholder="sk_test_… or sk_live_…"
                      className={pInput}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={saveStripeSecret}
                      disabled={savingStripeSecret || !stripeSecretInput}
                      className={`${pBtnPrimary} whitespace-nowrap`}
                    >
                      {savingStripeSecret && <span className="material-icons text-base animate-spin">refresh</span>}
                      Save key
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Stored encrypted at rest (AES-256-GCM). The plaintext is never echoed back to the browser.
                  </p>
                </div>

                {/* Publishable Key */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Publishable Key</label>
                  <input
                    type="text"
                    value={settings.stripePublishableKey ?? ''}
                    onChange={(e) => updateField('stripePublishableKey', e.target.value || null)}
                    placeholder="pk_test_… or pk_live_…"
                    className={pInput}
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">
                    Public key used by Stripe.js. Saved with the main &quot;Save Settings&quot; button.
                  </p>
                </div>

                {/* Webhook Endpoint Secret */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Webhook Endpoint Secret</label>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="material-icons text-base text-muted-foreground">
                      {settings.stripeWebhookSecretConfigured ? 'lock' : 'lock_open'}
                    </span>
                    <span className={settings.stripeWebhookSecretConfigured ? 'text-foreground' : 'text-muted-foreground'}>
                      {settings.stripeWebhookSecretConfigured ? 'Configured' : 'Not configured'}
                    </span>
                    {settings.stripeWebhookSecretConfigured && (
                      <button
                        type="button"
                        onClick={clearStripeWebhookSecret}
                        disabled={savingStripeWebhook}
                        className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-muted/40 transition-colors disabled:opacity-50"
                      >
                        <span className="material-icons text-sm">delete</span>
                        Clear secret
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={stripeWebhookInput}
                      onChange={(e) => setStripeWebhookInput(e.target.value)}
                      placeholder="whsec_…"
                      className={pInput}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={saveStripeWebhookSecret}
                      disabled={savingStripeWebhook || !stripeWebhookInput}
                      className={`${pBtnPrimary} whitespace-nowrap`}
                    >
                      {savingStripeWebhook && <span className="material-icons text-base animate-spin">refresh</span>}
                      Save secret
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Signing secret from Stripe Dashboard → Developers → Webhooks. Stored encrypted at rest.
                  </p>
                </div>

                {/* Webhook URL (read-only / copyable) */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Webhook URL</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={stripeWebhookUrl}
                      className={`${pInput} font-mono text-xs bg-muted/30`}
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <button
                      type="button"
                      onClick={copyWebhookUrl}
                      className={`${pBtnGhost} whitespace-nowrap`}
                    >
                      <span className="material-icons text-base">
                        {webhookUrlCopied ? 'check' : 'content_copy'}
                      </span>
                      {webhookUrlCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Paste this into your Stripe dashboard → Developers → Webhooks → Add endpoint. Listen for{' '}
                    <code className="font-mono text-[11px] bg-muted/40 px-1 py-0.5 rounded">payment_intent.succeeded</code>,{' '}
                    <code className="font-mono text-[11px] bg-muted/40 px-1 py-0.5 rounded">payment_intent.payment_failed</code>,{' '}
                    <code className="font-mono text-[11px] bg-muted/40 px-1 py-0.5 rounded">charge.refunded</code>.
                  </p>
                </div>

                {/* Test Connection */}
                <div className="space-y-3 pt-2 border-t border-border">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Test Connection</h3>
                      <p className="text-xs text-muted-foreground">
                        Verifies the secret key by retrieving your Stripe account.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={testStripeConnection}
                      disabled={testingStripe || !settings.stripeSecretKeyConfigured}
                      className={`${pBtnGhost} whitespace-nowrap`}
                    >
                      {testingStripe ? (
                        <span className="material-icons text-base animate-spin">refresh</span>
                      ) : (
                        <span className="material-icons text-base">network_check</span>
                      )}
                      {testingStripe ? 'Testing...' : 'Test connection'}
                    </button>
                  </div>
                  {stripeTestResult && (stripeTestResult.ok ? (
                    <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300">
                      <div className="flex items-center gap-2 font-medium">
                        <span className="material-icons text-base">check_circle</span>
                        Connected to Stripe
                      </div>
                      <ul className="mt-2 space-y-1 text-xs font-mono">
                        <li>Account: {stripeTestResult.data.account.id}</li>
                        {stripeTestResult.data.account.business_name && (
                          <li>Business: {stripeTestResult.data.account.business_name}</li>
                        )}
                        <li>
                          Charges: {stripeTestResult.data.account.charges_enabled ? 'enabled' : 'disabled'} · Payouts:{' '}
                          {stripeTestResult.data.account.payouts_enabled ? 'enabled' : 'disabled'}
                        </li>
                      </ul>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
                      <div className="flex items-center gap-2 font-medium">
                        <span className="material-icons text-base">error</span>
                        {stripeTestResult.error.message}
                      </div>
                      {stripeTestResult.error.code && (
                        <p className="mt-1 text-xs font-mono opacity-80">code: {stripeTestResult.error.code}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom save */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className={pBtnPrimary}>
          {saving && <span className="material-icons text-base animate-spin">refresh</span>}
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
