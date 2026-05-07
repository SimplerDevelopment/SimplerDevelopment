/**
 * Booking-page editor.
 *
 * Renders the multi-tab editor for a single booking page (Calendly-style
 * scheduling resource). All field state and I/O lives in `useBookingPage`;
 * each tab is a presentational panel under `_components/`. Keep this file
 * thin — its only job is to orchestrate routing, the tab switcher, and the
 * panel composition.
 */
'use client';

import { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import ProductAutomationSettings from '@/components/portal/ProductAutomationSettings';

import { useBookingPage } from './_hooks/useBookingPage';
import { TABS, BOOKING_AUTOMATION_PRESETS } from './_lib/constants';
import type { Tab } from './_lib/types';
import { BookingHeader } from './_components/BookingHeader';
import { SettingsPanel } from './_components/SettingsPanel';
import { StylingPanel } from './_components/StylingPanel';
import { AvailabilityPanel } from './_components/AvailabilityPanel';
import { QuestionsPanel } from './_components/QuestionsPanel';
import { EmbedPanel } from './_components/EmbedPanel';
import { BookingsPanel } from './_components/BookingsPanel';
import { StaffPanel } from './_components/StaffPanel';

export default function EditBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const state = useBookingPage(id);

  const [activeTab, setActiveTab] = useState<Tab>('settings');
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  if (state.loading) {
    return (
      <div className="max-w-4xl mx-auto flex items-center justify-center py-20">
        <span className="material-icons animate-spin text-3xl text-muted-foreground">
          autorenew
        </span>
      </div>
    );
  }

  if (!state.page) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20 space-y-4">
        <span className="material-icons text-5xl text-muted-foreground/50">error_outline</span>
        <p className="text-muted-foreground">Booking page not found</p>
        <Link
          href="/portal/tools/booking"
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <span className="material-icons text-lg">arrow_back</span>
          Back to Booking Pages
        </Link>
      </div>
    );
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const publicUrl = `${origin}/book/${state.page.slug}`;
  const iframeCode = `<iframe src="${publicUrl}" style="width:100%;height:700px;border:none;border-radius:12px;" title="${state.title}"></iframe>`;

  async function handleDelete() {
    const ok = await state.remove();
    if (ok) router.push('/portal/tools/booking');
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <BookingHeader
        title={state.page.title}
        slug={state.page.slug}
        publicUrl={publicUrl}
        saving={state.saving}
        saved={state.saved}
        onSave={state.save}
      />

      {state.error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
          <span className="material-icons">error</span>
          {state.error}
          <button onClick={() => state.setError('')} className="ml-auto">
            <span className="material-icons text-lg">close</span>
          </button>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex gap-1 bg-card border border-border rounded-xl p-1 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <span className="material-icons text-lg">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'settings' && (
        <SettingsPanel
          title={state.title}
          setTitle={state.setTitle}
          description={state.description}
          setDescription={state.setDescription}
          duration={state.duration}
          setDuration={state.setDuration}
          bufferBefore={state.bufferBefore}
          setBufferBefore={state.setBufferBefore}
          bufferAfter={state.bufferAfter}
          setBufferAfter={state.setBufferAfter}
          maxAdvanceDays={state.maxAdvanceDays}
          setMaxAdvanceDays={state.setMaxAdvanceDays}
          minNoticeMins={state.minNoticeMins}
          setMinNoticeMins={state.setMinNoticeMins}
          timezone={state.timezone}
          setTimezone={state.setTimezone}
          active={state.active}
          setActive={state.setActive}
          conferenceType={state.conferenceType}
          setConferenceType={state.setConferenceType}
          thumbnail={state.thumbnail}
          setThumbnail={state.setThumbnail}
          deleteConfirm={deleteConfirm}
          setDeleteConfirm={setDeleteConfirm}
          onDelete={handleDelete}
        />
      )}

      {activeTab === 'styling' && (
        <StylingPanel
          color={state.color}
          setColor={state.setColor}
          brandingProfileId={state.brandingProfileId}
          setBrandingProfileId={state.setBrandingProfileId}
          brandingProfiles={state.brandingProfiles}
          styling={state.styling}
          setStyling={state.setStyling}
        />
      )}

      {activeTab === 'availability' && (
        <AvailabilityPanel
          availability={state.availability}
          setAvailability={state.setAvailability}
        />
      )}

      {activeTab === 'questions' && (
        <QuestionsPanel questions={state.questions} setQuestions={state.setQuestions} />
      )}

      {activeTab === 'embed' && <EmbedPanel publicUrl={publicUrl} iframeCode={iframeCode} />}

      {activeTab === 'bookings' && (
        <BookingsPanel
          bookingsList={state.bookingsList}
          pageMembers={state.pageMembers}
          onCancel={state.cancelBooking}
          onReassign={state.reassignBooking}
        />
      )}

      {activeTab === 'staff' && (
        <StaffPanel
          allowStaffSelection={state.allowStaffSelection}
          setAllowStaffSelection={state.setAllowStaffSelection}
          pageMembers={state.pageMembers}
          teamMembers={state.teamMembers}
          staffLoading={state.staffLoading}
          pageId={id}
          refreshMembers={state.refreshMembers}
          bookingType={state.bookingType}
          setBookingType={state.setBookingType}
          groupCapacity={state.groupCapacity}
          setGroupCapacity={state.setGroupCapacity}
          assignmentMode={state.assignmentMode}
          setAssignmentMode={state.setAssignmentMode}
          roundRobinPool={state.roundRobinPool}
          setRoundRobinPool={state.setRoundRobinPool}
        />
      )}

      {activeTab === 'automations' && (
        <ProductAutomationSettings
          productScope="booking"
          presets={BOOKING_AUTOMATION_PRESETS}
          title="Booking Automations"
          description="Toggle standard automations for this booking page"
        />
      )}
    </div>
  );
}
