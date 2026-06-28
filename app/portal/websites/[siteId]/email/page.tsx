'use client';

import { useState, useEffect, useRef, use } from 'react';
import Link from 'next/link';
import { EMAIL_EVENTS } from '@/lib/email/website-email-events';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnGhost, pCard } from '@/components/portal/portal-ui';

interface Template {
  id: number;
  event: string;
  name: string;
  subject: string;
  enabled: boolean;
  isRequired: boolean;
  updatedAt: string;
}

const CATEGORY_META: Record<string, { label: string; icon: string }> = {
  store: { label: 'Store / eCommerce', icon: 'shopping_cart' },
  account: { label: 'Account', icon: 'person' },
  booking: { label: 'Booking', icon: 'calendar_month' },
  content: { label: 'Content', icon: 'article' },
};

export default function WebsiteEmailPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const seeded = useRef(false);
  const categories = [...new Set(EMAIL_EVENTS.map(e => e.category))];
  const [activeTab, setActiveTab] = useState<string>(categories[0] ?? 'store');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Fetch existing templates
      const res = await fetch(`/api/portal/cms/websites/${siteId}/email-templates`);
      const data = await res.json();
      if (cancelled) return;
      const existing: Template[] = data.success ? data.data : [];

      // Auto-seed any missing templates
      const existingEvents = new Set(existing.map(t => t.event));
      const hasMissing = EMAIL_EVENTS.some(e => !existingEvents.has(e.event));

      if (hasMissing && !seeded.current) {
        seeded.current = true;
        const seedRes = await fetch(`/api/portal/cms/websites/${siteId}/email-templates/seed-defaults`, { method: 'POST' });
        const seedData = await seedRes.json();
        if (!cancelled && seedData.success && seedData.data.templates) {
          setTemplates([...existing, ...seedData.data.templates]);
          setLoading(false);
          return;
        }
      }

      setTemplates(existing);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [siteId]);

  const templatesByEvent = new Map(templates.map(t => [t.event, t]));

  async function toggleEnabled(template: Template) {
    const res = await fetch(`/api/portal/cms/websites/${siteId}/email-templates/${template.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !template.enabled }),
    });
    const data = await res.json();
    if (data.success) {
      setTemplates(prev => prev.map(t => t.id === template.id ? { ...t, enabled: !t.enabled } : t));
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><span className="material-icons animate-spin text-3xl text-muted-foreground">autorenew</span></div>;
  }

  const tabs = [
    ...categories.map(cat => ({
      id: cat,
      label: CATEGORY_META[cat]?.label ?? cat,
      icon: CATEGORY_META[cat]?.icon ?? 'mail',
    })),
    { id: 'variables', label: 'Variable Reference', icon: 'code' },
  ];

  const activeCatEvents = EMAIL_EVENTS.filter(e => e.category === activeTab);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PortalPageHeader
        eyebrow="Website"
        title="Email Templates"
        subtitle="Transactional emails triggered by website events. Customize the content and branding for each."
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Templates</p>
          <p className="text-2xl font-display font-extrabold tracking-[-0.02em] text-foreground">{templates.length}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Active</p>
          <p className="text-2xl font-display font-extrabold tracking-[-0.02em] text-green-600">{templates.filter(t => t.enabled).length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <span className="material-icons text-base">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'variables' ? (
        <div className={`${pCard} overflow-hidden`}>
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-display font-extrabold tracking-[-0.01em] text-foreground text-sm">Variable Reference</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Use <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">%%variableName%%</code> in your email content and subject lines. Variables are replaced with real data when the email is sent.
            </p>
          </div>
          <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-xs">
            {[
              { key: 'firstName', label: 'First Name' },
              { key: 'lastName', label: 'Last Name' },
              { key: 'fullName', label: 'Full Name' },
              { key: 'email', label: 'Email' },
              { key: 'orderNumber', label: 'Order Number' },
              { key: 'orderTotal', label: 'Order Total' },
              { key: 'trackingNumber', label: 'Tracking #' },
              { key: 'trackingUrl', label: 'Tracking URL' },
              { key: 'siteName', label: 'Site Name' },
              { key: 'siteUrl', label: 'Site URL' },
              { key: 'itemsHtml', label: 'Order Items' },
              { key: 'currentYear', label: 'Year' },
            ].map(v => (
              <div key={v.key} className="flex items-center gap-2">
                <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-primary">%%{v.key}%%</code>
                <span className="text-muted-foreground">{v.label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className={`${pCard} overflow-hidden`}>
          <div className="divide-y divide-border">
            {activeCatEvents.map(eventDef => {
              const template = templatesByEvent.get(eventDef.event);

              return (
                <div key={eventDef.event} className="flex items-center gap-4 px-5 py-4">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    template?.enabled ? 'bg-green-500' : 'bg-muted-foreground/40'
                  }`} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{eventDef.name}</span>
                      {eventDef.isRequired && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 font-medium">Required</span>
                      )}
                      {template && !template.enabled && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">Disabled</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{eventDef.description}</p>
                    {template && (
                      <p className="text-xs text-muted-foreground/60 mt-0.5">
                        Subject: {template.subject}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {template && (
                      <>
                        <button
                          onClick={() => toggleEnabled(template)}
                          className={`p-1.5 rounded-md transition-colors ${template.enabled ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20' : 'text-muted-foreground hover:bg-accent'}`}
                          title={template.enabled ? 'Disable' : 'Enable'}
                        >
                          <span className="material-icons text-base">{template.enabled ? 'toggle_on' : 'toggle_off'}</span>
                        </button>
                        <Link
                          href={`/portal/websites/${siteId}/email/${template.id}`}
                          className={pBtnGhost}
                        >
                          <span className="material-icons text-sm">edit</span>
                          Edit
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
