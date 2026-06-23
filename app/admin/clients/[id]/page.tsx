'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import ClientBillingSummary from '@/components/admin/ClientBillingSummary';

interface Client {
  id: number; userId: number; company: string | null; phone: string | null;
  website: string | null; address: string | null; notes: string | null; createdAt: string;
  userName: string; userEmail: string; userActive: boolean;
}
interface EmailList { id: number; name: string; description: string | null; subscriberCount: number; }
interface Campaign {
  id: number; name: string; subject: string; status: string;
  totalSent: number; totalOpened: number; sentAt: string | null; listName: string | null;
}
interface Subscriber { id: number; email: string; name: string | null; status: string; }

interface DnsRecord {
  record: string; name: string; type: string; ttl: string; status: string; value: string; priority?: number;
}
interface Domain {
  id: string; name: string; status: string; createdAt: string; region: string;
  records?: DnsRecord[]; openTracking?: boolean; clickTracking?: boolean;
}

const campaignStatusColor: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700', scheduled: 'bg-blue-100 text-blue-700',
  sending: 'bg-yellow-100 text-yellow-700', sent: 'bg-green-100 text-green-700',
};
const domainStatusColor: Record<string, string> = {
  verified: 'bg-green-100 text-green-700', pending: 'bg-yellow-100 text-yellow-700',
  not_started: 'bg-gray-100 text-gray-600', partially_verified: 'bg-blue-100 text-blue-700',
  partially_failed: 'bg-orange-100 text-orange-700', failed: 'bg-red-100 text-red-700',
};
const domainStatusIcon: Record<string, string> = {
  verified: 'check_circle', pending: 'hourglass_empty', not_started: 'radio_button_unchecked',
  partially_verified: 'incomplete_circle', partially_failed: 'warning', failed: 'cancel',
};
const recordStatusColor: Record<string, string> = {
  verified: 'text-green-500', not_started: 'text-muted-foreground',
  pending: 'text-yellow-500', failed: 'text-red-500',
};

const TAB_LABELS: Record<string, string> = { overview: 'Overview', email: 'Email Marketing', billing: 'Billing', settings: 'Settings', team: 'Team' };

