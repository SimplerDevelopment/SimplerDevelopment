'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import CrmCustomFieldsPanel, { type CrmCustomFieldsPanelHandle } from '@/components/portal/CrmCustomFieldsPanel';
import { formatMoney } from '@/lib/utils/money';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import CrmAddDealModal from '@/components/portal/CrmAddDealModal';
import { pBtnPrimary, pBtnGhost, pCard, pSectionTitle, sBtn, sBtnGhost } from '@/components/portal/portal-ui';
import { useFeatureFlag } from '@/components/portal/FeatureFlagsProvider';
import { GhostCard } from '@/components/portal/EmptyState';
import ContactEmailsTab from './_components/ContactEmailsTab';
import ContactNotesCard from './_components/ContactNotesCard';
import ContactEditModal from './_components/ContactEditModal';
import ContactActivityPanel, { type Activity } from './_components/ContactActivityPanel';
import ContactEmailForm from './_components/ContactEmailForm';
import ContactTagsCard, { type Tag } from './_components/ContactTagsCard';

interface Contact {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  title: string | null;
  companyId: number | null;
  companyName: string | null;
  status: string;
  source: string | null;
  address: string | null;
  notes: string | null;
  tags: Tag[];
  score: number;
  ownerId: number | null;
  lastContactedAt: string | null;
  createdAt: string;
  avatarUrl: string | null;
}

// First letter of first + last name, uppercased, for the avatar fallback
// circle. Matches the initials pattern used on brain/people/[id].
function contactInitials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase() || '?';
}

interface Deal {
  id: number;
  title: string;
  value: number;
  stageName: string;
  status: string;
}

const statusColor: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-500',
  lead: 'bg-blue-100 text-blue-700',
  customer: 'bg-purple-100 text-purple-700',
};

const dealStatusColor: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700',
  won: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-700',
};

// PUX-170 (design doc screen 29): six rooms for one person. 'general' and 'custom-fields'
// keep their keys so the flag-off strip and the always-mounted fields panel are untouched.
const STUDIO_TABS = [
  { key: 'general', label: 'Activity', icon: 'timeline' },
  { key: 'deals', label: 'Deals', icon: 'handshake' },
  { key: 'bookings', label: 'Bookings', icon: 'event' },
  { key: 'emails', label: 'Emails', icon: 'mail' },
  { key: 'notes', label: 'Notes', icon: 'psychology' },
  { key: 'custom-fields', label: 'Fields', icon: 'tune' },
] as const;
type TabKey = (typeof STUDIO_TABS)[number]['key'];

