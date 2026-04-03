'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const WEBSITE_TYPES = [
  { value: 'business', label: 'Business Website', icon: 'business', description: 'Company homepage, about, services, contact' },
  { value: 'portfolio', label: 'Portfolio', icon: 'photo_library', description: 'Showcase your work and projects' },
  { value: 'blog', label: 'Blog', icon: 'rss_feed', description: 'Articles, news, and long-form content' },
  { value: 'landing', label: 'Landing Page', icon: 'web', description: 'Single-page focused on one goal' },
  { value: 'ecommerce', label: 'E-commerce', icon: 'shopping_cart', description: 'Sell products online' },
  { value: 'other', label: 'Something Else', icon: 'more_horiz', description: 'Custom setup — we\'ll figure it out together' },
];

function toSlug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 63);
}

export default function PortalCmsNewPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState({ name: '', domain: '', description: '', websiteType: '', subdomain: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Auto-generate subdomain from name
  const effectiveSubdomain = form.subdomain || toSlug(form.name);

  const handleCreate = async () => {
    if (!form.name) { setError('Please enter a website name.'); return; }
    setSaving(true); setError('');
    const res = await fetch('/api/portal/cms/websites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        domain: form.domain || null,
        description: form.description || null,
        subdomain: effectiveSubdomain || null,
      }),
    });
    const data = await res.json();
    if (!data.success) { setSaving(false); setError(data.message || 'Failed to create website.'); return; }

    setSaving(false);
    router.push(`/portal/websites/${data.data.id}?created=1`);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Back */}
      <Link
        href="/portal/websites"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="material-icons text-base">arrow_back</span>
        Back to Websites
      </Link>

      {/* Progress */}
      <div className="flex items-center gap-2">
        {([1, 2, 3] as const).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
              step > s ? 'bg-primary text-primary-foreground' :
              step === s ? 'bg-primary text-primary-foreground' :
              'bg-muted text-muted-foreground'
            }`}>
              {step > s ? <span className="material-icons text-sm">check</span> : s}
            </div>
            {s < 3 && <div className={`h-px flex-1 w-8 transition-colors ${step > s ? 'bg-primary' : 'bg-border'}`} />}
          </div>
        ))}
        <div className="ml-2 text-xs text-muted-foreground">
          {step === 1 && 'Choose type'}
          {step === 2 && 'Name your site'}
          {step === 3 && 'Domain (optional)'}
        </div>
      </div>

      {/* Step 1 — Website type */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">What kind of website are you building?</h1>
            <p className="text-muted-foreground text-sm mt-1">This helps us set things up for you, but you can change it anytime.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {WEBSITE_TYPES.map((type) => (
              <button
                key={type.value}
                onClick={() => { setForm(f => ({ ...f, websiteType: type.value })); setStep(2); }}
                className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all hover:border-primary/60 hover:bg-primary/5 group ${
                  form.websiteType === type.value ? 'border-primary bg-primary/5' : 'border-border bg-card'
                }`}
              >
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                  <span className="material-icons text-muted-foreground group-hover:text-primary transition-colors">{type.icon}</span>
                </div>
                <div>
                  <p className="font-medium text-foreground text-sm">{type.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{type.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2 — Name */}
      {step === 2 && (
        <div className="space-y-5">
          <div>
            <h1 className="text-xl font-bold text-foreground">Name your website</h1>
            <p className="text-muted-foreground text-sm mt-1">This is just an internal label — your visitors won&apos;t see it.</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Website name *</label>
              <input
                autoFocus
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter' && form.name) setStep(3); }}
                placeholder={
                  form.websiteType === 'business' ? 'e.g. Acme Corp Website' :
                  form.websiteType === 'blog' ? 'e.g. My Blog' :
                  form.websiteType === 'portfolio' ? 'e.g. My Portfolio' :
                  'e.g. My Website'
                }
                className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-foreground outline-none focus:border-primary text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Brief description <span className="text-muted-foreground font-normal">(optional)</span></label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="What is this website for?"
                className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-foreground outline-none focus:border-primary text-sm resize-none"
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg bg-card hover:bg-accent transition-colors">
              Back
            </button>
            <button
              onClick={() => { if (!form.name) { setError('Please enter a name.'); return; } setError(''); setStep(3); }}
              disabled={!form.name}
              className="flex-1 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Subdomain + Domain + create */}
      {step === 3 && (
        <div className="space-y-5">
          <div>
            <h1 className="text-xl font-bold text-foreground">Your website address</h1>
            <p className="text-muted-foreground text-sm mt-1">Your site will be live at a simplerdevelopment.com subdomain. You can add a custom domain later.</p>
          </div>

          {/* Subdomain */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Subdomain</label>
              <div className="flex items-center gap-0">
                <div className="flex items-center gap-2 px-3 py-2.5 bg-background border border-border rounded-l-lg flex-1 focus-within:border-primary transition-colors">
                  <input
                    autoFocus
                    value={form.subdomain || toSlug(form.name)}
                    onChange={e => setForm(f => ({ ...f, subdomain: toSlug(e.target.value) }))}
                    className="bg-transparent outline-none flex-1 text-sm text-foreground font-mono"
                  />
                </div>
                <div className="px-3 py-2.5 bg-muted border border-l-0 border-border rounded-r-lg text-sm text-muted-foreground font-mono shrink-0">
                  .simplerdevelopment.com
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                This will be your website&apos;s default URL
              </p>
            </div>

            {/* Custom domain (optional) */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Custom domain <span className="text-muted-foreground font-normal">(optional)</span></label>
              <div className="flex items-center gap-2 px-3 py-2.5 bg-background border border-border rounded-lg focus-within:border-primary transition-colors">
                <span className="material-icons text-muted-foreground text-base">language</span>
                <input
                  value={form.domain}
                  onChange={e => setForm(f => ({ ...f, domain: e.target.value.replace(/^https?:\/\//, '') }))}
                  placeholder="yoursite.com"
                  className="bg-transparent outline-none flex-1 text-sm text-foreground font-mono"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">You can configure this later too</p>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-2 text-sm">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Summary</p>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type</span>
              <span className="text-foreground font-medium capitalize">{WEBSITE_TYPES.find(t => t.value === form.websiteType)?.label || form.websiteType}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name</span>
              <span className="text-foreground font-medium">{form.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">URL</span>
              <span className="text-foreground font-mono text-xs">{effectiveSubdomain}.simplerdevelopment.com</span>
            </div>
            {form.domain && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Custom domain</span>
                <span className="text-foreground font-mono text-xs">{form.domain}</span>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg bg-card hover:bg-accent transition-colors">
              Back
            </button>
            <button
              onClick={handleCreate}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving && <span className="material-icons text-base animate-spin">refresh</span>}
              {saving ? 'Creating...' : 'Create Website'}
            </button>
          </div>

          {/* Request help */}
          <div className="flex items-center gap-3 p-4 border border-border rounded-xl bg-card">
            <span className="material-icons text-muted-foreground">support_agent</span>
            <div className="flex-1 text-sm">
              <p className="font-medium text-foreground">Need a hand?</p>
              <p className="text-muted-foreground text-xs mt-0.5">Our team can set everything up for you.</p>
            </div>
            <Link
              href="/portal/tickets/new"
              className="text-sm text-primary hover:underline shrink-0 flex items-center gap-1"
            >
              Get help
              <span className="material-icons text-sm">arrow_forward</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