interface MeteredItem {
  id: number; clientId: number; resource: string;
  stripeSubscriptionId: string; stripeSubscriptionItemId: string;
  unitPriceCents: number; includedQuantity: string; status: string;
  createdAt: string; updatedAt: string;
}
interface BillingDryRun {
  resource: string; total: number; included: number; billable: number;
  billedCents: number; stripeUsageRecordId: string | null;
  stripeSubscriptionItemId: string | null; error?: string;
}
interface BillingHistory {
  id: number; clientId: number; period: string; resource: string;
  totalQuantity: string; includedQuantity: string; billableQuantity: string;
  unitPriceCents: number; billedAmountCents: number;
  stripeUsageRecordId: string | null; reportedAt: string | null; createdAt: string;
}
interface BillingUsage {
  period: string;
  liveTotals: { resource: string; total: number }[];
  dryRun: BillingDryRun[];
  history: BillingHistory[];
}

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const clientId = parseInt(id);
  const [client, setClient] = useState<Client | null>(null);
  const [tab, setTab] = useState<'overview' | 'email' | 'billing' | 'settings' | 'team'>('overview');
  const [lists, setLists] = useState<EmailList[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [emailLoaded, setEmailLoaded] = useState(false);

  // List management
  const [selectedList, setSelectedList] = useState<EmailList | null>(null);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [showListForm, setShowListForm] = useState(false);
  const [listForm, setListForm] = useState({ name: '', description: '' });
  const [subForm, setSubForm] = useState({ email: '', name: '' });
  const [subSaving, setSubSaving] = useState(false);

  // Campaign form
  const [showCampForm, setShowCampForm] = useState(false);
  const [campForm, setCampForm] = useState({ name: '', subject: '', fromName: '', fromEmail: '', listId: '', htmlContent: '' });
  const [campSaving, setCampSaving] = useState(false);
  const [campError, setCampError] = useState('');

  // Team members
  interface TeamMember { memberId: number; role: string; userId: number; name: string; email: string; active: boolean; joinedAt: string; }
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [teamLoaded, setTeamLoaded] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberForm, setMemberForm] = useState({ name: '', email: '', password: '' });
  const [memberSaving, setMemberSaving] = useState(false);
  const [memberError, setMemberError] = useState('');

  // Billing: metered Stripe items + usage preview
  const [billingLoaded, setBillingLoaded] = useState(false);
  const [meteredItems, setMeteredItems] = useState<MeteredItem[]>([]);
  const [billingUsage, setBillingUsage] = useState<BillingUsage | null>(null);
  const [showMeteredForm, setShowMeteredForm] = useState(false);
  const [meteredForm, setMeteredForm] = useState({
    resource: 'hosting_bandwidth_gb',
    unitPriceCents: '',
    includedQuantity: '0',
    stripeSubscriptionId: '',
    stripeSubscriptionItemId: '',
    stripePriceId: '',
  });
  const [meteredSaving, setMeteredSaving] = useState(false);
  const [meteredError, setMeteredError] = useState('');
  const [rollupRunning, setRollupRunning] = useState(false);
  const [rollupMessage, setRollupMessage] = useState('');

  // Settings: profile edit
  const [settingsForm, setSettingsForm] = useState({ name: '', company: '', phone: '', website: '', notes: '', active: true });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsError, setSettingsError] = useState('');

  // Settings: domains
  const [domainsLoaded, setDomainsLoaded] = useState(false);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [domainsLoading, setDomainsLoading] = useState(false);
  const [showAddDomainForm, setShowAddDomainForm] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [addingDomain, setAddingDomain] = useState(false);
  const [addDomainError, setAddDomainError] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null);
  const [domainDetailLoading, setDomainDetailLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [trackingSaving, setTrackingSaving] = useState(false);

  useEffect(() => {
    fetch('/api/admin/portal/clients')
      .then(r => r.json())
      .then(d => {
        const found = (d.data ?? []).find((c: Client) => c.id === clientId);
        setClient(found ?? null);
        if (found) {
          setSettingsForm({
            name: found.userName ?? '',
            company: found.company ?? '',
            phone: found.phone ?? '',
            website: found.website ?? '',
            notes: found.notes ?? '',
            active: found.userActive,
          });
        }
        setLoading(false);
      });
  }, [clientId]);

  useEffect(() => {
    if (tab === 'email' && !emailLoaded) {
      Promise.all([
        fetch(`/api/admin/email/lists?clientId=${clientId}`).then(r => r.json()),
        fetch(`/api/admin/email/campaigns?clientId=${clientId}`).then(r => r.json()),
      ]).then(([l, c]) => { setLists(l.data ?? []); setCampaigns(c.data ?? []); setEmailLoaded(true); });
    }
  }, [tab, emailLoaded, clientId]);

  useEffect(() => {
    if (tab === 'team' && !teamLoaded) {
      fetch(`/api/admin/portal/clients/${clientId}/members`).then(r => r.json()).then(d => {
        setMembers(d.data ?? []);
        setTeamLoaded(true);
      });
    }
  }, [tab, teamLoaded, clientId]);

  // Billing: load metered items + usage preview when the tab opens
  useEffect(() => {
    if (tab !== 'billing' || billingLoaded) return;
    let cancelled = false;
    Promise.all([
      fetch(`/api/admin/portal/clients/${clientId}/billing/metered-items`).then(r => r.json()),
      fetch(`/api/admin/portal/clients/${clientId}/billing/usage`).then(r => r.json()),
    ]).then(([items, usage]) => {
      if (cancelled) return;
      setMeteredItems(items.data ?? []);
      setBillingUsage(usage.data ?? null);
      setBillingLoaded(true);
    });
    return () => { cancelled = true; };
  }, [tab, billingLoaded, clientId]);

  async function refreshBilling() {
    const [items, usage] = await Promise.all([
      fetch(`/api/admin/portal/clients/${clientId}/billing/metered-items`).then(r => r.json()),
      fetch(`/api/admin/portal/clients/${clientId}/billing/usage`).then(r => r.json()),
    ]);
    setMeteredItems(items.data ?? []);
    setBillingUsage(usage.data ?? null);
  }

  async function addMeteredItem(e: React.FormEvent) {
    e.preventDefault();
    setMeteredSaving(true);
    setMeteredError('');
    const unitPriceCents = parseInt(meteredForm.unitPriceCents, 10);
    const includedQuantity = parseFloat(meteredForm.includedQuantity || '0');
    if (!Number.isFinite(unitPriceCents) || unitPriceCents < 0) {
      setMeteredError('unitPriceCents must be a non-negative integer');
      setMeteredSaving(false);
      return;
    }
    const body: Record<string, unknown> = {
      resource: meteredForm.resource,
      unitPriceCents,
      includedQuantity,
      stripeSubscriptionId: meteredForm.stripeSubscriptionId,
    };
    if (meteredForm.stripePriceId) body.stripePriceId = meteredForm.stripePriceId;
    if (meteredForm.stripeSubscriptionItemId) body.stripeSubscriptionItemId = meteredForm.stripeSubscriptionItemId;
    const res = await fetch(`/api/admin/portal/clients/${clientId}/billing/metered-items`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setMeteredSaving(false);
    if (!data.success) {
      setMeteredError(data.message ?? 'Failed');
      return;
    }
    setShowMeteredForm(false);
    setMeteredForm({
      resource: 'hosting_bandwidth_gb', unitPriceCents: '', includedQuantity: '0',
      stripeSubscriptionId: '', stripeSubscriptionItemId: '', stripePriceId: '',
    });
    await refreshBilling();
  }

  async function patchMeteredStatus(itemId: number, status: string) {
    await fetch(`/api/admin/portal/clients/${clientId}/billing/metered-items/${itemId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await refreshBilling();
  }

  async function deleteMeteredItemAdmin(itemId: number) {
    if (!confirm('Remove this metered item? Stripe Subscription Item is left untouched.')) return;
    await fetch(`/api/admin/portal/clients/${clientId}/billing/metered-items/${itemId}`, {
      method: 'DELETE',
    });
    await refreshBilling();
  }

  async function runRollupNow(force: boolean) {
    setRollupRunning(true);
    setRollupMessage('');
    const res = await fetch(`/api/admin/portal/clients/${clientId}/billing/usage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force, dryRun: !force }),
    });
    const data = await res.json();
    setRollupRunning(false);
    if (!data.success) {
      setRollupMessage(data.message ?? 'Rollup failed');
      return;
    }
    setRollupMessage(force
      ? `Pushed ${data.data.result.length} resource(s) to Stripe`
      : `Dry-run computed ${data.data.result.length} resource(s) — Stripe NOT touched`);
    await refreshBilling();
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    setMemberSaving(true); setMemberError('');
    const res = await fetch(`/api/admin/portal/clients/${clientId}/members`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(memberForm),
    });
    const data = await res.json();
    setMemberSaving(false);
    if (!data.success) { setMemberError(data.message ?? 'Failed'); return; }
    setMembers(prev => [...prev, data.data]);
    setShowAddMember(false);
    setMemberForm({ name: '', email: '', password: '' });
  }

  async function removeMember(memberId: number) {
    if (!confirm('Remove this team member?')) return;
    await fetch(`/api/admin/portal/clients/${clientId}/members/${memberId}`, { method: 'DELETE' });
    setMembers(prev => prev.filter(m => m.memberId !== memberId));
  }

  useEffect(() => {
    if (tab === 'settings' && !domainsLoaded) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- pre-existing pattern: lazy-load email domains when the settings tab opens
      setDomainsLoading(true);
      fetch('/api/admin/email/domains').then(r => r.json()).then(d => {
        setDomains(d.data ?? []);
        setDomainsLoading(false);
        setDomainsLoaded(true);
      });
    }
  }, [tab, domainsLoaded]);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSettingsSaving(true); setSettingsError(''); setSettingsSaved(false);
    const res = await fetch(`/api/admin/portal/clients/${clientId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settingsForm),
    });
    const data = await res.json();
    setSettingsSaving(false);
    if (!data.success) { setSettingsError(data.message ?? 'Failed to save'); return; }
    setClient(prev => prev ? {
      ...prev, company: settingsForm.company || null, phone: settingsForm.phone || null,
      website: settingsForm.website || null, notes: settingsForm.notes || null,
      userName: settingsForm.name, userActive: settingsForm.active,
    } : prev);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 3000);
  }

  async function loadDomains() {
    setDomainsLoading(true);
    const data = await fetch('/api/admin/email/domains').then(r => r.json());
    setDomains(data.data ?? []);
    setDomainsLoading(false);
  }

  async function openDomain(domain: Domain) {
    setSelectedDomain(domain);
    setDomainDetailLoading(true);
    const data = await fetch(`/api/admin/email/domains/${domain.id}`).then(r => r.json());
    if (data.success) setSelectedDomain(data.data);
    setDomainDetailLoading(false);
  }

  async function addDomain(e: React.FormEvent) {
    e.preventDefault();
    setAddingDomain(true); setAddDomainError('');
    const res = await fetch('/api/admin/email/domains', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newDomain }),
    });
    const data = await res.json();
    setAddingDomain(false);
    if (!data.success) { setAddDomainError(data.message ?? 'Failed'); return; }
    setNewDomain(''); setShowAddDomainForm(false);
    await loadDomains();
    openDomain(data.data);
  }

  async function verifyDomain(domainId: string) {
    setVerifying(true);
    const res = await fetch(`/api/admin/email/domains/${domainId}/verify`, { method: 'POST' });
    const data = await res.json();
    setVerifying(false);
    if (!data.success) { alert(data.message); return; }
    const updated = await fetch(`/api/admin/email/domains/${domainId}`).then(r => r.json());
    if (updated.success) {
      setSelectedDomain(updated.data);
      setDomains(prev => prev.map(d => d.id === domainId ? { ...d, status: updated.data.status } : d));
    }
  }

  async function toggleTracking(domainId: string, field: 'openTracking' | 'clickTracking', value: boolean) {
    setTrackingSaving(true);
    const res = await fetch(`/api/admin/email/domains/${domainId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    const data = await res.json();
    setTrackingSaving(false);
    if (!data.success) { alert(data.message); return; }
    setSelectedDomain(prev => prev ? { ...prev, [field]: value } : prev);
  }

  async function deleteDomain(domainId: string, name: string) {
    if (!confirm(`Remove domain "${name}" from Resend? This cannot be undone.`)) return;
    await fetch(`/api/admin/email/domains/${domainId}`, { method: 'DELETE' });
    setDomains(prev => prev.filter(d => d.id !== domainId));
    if (selectedDomain?.id === domainId) setSelectedDomain(null);
  }

  async function openList(list: EmailList) {
    setSelectedList(list);
    const data = await fetch(`/api/admin/email/lists/${list.id}`).then(r => r.json());
    setSubscribers(data.data ?? []);
  }

  async function createList(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/admin/email/lists', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...listForm, clientId }),
    });
    const data = await res.json();
    if (!data.success) return;
    setLists(prev => [{ ...data.data, subscriberCount: 0 }, ...prev]);
    setShowListForm(false); setListForm({ name: '', description: '' });
  }

  async function addSubscriber(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedList) return;
    setSubSaving(true);
    const res = await fetch('/api/admin/email/subscribers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listId: selectedList.id, ...subForm }),
    });
    const data = await res.json();
    setSubSaving(false);
    if (!data.success) return;
    setSubscribers(prev => [...prev, data.data]);
    setLists(prev => prev.map(l => l.id === selectedList.id ? { ...l, subscriberCount: l.subscriberCount + 1 } : l));
    setSubForm({ email: '', name: '' });
  }

  async function removeSubscriber(subId: number) {
    if (!confirm('Remove subscriber?')) return;
    await fetch(`/api/admin/email/subscribers?id=${subId}`, { method: 'DELETE' });
    setSubscribers(prev => prev.filter(s => s.id !== subId));
  }

  async function deleteList(listId: number) {
    if (!confirm('Delete this list and all subscribers?')) return;
    await fetch(`/api/admin/email/lists/${listId}`, { method: 'DELETE' });
    setLists(prev => prev.filter(l => l.id !== listId));
    if (selectedList?.id === listId) setSelectedList(null);
  }

  async function createCampaign(e: React.FormEvent) {
    e.preventDefault();
    setCampSaving(true); setCampError('');
    const res = await fetch('/api/admin/email/campaigns', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...campForm, clientId }),
    });
    const data = await res.json();
    setCampSaving(false);
    if (!data.success) { setCampError(data.message ?? 'Failed'); return; }
    setCampaigns(prev => [{ ...data.data, listName: lists.find(l => l.id === parseInt(campForm.listId))?.name ?? null }, ...prev]);
    setShowCampForm(false);
    setCampForm({ name: '', subject: '', fromName: '', fromEmail: '', listId: '', htmlContent: '' });
  }

  async function deleteCampaign(campId: number, status: string) {
    if (status === 'sending') { alert('Cannot delete a sending campaign.'); return; }
    if (!confirm('Delete campaign?')) return;
    await fetch(`/api/admin/email/campaigns/${campId}`, { method: 'DELETE' });
    setCampaigns(prev => prev.filter(c => c.id !== campId));
  }

  const ic = 'w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary';
  function copyToClipboard(text: string) { navigator.clipboard.writeText(text); }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!client) return <div className="p-6 text-sm text-muted-foreground">Client not found.</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link href="/admin/clients" className="text-muted-foreground hover:text-foreground">
          <span className="material-icons text-base">arrow_back</span>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">{client.company ?? client.userName}</h1>
          <p className="text-sm text-muted-foreground">{client.userEmail}</p>
        </div>
        {/* Impersonate (server-side staff check is enforced on the route). */}
        <form
          action={`/api/admin/portal/clients/${clientId}/impersonate?redirect=1`}
          method="POST"
        >
          <button
            type="submit"
            title="View the portal as this client"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-border bg-background hover:bg-accent text-sm font-medium"
          >
            <span className="material-icons text-base">visibility</span>
            Impersonate
          </button>
        </form>
      </div>

      {/* Tabs */}
      <div className="border-b border-border flex gap-1">
        {(['overview', 'email', 'billing', 'settings', 'team'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="bg-card border border-border rounded-lg divide-y divide-border">
          {[
            { label: 'Name', value: client.userName },
            { label: 'Email', value: client.userEmail },
            { label: 'Company', value: client.company ?? '—' },
            { label: 'Phone', value: client.phone ?? '—' },
            { label: 'Website', value: client.website ?? '—' },
            { label: 'Status', value: client.userActive ? 'Active' : 'Inactive' },
            { label: 'Notes', value: client.notes ?? '—' },
          ].map(row => (
            <div key={row.label} className="flex px-5 py-3 gap-4">
              <span className="text-sm text-muted-foreground w-24 shrink-0">{row.label}</span>
              <span className="text-sm text-foreground">{row.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Billing */}
      {tab === 'billing' && (
        <div className="space-y-6">
          <ClientBillingSummary clientId={clientId} />

          {!billingLoaded && (
            <div className="text-sm text-muted-foreground">Loading billing…</div>
          )}

          {/* Live totals */}
          <section className="bg-card border border-border rounded-lg">
            <header className="flex items-center justify-between px-5 py-3 border-b border-border">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Current period totals</h2>
                <p className="text-xs text-muted-foreground">
                  Period {billingUsage?.period ?? '—'} — raw observations from <code>usage_meter_events</code>.
                </p>
              </div>
            </header>
            {billingUsage && billingUsage.liveTotals.length === 0 ? (
              <div className="px-5 py-6 text-sm text-muted-foreground">No usage observed for this period.</div>
            ) : (
              <ul className="divide-y divide-border">
                {(billingUsage?.liveTotals ?? []).map(t => (
                  <li key={t.resource} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span className="font-mono text-xs text-muted-foreground">{t.resource}</span>
                    <span className="font-medium text-foreground">{t.total.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Stripe metered items */}
          <section className="bg-card border border-border rounded-lg">
            <header className="flex items-center justify-between px-5 py-3 border-b border-border">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Stripe metered items</h2>
                <p className="text-xs text-muted-foreground">Per-resource Subscription Items wired to this client.</p>
              </div>
              <button
                onClick={() => setShowMeteredForm(v => !v)}
                className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-md border border-border hover:bg-accent"
              >
                <span className="material-icons text-base">{showMeteredForm ? 'close' : 'add'}</span>
                {showMeteredForm ? 'Cancel' : 'Add metered item'}
              </button>
            </header>
            {showMeteredForm && (
              <form onSubmit={addMeteredItem} className="px-5 py-4 border-b border-border space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="text-xs text-muted-foreground">
                    Resource
                    <select
                      value={meteredForm.resource}
                      onChange={e => setMeteredForm({ ...meteredForm, resource: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    >
                      <option value="hosting_bandwidth_gb">hosting_bandwidth_gb</option>
                      <option value="hosting_invocations">hosting_invocations</option>
                      <option value="email_send">email_send</option>
                      <option value="ai_tokens">ai_tokens</option>
                    </select>
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Unit price (cents)
                    <input
                      type="number" min={0}
                      value={meteredForm.unitPriceCents}
                      onChange={e => setMeteredForm({ ...meteredForm, unitPriceCents: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      required
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Included quantity
                    <input
                      type="number" min={0} step="any"
                      value={meteredForm.includedQuantity}
                      onChange={e => setMeteredForm({ ...meteredForm, includedQuantity: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Stripe Subscription ID
                    <input
                      value={meteredForm.stripeSubscriptionId}
                      onChange={e => setMeteredForm({ ...meteredForm, stripeSubscriptionId: e.target.value })}
                      placeholder="sub_..."
                      className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
                      required
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Stripe Price ID (creates new sub item)
                    <input
                      value={meteredForm.stripePriceId}
                      onChange={e => setMeteredForm({ ...meteredForm, stripePriceId: e.target.value })}
                      placeholder="price_..."
                      className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Or existing Stripe Subscription Item ID
                    <input
                      value={meteredForm.stripeSubscriptionItemId}
                      onChange={e => setMeteredForm({ ...meteredForm, stripeSubscriptionItemId: e.target.value })}
                      placeholder="si_..."
                      className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
                    />
                  </label>
                </div>
                {meteredError && <p className="text-xs text-red-500">{meteredError}</p>}
                <div className="flex justify-end">
                  <button
                    type="submit" disabled={meteredSaving}
                    className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
                  >
                    <span className="material-icons text-base">save</span>
                    {meteredSaving ? 'Saving…' : 'Save metered item'}
                  </button>
                </div>
              </form>
            )}
            {meteredItems.length === 0 ? (
              <div className="px-5 py-6 text-sm text-muted-foreground">No metered items configured.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-5 py-2 font-medium">Resource</th>
                    <th className="text-left px-5 py-2 font-medium">Stripe Item</th>
                    <th className="text-right px-5 py-2 font-medium">Unit (¢)</th>
                    <th className="text-right px-5 py-2 font-medium">Included</th>
                    <th className="text-left px-5 py-2 font-medium">Status</th>
                    <th className="px-5 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {meteredItems.map(it => (
                    <tr key={it.id}>
                      <td className="px-5 py-2 font-mono text-xs">{it.resource}</td>
                      <td className="px-5 py-2 font-mono text-xs text-muted-foreground">{it.stripeSubscriptionItemId}</td>
                      <td className="px-5 py-2 text-right">{it.unitPriceCents}</td>
                      <td className="px-5 py-2 text-right">{parseFloat(it.includedQuantity).toLocaleString()}</td>
                      <td className="px-5 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          it.status === 'active' ? 'bg-green-100 text-green-700'
                            : it.status === 'paused' ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}>{it.status}</span>
                      </td>
                      <td className="px-5 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {it.status === 'active' ? (
                            <button onClick={() => patchMeteredStatus(it.id, 'paused')}
                              className="p-1 text-muted-foreground hover:text-foreground" title="Pause">
                              <span className="material-icons text-base">pause</span>
                            </button>
                          ) : (
                            <button onClick={() => patchMeteredStatus(it.id, 'active')}
                              className="p-1 text-muted-foreground hover:text-foreground" title="Resume">
                              <span className="material-icons text-base">play_arrow</span>
                            </button>
                          )}
                          <button onClick={() => deleteMeteredItemAdmin(it.id)}
                            className="p-1 text-muted-foreground hover:text-red-500" title="Delete">
                            <span className="material-icons text-base">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Dry-run preview + run rollup */}
          <section className="bg-card border border-border rounded-lg">
            <header className="flex items-center justify-between px-5 py-3 border-b border-border">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Rollup preview (dry run)</h2>
                <p className="text-xs text-muted-foreground">What would be pushed to Stripe right now.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => runRollupNow(false)}
                  disabled={rollupRunning}
                  className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-md border border-border hover:bg-accent disabled:opacity-50"
                >
                  <span className="material-icons text-base">refresh</span>
                  {rollupRunning ? 'Running…' : 'Re-run dry run'}
                </button>
                <button
                  onClick={() => {
                    if (confirm('Push usage to Stripe NOW for this client? This is a real billing action.')) {
                      runRollupNow(true);
                    }
                  }}
                  disabled={rollupRunning}
                  className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
                >
                  <span className="material-icons text-base">cloud_upload</span>
                  Run rollup now
                </button>
              </div>
            </header>
            {rollupMessage && (
              <div className="px-5 py-2 text-xs text-muted-foreground border-b border-border">{rollupMessage}</div>
            )}
            {(billingUsage?.dryRun ?? []).length === 0 ? (
              <div className="px-5 py-6 text-sm text-muted-foreground">
                No active metered items — nothing to roll up.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-5 py-2 font-medium">Resource</th>
                    <th className="text-right px-5 py-2 font-medium">Total</th>
                    <th className="text-right px-5 py-2 font-medium">Included</th>
                    <th className="text-right px-5 py-2 font-medium">Billable</th>
                    <th className="text-right px-5 py-2 font-medium">Billed (¢)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(billingUsage?.dryRun ?? []).map(r => (
                    <tr key={r.resource}>
                      <td className="px-5 py-2 font-mono text-xs">{r.resource}</td>
                      <td className="px-5 py-2 text-right">{r.total.toLocaleString()}</td>
                      <td className="px-5 py-2 text-right">{r.included.toLocaleString()}</td>
                      <td className="px-5 py-2 text-right">{r.billable.toLocaleString()}</td>
                      <td className="px-5 py-2 text-right">{r.billedCents.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* History */}
          <section className="bg-card border border-border rounded-lg">
            <header className="px-5 py-3 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">Recent rollups</h2>
              <p className="text-xs text-muted-foreground">Latest <code>usage_billing_periods</code> rows for this client.</p>
            </header>
            {(billingUsage?.history ?? []).length === 0 ? (
              <div className="px-5 py-6 text-sm text-muted-foreground">No rollup history yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-5 py-2 font-medium">Period</th>
                    <th className="text-left px-5 py-2 font-medium">Resource</th>
                    <th className="text-right px-5 py-2 font-medium">Billable</th>
                    <th className="text-right px-5 py-2 font-medium">Billed (¢)</th>
                    <th className="text-left px-5 py-2 font-medium">Stripe record</th>
                    <th className="text-left px-5 py-2 font-medium">Reported at</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(billingUsage?.history ?? []).map(h => (
                    <tr key={h.id}>
                      <td className="px-5 py-2 font-mono text-xs">{h.period}</td>
                      <td className="px-5 py-2 font-mono text-xs">{h.resource}</td>
                      <td className="px-5 py-2 text-right">{parseFloat(h.billableQuantity).toLocaleString()}</td>
                      <td className="px-5 py-2 text-right">{h.billedAmountCents.toLocaleString()}</td>
                      <td className="px-5 py-2 font-mono text-xs text-muted-foreground">
                        {h.stripeUsageRecordId ?? <span className="text-red-500">—</span>}
                      </td>
                      <td className="px-5 py-2 text-xs text-muted-foreground">
                        {h.reportedAt ? new Date(h.reportedAt).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}

      {/* Settings */}
      {tab === 'settings' && (
        <div className="space-y-6">
          {/* Profile editing */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Client Profile</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Update company details and account status.</p>
            </div>
            <form onSubmit={saveSettings} className="p-5 space-y-4">
              {settingsError && <p className="text-sm text-red-600">{settingsError}</p>}
              {settingsSaved && (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
                  <span className="material-icons text-base">check_circle</span>
                  Changes saved successfully.
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Full Name</label>
                  <input value={settingsForm.name} onChange={e => setSettingsForm(p => ({ ...p, name: e.target.value }))} className={ic} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Company</label>
                  <input value={settingsForm.company} onChange={e => setSettingsForm(p => ({ ...p, company: e.target.value }))} className={ic} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Phone</label>
                  <input value={settingsForm.phone} onChange={e => setSettingsForm(p => ({ ...p, phone: e.target.value }))} className={ic} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Website</label>
                  <input type="url" value={settingsForm.website} onChange={e => setSettingsForm(p => ({ ...p, website: e.target.value }))} className={ic} placeholder="https://" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-foreground mb-1">Notes</label>
                  <textarea value={settingsForm.notes} onChange={e => setSettingsForm(p => ({ ...p, notes: e.target.value }))}
                    rows={3} className={ic} />
                </div>
                <div className="sm:col-span-2 flex items-center justify-between border border-border rounded-md px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Account Active</p>
                    <p className="text-xs text-muted-foreground">Inactive clients cannot log in to the portal.</p>
                  </div>
                  <button type="button"
                    onClick={() => setSettingsForm(p => ({ ...p, active: !p.active }))}
                    className={`relative w-10 h-6 rounded-full transition-colors ${settingsForm.active ? 'bg-primary' : 'bg-border'}`}>
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settingsForm.active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={settingsSaving}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                  {settingsSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>

          {/* Sending Domains */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h2 className="font-semibold text-foreground">Sending Domains</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Manage verified domains for white-label email sending.</p>
              </div>
              <button onClick={() => setShowAddDomainForm(!showAddDomainForm)}
                className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
                <span className="material-icons text-base">add</span>
                Add Domain
              </button>
            </div>

            {showAddDomainForm && (
              <form onSubmit={addDomain} className="p-5 space-y-3 border-b border-border bg-muted/20">
                {addDomainError && <p className="text-sm text-red-600">{addDomainError}</p>}
                <p className="text-sm text-muted-foreground">
                  Enter the domain to send from (e.g. <code className="bg-muted px-1 rounded text-xs">yourdomain.com</code>). DNS records will be generated.
                </p>
                <div className="flex gap-3">
                  <input required value={newDomain} onChange={e => setNewDomain(e.target.value)}
                    placeholder="yourdomain.com" className={`${ic} flex-1`} />
                  <button type="submit" disabled={addingDomain}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                    {addingDomain ? 'Adding…' : 'Add Domain'}
                  </button>
                  <button type="button" onClick={() => setShowAddDomainForm(false)}
                    className="px-4 py-2 border border-border rounded-md text-sm text-muted-foreground hover:bg-accent">
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-5">
              {/* Domain list */}
              <div className="lg:col-span-2 border-r border-border">
                {domainsLoading ? (
                  <p className="p-6 text-sm text-muted-foreground">Loading…</p>
                ) : domains.length === 0 ? (
                  <div className="p-10 text-center">
                    <span className="material-icons text-3xl text-muted-foreground mb-2 block">domain</span>
                    <p className="text-sm text-muted-foreground">No domains added yet.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {domains.map(domain => (
                      <div key={domain.id} onClick={() => openDomain(domain)}
                        className={`flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-accent transition-colors ${selectedDomain?.id === domain.id ? 'bg-accent' : ''}`}>
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={`material-icons text-base ${domain.status === 'verified' ? 'text-green-500' : 'text-muted-foreground'}`}>
                            {domainStatusIcon[domain.status] ?? 'help_outline'}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-foreground truncate">{domain.name}</p>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${domainStatusColor[domain.status] ?? 'bg-gray-100 text-gray-600'}`}>
                              {domain.status.replace(/_/g, ' ')}
                            </span>
                          </div>
                        </div>
                        <button onClick={e => { e.stopPropagation(); deleteDomain(domain.id, domain.name); }}
                          className="p-1 rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors shrink-0 ml-2">
                          <span className="material-icons text-base">delete</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Domain detail */}
              <div className="lg:col-span-3 p-5 space-y-4">
                {!selectedDomain ? (
                  <div className="text-center py-10">
                    <span className="material-icons text-3xl text-muted-foreground mb-2 block">dns</span>
                    <p className="text-sm text-muted-foreground">Select a domain to view DNS records and settings.</p>
                  </div>
                ) : domainDetailLoading ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
                ) : (
                  <>
                    {/* Domain header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-foreground">{selectedDomain.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${domainStatusColor[selectedDomain.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {selectedDomain.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      {selectedDomain.status !== 'verified' && (
                        <button onClick={() => verifyDomain(selectedDomain.id)} disabled={verifying}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
                          <span className="material-icons text-base">{verifying ? 'hourglass_empty' : 'verified'}</span>
                          {verifying ? 'Checking…' : 'Verify Now'}
                        </button>
                      )}
                    </div>

                    {/* DNS Records */}
                    {selectedDomain.records && selectedDomain.records.length > 0 && (
                      <div className="border border-border rounded-lg overflow-hidden">
                        <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-muted/20">
                          <div>
                            <p className="text-sm font-semibold text-foreground">DNS Records</p>
                            <p className="text-xs text-muted-foreground">Add these to your domain registrar, then click Verify Now.</p>
                          </div>
                          {selectedDomain.status !== 'verified' && (
                            <div className="flex items-center gap-1.5 text-xs text-yellow-600 bg-yellow-50 px-2 py-1 rounded-md">
                              <span className="material-icons text-sm">warning</span>
                              Pending DNS
                            </div>
                          )}
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-border bg-muted/40">
                                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Type</th>
                                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Value</th>
                                <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {selectedDomain.records.map((record, i) => (
                                <tr key={i} className="hover:bg-accent/50 transition-colors">
                                  <td className="px-4 py-3">
                                    <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-foreground">{record.type}</span>
                                    <p className="text-muted-foreground mt-0.5">{record.record}</p>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-1.5">
                                      <code className="font-mono text-foreground break-all">{record.name}</code>
                                      <button onClick={() => copyToClipboard(record.name)} title="Copy"
                                        className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground">
                                        <span className="material-icons text-sm">content_copy</span>
                                      </button>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 max-w-xs">
                                    <div className="flex items-center gap-1.5">
                                      <code className="font-mono text-foreground break-all line-clamp-2">{record.value}</code>
                                      <button onClick={() => copyToClipboard(record.value)} title="Copy"
                                        className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground">
                                        <span className="material-icons text-sm">content_copy</span>
                                      </button>
                                    </div>
                                    {record.priority !== undefined && <p className="text-muted-foreground mt-0.5">Priority: {record.priority}</p>}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <span className={`material-icons text-base ${recordStatusColor[record.status] ?? 'text-muted-foreground'}`} title={record.status}>
                                      {record.status === 'verified' ? 'check_circle' : record.status === 'failed' ? 'cancel' : 'radio_button_unchecked'}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="px-4 py-2.5 text-xs text-muted-foreground bg-muted/20 border-t border-border">
                          DNS changes can take up to 72 hours to propagate.
                        </p>
                      </div>
                    )}

                    {/* Tracking settings */}
                    {selectedDomain.status === 'verified' && (
                      <div className="border border-border rounded-lg overflow-hidden">
                        <div className="px-4 py-3 border-b border-border bg-muted/20">
                          <p className="text-sm font-semibold text-foreground">Tracking Settings</p>
                        </div>
                        <div className="divide-y divide-border">
                          {[
                            { key: 'openTracking' as const, label: 'Open Tracking', description: 'Track opens via a 1×1 pixel.' },
                            { key: 'clickTracking' as const, label: 'Click Tracking', description: 'Wrap links to track clicks.' },
                          ].map(({ key, label, description }) => (
                            <div key={key} className="flex items-center justify-between px-4 py-3">
                              <div>
                                <p className="text-sm font-medium text-foreground">{label}</p>
                                <p className="text-xs text-muted-foreground">{description}</p>
                              </div>
                              <button onClick={() => toggleTracking(selectedDomain.id, key, !selectedDomain[key])}
                                disabled={trackingSaving}
                                className={`relative w-10 h-6 rounded-full transition-colors disabled:opacity-50 ${selectedDomain[key] ? 'bg-primary' : 'bg-border'}`}>
                                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${selectedDomain[key] ? 'translate-x-4' : 'translate-x-0.5'}`} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Next steps for unverified */}
                    {selectedDomain.status !== 'verified' && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                        <div className="flex items-center gap-2 text-blue-800">
                          <span className="material-icons text-base">info</span>
                          <p className="text-sm font-medium">Next steps</p>
                        </div>
                        <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
                          <li>Copy each DNS record above and add it to your domain registrar</li>
                          <li>Wait for DNS to propagate — usually a few minutes, up to 72 hours</li>
                          <li>Click <strong>Verify Now</strong> to check if the records are live</li>
                        </ol>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Team */}
      {tab === 'team' && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div>
              <h2 className="font-semibold text-foreground">Team Members</h2>
              <p className="text-xs text-muted-foreground mt-0.5">All users with access to this client account.</p>
            </div>
            <button onClick={() => setShowAddMember(!showAddMember)}
              className="flex items-center gap-1 text-sm text-primary hover:underline">
              <span className="material-icons text-sm">person_add</span> Add Member
            </button>
          </div>

          {showAddMember && (
            <form onSubmit={addMember} className="p-5 space-y-4 border-b border-border bg-muted/20">
              {memberError && <p className="text-sm text-red-600">{memberError}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Full Name *</label>
                  <input required value={memberForm.name} onChange={e => setMemberForm(p => ({ ...p, name: e.target.value }))} className={ic} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Email *</label>
                  <input required type="email" value={memberForm.email} onChange={e => setMemberForm(p => ({ ...p, email: e.target.value }))} className={ic} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Password *</label>
                  <input required type="password" value={memberForm.password} onChange={e => setMemberForm(p => ({ ...p, password: e.target.value }))} className={ic} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">If the email already exists in the system, the existing user will be added to this client.</p>
              <div className="flex gap-2">
                <button type="submit" disabled={memberSaving}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                  {memberSaving ? 'Adding…' : 'Add Member'}
                </button>
                <button type="button" onClick={() => setShowAddMember(false)}
                  className="px-4 py-2 border border-border rounded-md text-sm text-muted-foreground hover:bg-accent">Cancel</button>
              </div>
            </form>
          )}

          {!teamLoaded ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : members.length === 0 ? (
            <p className="p-8 text-sm text-muted-foreground text-center">No team members yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {members.map(m => (
                <div key={m.memberId} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.role === 'owner' ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-600'}`}>
                      {m.role}
                    </span>
                    {!m.active && <span className="text-xs text-muted-foreground">inactive</span>}
                    {m.role !== 'owner' && (
                      <button onClick={() => removeMember(m.memberId)}
                        className="p-1 text-muted-foreground hover:text-red-500 transition-colors">
                        <span className="material-icons text-base">person_remove</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Email Marketing */}
      {tab === 'email' && (
        <div className="space-y-6">
          {/* Lists + Subscribers */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Subscriber Lists</h2>
              <button onClick={() => setShowListForm(!showListForm)}
                className="flex items-center gap-1 text-sm text-primary hover:underline">
                <span className="material-icons text-sm">add</span> New List
              </button>
            </div>

            {showListForm && (
              <form onSubmit={createList} className="flex gap-3 p-4 border-b border-border">
                <input required value={listForm.name} onChange={e => setListForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="List name" className={ic} />
                <input value={listForm.description} onChange={e => setListForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Description (optional)" className={ic} />
                <button type="submit" className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90">Create</button>
                <button type="button" onClick={() => setShowListForm(false)} className="px-3 py-2 border border-border rounded-md text-sm text-muted-foreground hover:bg-accent">Cancel</button>
              </form>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">
              {/* List column */}
              <div className="divide-y divide-border">
                {!emailLoaded ? (
                  <p className="p-6 text-sm text-muted-foreground">Loading…</p>
                ) : lists.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">No lists yet.</p>
                ) : lists.map(list => (
                  <div key={list.id} onClick={() => openList(list)}
                    className={`flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-accent transition-colors ${selectedList?.id === list.id ? 'bg-accent' : ''}`}>
                    <div>
                      <p className="text-sm font-medium text-foreground">{list.name}</p>
                      <p className="text-xs text-muted-foreground">{list.subscriberCount} subscriber{list.subscriberCount !== 1 ? 's' : ''}</p>
                    </div>
                    <button onClick={e => { e.stopPropagation(); deleteList(list.id); }}
                      className="p-1 text-muted-foreground hover:text-red-500 transition-colors">
                      <span className="material-icons text-base">delete</span>
                    </button>
                  </div>
                ))}
              </div>

              {/* Subscribers column */}
              <div>
                {!selectedList ? (
                  <p className="p-6 text-sm text-muted-foreground">Select a list to manage subscribers.</p>
                ) : (
                  <>
                    <form onSubmit={addSubscriber} className="flex gap-2 p-4 border-b border-border">
                      <input required type="email" value={subForm.email} onChange={e => setSubForm(p => ({ ...p, email: e.target.value }))}
                        placeholder="Email" className={`${ic} flex-1`} />
                      <input value={subForm.name} onChange={e => setSubForm(p => ({ ...p, name: e.target.value }))}
                        placeholder="Name" className={`${ic} w-28`} />
                      <button type="submit" disabled={subSaving} className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 disabled:opacity-50">
                        <span className="material-icons text-base">add</span>
                      </button>
                    </form>
                    <div className="divide-y divide-border max-h-64 overflow-y-auto">
                      {subscribers.length === 0 ? (
                        <p className="p-4 text-sm text-muted-foreground">No subscribers yet.</p>
                      ) : subscribers.map(s => (
                        <div key={s.id} className="flex items-center justify-between px-4 py-2.5">
                          <div>
                            <p className="text-sm text-foreground">{s.email}</p>
                            {s.name && <p className="text-xs text-muted-foreground">{s.name}</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${s.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{s.status}</span>
                            <button onClick={() => removeSubscriber(s.id)} className="p-0.5 text-muted-foreground hover:text-red-500">
                              <span className="material-icons text-sm">close</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Campaigns */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Campaigns</h2>
              <button onClick={() => setShowCampForm(!showCampForm)}
                className="flex items-center gap-1 text-sm text-primary hover:underline">
                <span className="material-icons text-sm">add</span> New Campaign
              </button>
            </div>

            {showCampForm && (
              <form onSubmit={createCampaign} className="p-5 space-y-4 border-b border-border">
                {campError && <p className="text-sm text-red-600">{campError}</p>}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className="block text-xs font-medium text-foreground mb-1">Internal Name *</label>
                    <input required value={campForm.name} onChange={e => setCampForm(p => ({ ...p, name: e.target.value }))} className={ic} /></div>
                  <div><label className="block text-xs font-medium text-foreground mb-1">Subject *</label>
                    <input required value={campForm.subject} onChange={e => setCampForm(p => ({ ...p, subject: e.target.value }))} className={ic} /></div>
                  <div><label className="block text-xs font-medium text-foreground mb-1">From Name *</label>
                    <input required value={campForm.fromName} onChange={e => setCampForm(p => ({ ...p, fromName: e.target.value }))} className={ic} /></div>
                  <div><label className="block text-xs font-medium text-foreground mb-1">From Email *</label>
                    <input required type="email" value={campForm.fromEmail} onChange={e => setCampForm(p => ({ ...p, fromEmail: e.target.value }))} className={ic} /></div>
                  <div><label className="block text-xs font-medium text-foreground mb-1">List *</label>
                    <select required value={campForm.listId} onChange={e => setCampForm(p => ({ ...p, listId: e.target.value }))} className={ic}>
                      <option value="">Select a list…</option>
                      {lists.map(l => <option key={l.id} value={l.id}>{l.name} ({l.subscriberCount})</option>)}
                    </select></div>
                  <div className="sm:col-span-2"><label className="block text-xs font-medium text-foreground mb-1">HTML Content *</label>
                    <textarea required value={campForm.htmlContent} onChange={e => setCampForm(p => ({ ...p, htmlContent: e.target.value }))}
                      rows={6} className={`${ic} font-mono text-xs`} placeholder="<h1>Hello</h1><p>Your message here...</p>" /></div>
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={campSaving} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                    {campSaving ? 'Saving…' : 'Create Campaign'}
                  </button>
                  <button type="button" onClick={() => setShowCampForm(false)} className="px-4 py-2 border border-border rounded-md text-sm text-muted-foreground hover:bg-accent">Cancel</button>
                </div>
              </form>
            )}

            {!emailLoaded ? (
              <p className="p-6 text-sm text-muted-foreground">Loading…</p>
            ) : campaigns.length === 0 ? (
              <p className="p-8 text-sm text-muted-foreground text-center">No campaigns yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-5 py-2.5 font-medium text-muted-foreground">Campaign</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">List</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Open Rate</th>
                  <th className="px-4 py-2.5"></th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {campaigns.map(c => (
                    <tr key={c.id} className="hover:bg-accent transition-colors">
                      <td className="px-5 py-3">
                        <Link href={`/admin/email/campaigns/${c.id}`} className="font-medium text-foreground hover:text-primary">{c.name}</Link>
                        <p className="text-xs text-muted-foreground truncate max-w-xs">{c.subject}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{c.listName ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${campaignStatusColor[c.status] ?? 'bg-gray-100 text-gray-700'}`}>{c.status}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground hidden md:table-cell">
                        {c.status === 'sent' && c.totalSent > 0 ? `${Math.round(c.totalOpened / c.totalSent * 100)}%` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/admin/email/campaigns/${c.id}`} className="p-1 text-muted-foreground hover:text-foreground">
                            <span className="material-icons text-base">open_in_new</span>
                          </Link>
                          <button onClick={() => deleteCampaign(c.id, c.status)} className="p-1 text-muted-foreground hover:text-red-500">
                            <span className="material-icons text-base">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