export default function CrmContactDetailPage() {
  const params = useParams();
  const studio = useFeatureFlag('portal-redesign');
  const router = useRouter();
  const contactId = params.id as string;

  const [contact, setContact] = useState<Contact | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const customFieldsRef = useRef<CrmCustomFieldsPanelHandle>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('general');

  const [showEmailForm, setShowEmailForm] = useState(false);

  const [showDealForm, setShowDealForm] = useState(false);

  const fetchContact = useCallback(async () => {
    const res = await fetch(`/api/portal/crm/contacts/${contactId}`);
    const d = await res.json();
    if (d.success && d.data) {
      setContact(d.data.contact ?? d.data);
      setDeals(d.data.deals ?? []);
    }
  }, [contactId]);

  const fetchActivities = useCallback(async () => {
    const res = await fetch(`/api/portal/crm/activities?contactId=${contactId}`);
    const d = await res.json();
    setActivities(Array.isArray(d.data?.activities) ? d.data.activities : []); // data is { activities, total, page, limit }
  }, [contactId]);

  useEffect(() => {
    (async () => {
      await Promise.all([fetchContact(), fetchActivities()]);
      setLoading(false);
    })();
  }, [fetchContact, fetchActivities]);

  // Fires after the edit modal saves both the contact fields and its own
  // (separate) custom-fields instance. Refreshes the page-level data —
  // including the page-level custom fields panel, which stays in 'view'
  // mode at all times now that editing only happens in the modal.
  async function handleContactSaved() {
    setIsEditModalOpen(false);
    await fetchContact();
    customFieldsRef.current?.reload();
  }

  async function deleteContact() {
    if (!confirm('Are you sure you want to delete this contact?')) return;
    await fetch(`/api/portal/crm/contacts/${contactId}`, { method: 'DELETE' });
    router.push('/portal/crm/contacts');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="text-center py-20">
        <span className="material-icons text-4xl text-muted-foreground">person_off</span>
        <p className="mt-2 text-muted-foreground">Contact not found.</p>
        <Link href="/portal/crm/contacts" className="text-primary text-sm hover:underline mt-2 inline-block">
          Back to contacts
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link href="/portal/crm/contacts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-1">
        <span className="material-icons text-base">arrow_back</span>
        Contacts
      </Link>

      {/* Page Header */}
      <PortalPageHeader
        eyebrow="CRM"
        title={
          <span className="flex items-center gap-3">
            {contact.avatarUrl ? (
              <img
                src={contact.avatarUrl}
                alt=""
                className="shrink-0 w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <span className="shrink-0 w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-base font-bold">
                {contactInitials(contact.firstName, contact.lastName)}
              </span>
            )}
            <span>{contact.firstName} {contact.lastName}</span>
          </span>
        }
        subtitle={
          contact.title || contact.companyName ? (
            <>
              {contact.title}
              {contact.title && contact.companyName ? ' at ' : contact.companyName ? 'at ' : ''}
              {contact.companyName && (
                contact.companyId ? (
                  <Link href={`/portal/crm/companies/${contact.companyId}`} className="text-primary hover:underline">
                    {contact.companyName}
                  </Link>
                ) : (
                  <>{contact.companyName}</>
                )
              )}
            </>
          ) : undefined
        }
        actions={
          <div className="flex gap-2">
            {contact.email && (
              <button onClick={() => setShowEmailForm(true)} className={studio ? sBtn : pBtnPrimary}>
                <span className="material-icons text-base">mail</span>
                Send Email
              </button>
            )}
            <button onClick={() => setIsEditModalOpen(true)} className={studio ? sBtnGhost : pBtnGhost}>
              <span className="material-icons text-base">edit</span>
              Edit
            </button>
            <button
              onClick={deleteContact}
              className={studio ? `${sBtnGhost} text-destructive` : "inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-destructive transition hover:border-destructive/40 hover:shadow-sm"}
            >
              <span className="material-icons text-base">delete</span>
              Delete
            </button>
          </div>
        }
      />

      {/* Edit modal (PUX-025) — sectioned into General / Details / Custom Fields tabs. */}
      {isEditModalOpen && (
        <ContactEditModal
          contactId={contact.id}
          contact={contact}
          onClose={() => setIsEditModalOpen(false)}
          onSaved={handleContactSaved}
        />
      )}

      {/* Status + score chips */}
      <div className="flex items-center gap-2 -mt-3">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[contact.status] ?? 'bg-gray-100 text-gray-700'}`}>
          {contact.status}
        </span>
        {contact.score > 0 && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${
            contact.score >= 80 ? 'bg-green-100 text-green-700' :
            contact.score >= 50 ? 'bg-blue-100 text-blue-700' :
            contact.score >= 20 ? 'bg-yellow-100 text-yellow-700' :
            'bg-gray-100 text-gray-500'
          }`}>
            <span className="material-icons text-xs">star</span>
            {contact.score}
          </span>
        )}
      </div>

      {/* Tabs: General / Deals / Custom Fields */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex border-b border-border overflow-x-auto">
          {studio && STUDIO_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                activeTab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="material-icons text-base">{t.icon}</span>
              {t.key === 'deals' ? `Deals (${deals.length})` : t.label}
            </button>
          ))}
          {!studio && <>
          <button
            onClick={() => setActiveTab('general')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'general'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="material-icons text-base">person</span>
            General
          </button>
          <button
            onClick={() => setActiveTab('deals')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'deals'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="material-icons text-base">handshake</span>
            Deals ({deals.length})
          </button>
          <button
            onClick={() => setActiveTab('custom-fields')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'custom-fields'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="material-icons text-base">tune</span>
            Custom Fields
          </button>
          </>}
        </div>

        <div className="p-6">
        {activeTab === 'general' && (
        <div className="space-y-6">
      <ContactEmailForm
        contactId={contactId}
        contactEmail={contact.email ?? ''}
        open={showEmailForm}
        onClose={() => setShowEmailForm(false)}
        onSent={fetchActivities}
      />

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left Column (studio: details sit to the right of the timeline) */}
        <div className={studio ? 'space-y-6 lg:order-2' : 'space-y-6'}>
          {/* Contact Info */}
          <div className={`${pCard} p-6 space-y-4`}>
            <h2 className={pSectionTitle}>Contact Information</h2>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="material-icons text-base text-muted-foreground">mail</span>
                <span className="text-sm text-foreground">{contact.email ?? 'No email'}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="material-icons text-base text-muted-foreground">phone</span>
                <span className="text-sm text-foreground">{contact.phone ?? 'No phone'}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="material-icons text-base text-muted-foreground">link</span>
                {contact.linkedinUrl ? (
                  <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline truncate">
                    {contact.linkedinUrl.replace(/^https?:\/\/(www\.)?/i, '')}
                  </a>
                ) : (
                  <span className="text-sm text-foreground">No LinkedIn</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="material-icons text-base text-muted-foreground">location_on</span>
                <span className="text-sm text-foreground">{contact.address ?? 'No address'}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="material-icons text-base text-muted-foreground">source</span>
                <span className="text-sm text-foreground capitalize">{contact.source ?? 'Unknown source'}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="material-icons text-base text-muted-foreground">calendar_today</span>
                <span className="text-sm text-muted-foreground">Added {new Date(contact.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          <ContactTagsCard contactId={contactId} tags={contact.tags ?? []} onChanged={fetchContact} />
          {studio && <ContactNotesCard contactId={contactId} firstName={contact.firstName} mode="card" />}
        </div>

        {/* Right Column */}
        <ContactActivityPanel contactId={contactId} activities={activities} onLogged={fetchActivities} />
      </div>
        </div>
        )}

        {activeTab === 'deals' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className={pSectionTitle}>Deals</h2>
              <div className="flex items-center gap-3">
                <Link href="/portal/crm/deals" className="text-xs text-primary hover:underline">View pipeline</Link>
                <button onClick={() => setShowDealForm(true)} className={pBtnPrimary}><span className="material-icons text-base">add</span>Add Deal</button>
              </div>
            </div>
            {showDealForm && (
              <CrmAddDealModal contactId={Number(contactId)} companyId={contact.companyId ?? undefined} onClose={() => setShowDealForm(false)} onCreated={() => { setShowDealForm(false); fetchContact(); }} />
            )}
            {deals.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No deals associated with this contact.</p>
            ) : (
              <div className="divide-y divide-border">
                {deals.map(d => (
                  <div key={d.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{d.title}</p>
                      <p className="text-xs text-muted-foreground">{d.stageName}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-foreground">{formatMoney(d.value)}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${dealStatusColor[d.status] ?? 'bg-gray-100 text-gray-700'}`}>
                        {d.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {studio && activeTab === 'bookings' && (
          // No bookings↔contact link exists (bookings carry guestEmail, no contactId) — say so instead of a blank tab.
          <GhostCard icon="event" title="Bookings aren't linked to contacts yet" body="A booking carries a guest email, not a contact. This tab fills in once bookings link to CRM contacts." />
        )}
        {studio && activeTab === 'emails' && <ContactEmailsTab contactId={contactId} />}
        {studio && activeTab === 'notes' && <ContactNotesCard contactId={contactId} firstName={contact.firstName} mode="tab" />}

        {/* Always mounted so customFieldsRef.current stays live for the reload
            call after the edit modal saves, even while this tab is hidden.
            Always 'view' mode — editing happens exclusively in the edit
            modal's own separate CrmCustomFieldsPanel instance now. */}
        <div className={activeTab === 'custom-fields' ? '' : 'hidden'}>
          <CrmCustomFieldsPanel ref={customFieldsRef} entityType="contact" entityId={Number(contactId)} externalMode="view" />
        </div>
        </div>
      </div>
    </div>
  );
}
