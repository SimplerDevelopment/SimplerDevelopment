'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { use } from 'react';
import ProductAutomationSettings from '@/components/portal/ProductAutomationSettings';
import type { AutomationPreset } from '@/components/portal/ProductAutomationSettings';
import { GoogleFontPicker } from '@/components/blocks/visual/GoogleFontPicker';
import MediaPicker from '@/components/admin/MediaPicker';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AvailabilitySlot {
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startTime: string;
  endTime: string;
  enabled: boolean;
}

interface BookingQuestion {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  required: boolean;
  options?: string[];
}

interface BookingPageData {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  duration: number;
  bufferBefore: number;
  bufferAfter: number;
  maxAdvanceDays: number;
  minNoticeMins: number;
  timezone: string;
  availability: AvailabilitySlot[];
  questions: BookingQuestion[];
  color: string;
  brandingProfileId: number | null;
  active: boolean;
  googleCalendarSync: boolean;
  conferenceType: string;
  allowStaffSelection: boolean;
  assignedMembers: number[];
  createdAt: string;
  updatedAt: string;
}

interface Booking {
  id: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  startTime: string;
  endTime: string;
  timezone: string;
  status: string;
  assignedTo: number | null;
  answers: Record<string, string> | null;
  notes: string | null;
  createdAt: string;
}

interface PageMember {
  id: number;
  userId: number;
  displayName: string | null;
  color: string | null;
  availability: AvailabilitySlot[] | null;
  active: boolean;
  userName: string;
  userEmail: string;
}

interface TeamMember {
  userId: number;
  role: string;
  name: string;
  email: string;
}

type Tab = 'settings' | 'styling' | 'availability' | 'questions' | 'embed' | 'bookings' | 'staff' | 'automations';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const tabs: { key: Tab; label: string; icon: string }[] = [
  { key: 'settings', label: 'Settings', icon: 'settings' },
  { key: 'styling', label: 'Styling', icon: 'palette' },
  { key: 'availability', label: 'Availability', icon: 'schedule' },
  { key: 'questions', label: 'Questions', icon: 'quiz' },
  { key: 'embed', label: 'Embed', icon: 'code' },
  { key: 'bookings', label: 'Bookings', icon: 'event' },
  { key: 'staff', label: 'Staff', icon: 'group' },
  { key: 'automations', label: 'Automations', icon: 'bolt' },
];

const BOOKING_AUTOMATION_PRESETS: AutomationPreset[] = [
  {
    key: 'confirmation_email',
    name: 'Confirmation Email',
    description: 'Automatically send a confirmation email when someone books an appointment',
    icon: 'mark_email_read',
    trigger: { event: 'booking.created' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Booking confirmation for {{event.guestName}}', body: 'Booking confirmed for {{event.guestName}} ({{event.guestEmail}}) on {{event.date}} at {{event.time}}' } }],
  },
  {
    key: 'reminder',
    name: 'Appointment Reminder',
    description: 'Send a reminder before the scheduled appointment',
    icon: 'alarm',
    trigger: { event: 'booking.confirmed' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Reminder: Upcoming booking with {{event.guestName}}', body: 'You have an upcoming appointment with {{event.guestName}} ({{event.guestEmail}})' }, delay: 86400 }],
    settings: [
      {
        key: 'reminderTiming',
        label: 'Send reminder',
        type: 'select',
        options: [
          { value: '3600', label: '1 hour before' },
          { value: '7200', label: '2 hours before' },
          { value: '86400', label: '1 day before' },
          { value: '172800', label: '2 days before' },
        ],
        defaultValue: '86400',
        mapsTo: { actionIndex: 0, paramKey: 'delay' },
      },
    ],
  },
  {
    key: 'follow_up',
    name: 'Post-Appointment Follow-up',
    description: 'Send a follow-up message after the appointment is completed',
    icon: 'follow_the_signs',
    trigger: { event: 'booking.confirmed' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Follow-up: How was your appointment?', body: 'Thank you for your appointment, {{event.guestName}}. We hope everything went well!' }, delay: 86400 }],
    settings: [
      {
        key: 'followUpDelay',
        label: 'Send after',
        type: 'select',
        options: [
          { value: '3600', label: '1 hour' },
          { value: '86400', label: '1 day' },
          { value: '172800', label: '2 days' },
          { value: '604800', label: '1 week' },
        ],
        defaultValue: '86400',
        mapsTo: { actionIndex: 0, paramKey: 'delay' },
      },
    ],
  },
  {
    key: 'create_crm_contact',
    name: 'Add to CRM',
    description: 'Automatically create a CRM contact when someone books for the first time',
    icon: 'person_add',
    trigger: { event: 'booking.created' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'New booking contact: {{event.guestName}}', body: 'New contact from booking: {{event.guestName}} - {{event.guestEmail}}' } }],
  },
  {
    key: 'team_notification',
    name: 'Notify Team',
    description: 'Create a task for your team when a new booking is made',
    icon: 'group',
    trigger: { event: 'booking.created' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'New booking: {{event.guestName}} on {{event.date}}', body: 'A new booking has been made by {{event.guestName}} ({{event.guestEmail}}). Please prepare accordingly.' } }],
  },
];

const durationOptions = [15, 30, 45, 60, 90, 120];

// ─── Component ───────────────────────────────────────────────────────────────

export default function EditBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [page, setPage] = useState<BookingPageData | null>(null);
  const [bookingsList, setBookingsList] = useState<Booking[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('settings');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Form state (mirrors page fields)
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(30);
  const [color, setColor] = useState('#2563eb');
  const [brandingProfileId, setBrandingProfileId] = useState<number | null>(null);
  const [brandingProfiles, setBrandingProfiles] = useState<Array<{ id: number; name: string; isDefault: boolean; primaryColor: string | null; logoUrl: string | null }>>([]);
  const [bufferBefore, setBufferBefore] = useState(0);
  const [bufferAfter, setBufferAfter] = useState(15);
  const [maxAdvanceDays, setMaxAdvanceDays] = useState(60);
  const [minNoticeMins, setMinNoticeMins] = useState(60);
  const [timezone, setTimezone] = useState('America/New_York');
  const [active, setActive] = useState(true);
  const [conferenceType, setConferenceType] = useState('none');
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [questions, setQuestions] = useState<BookingQuestion[]>([]);
  const [styling, setStyling] = useState<Record<string, string | boolean | undefined>>({});
  const [thumbnail, setThumbnail] = useState('');
  const [allowStaffSelection, setAllowStaffSelection] = useState(false);

  // Staff management state
  const [pageMembers, setPageMembers] = useState<PageMember[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [addMemberUserId, setAddMemberUserId] = useState<number | ''>('');
  const [addMemberName, setAddMemberName] = useState('');
  const [addMemberColor, setAddMemberColor] = useState('#2563eb');


  const fetchPage = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/tools/booking/${id}`);
      const data = await res.json();
      if (data.success) {
        const p = data.data as BookingPageData;
        setPage(p);
        setTitle(p.title);
        setDescription(p.description || '');
        setDuration(p.duration);
        setColor(p.color || '#2563eb');
        setBrandingProfileId(p.brandingProfileId || null);
        setBufferBefore(p.bufferBefore);
        setBufferAfter(p.bufferAfter);
        setMaxAdvanceDays(p.maxAdvanceDays);
        setMinNoticeMins(p.minNoticeMins);
        setTimezone(p.timezone);
        setActive(p.active);
        setConferenceType(p.conferenceType || 'none');
        setAvailability(p.availability || []);
        setQuestions(p.questions || []);
        setStyling((p as unknown as Record<string, unknown>).styling as Record<string, string | boolean | undefined> || {});
        setThumbnail((p as unknown as Record<string, unknown>).thumbnail as string || '');
        setAllowStaffSelection(p.allowStaffSelection || false);
      } else {
        setError('Booking page not found');
      }
    } catch {
      setError('Failed to load booking page');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchBookings = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/tools/booking/${id}/bookings`);
      const data = await res.json();
      if (data.success) {
        setBookingsList(data.data);
      }
    } catch {
      /* ignore */
    }
  }, [id]);

  const fetchMembers = useCallback(async () => {
    setStaffLoading(true);
    try {
      const res = await fetch(`/api/portal/tools/booking/${id}/members`);
      const data = await res.json();
      if (data.success) {
        setPageMembers(data.data.members);
        setTeamMembers(data.data.teamMembers);
      }
    } catch {
      /* ignore */
    } finally {
      setStaffLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchPage();
    fetchBookings();
    fetchMembers();
    // Fetch branding profiles
    fetch('/api/portal/branding/profiles').then(r => r.json()).then(d => {
      if (d.success) setBrandingProfiles(d.data || []);
    }).catch(() => {});
  }, [fetchPage, fetchBookings, fetchMembers]);

  // ─── Save ────────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError('');

    try {
      const res = await fetch(`/api/portal/tools/booking/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: description || null,
          duration,
          color,
          brandingProfileId,
          bufferBefore,
          bufferAfter,
          maxAdvanceDays,
          minNoticeMins,
          timezone,
          active,
          conferenceType,
          availability,
          questions,
          styling,
          thumbnail: thumbnail || null,
          allowStaffSelection,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPage(data.data);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError(data.message || 'Failed to save');
      }
    } catch {
      setError('Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  // ─── Delete ──────────────────────────────────────────────────────────────

  async function handleDelete() {
    try {
      const res = await fetch(`/api/portal/tools/booking/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        router.push('/portal/tools/booking');
      } else {
        setError(data.message || 'Failed to delete');
      }
    } catch {
      setError('Failed to delete booking page');
    }
  }

  // ─── Cancel booking ─────────────────────────────────────────────────────

  async function handleCancelBooking(bookingId: number) {
    try {
      const res = await fetch(`/api/portal/tools/booking/${id}/bookings/${bookingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      const data = await res.json();
      if (data.success) {
        fetchBookings();
      }
    } catch {
      /* ignore */
    }
  }

  // ─── Availability helpers ────────────────────────────────────────────────

  function updateSlot(day: number, field: keyof AvailabilitySlot, value: unknown) {
    setAvailability((prev) =>
      prev.map((s) => (s.day === day ? { ...s, [field]: value } : s))
    );
  }

  // ─── Questions helpers ───────────────────────────────────────────────────

  function addQuestion() {
    setQuestions((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        label: '',
        type: 'text',
        required: false,
      },
    ]);
  }

  function updateQuestion(qId: string, field: keyof BookingQuestion, value: unknown) {
    setQuestions((prev) =>
      prev.map((q) => (q.id === qId ? { ...q, [field]: value } : q))
    );
  }

  function removeQuestion(qId: string) {
    setQuestions((prev) => prev.filter((q) => q.id !== qId));
  }

  function addOption(qId: string) {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === qId ? { ...q, options: [...(q.options || []), ''] } : q
      )
    );
  }

  function updateOption(qId: string, idx: number, value: string) {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === qId
          ? { ...q, options: (q.options || []).map((o, i) => (i === idx ? value : o)) }
          : q
      )
    );
  }

  function removeOption(qId: string, idx: number) {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === qId
          ? { ...q, options: (q.options || []).filter((_, i) => i !== idx) }
          : q
      )
    );
  }

  // ─── Copy to clipboard ──────────────────────────────────────────────────

  const [copied, setCopied] = useState<string | null>(null);
  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto flex items-center justify-center py-20">
        <span className="material-icons animate-spin text-3xl text-muted-foreground">autorenew</span>
      </div>
    );
  }

  if (!page) {
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
  const publicUrl = `${origin}/book/${page.slug}`;
  const iframeCode = `<iframe src="${publicUrl}" style="width:100%;height:700px;border:none;border-radius:12px;" title="${title}"></iframe>`;

  const now = new Date();
  const upcomingBookings = bookingsList
    .filter((b) => b.status === 'confirmed' && new Date(b.startTime) >= now)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  const pastBookings = bookingsList
    .filter((b) => b.status !== 'confirmed' || new Date(b.startTime) < now)
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/portal/tools/booking"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            <span className="material-icons text-lg">arrow_back</span>
            Back to Booking Pages
          </Link>
          <h1 className="text-2xl font-bold text-foreground">{page.title}</h1>
          <p className="text-muted-foreground mt-1 text-sm">/book/{page.slug}</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground hover:bg-muted transition-colors"
          >
            <span className="material-icons text-lg">open_in_new</span>
            Preview
          </a>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <>
                <span className="material-icons animate-spin text-lg">autorenew</span>
                Saving...
              </>
            ) : saved ? (
              <>
                <span className="material-icons text-lg">check</span>
                Saved
              </>
            ) : (
              <>
                <span className="material-icons text-lg">save</span>
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
          <span className="material-icons">error</span>
          {error}
          <button onClick={() => setError('')} className="ml-auto">
            <span className="material-icons text-lg">close</span>
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-card border border-border rounded-xl p-1 overflow-x-auto">
        {tabs.map((tab) => (
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

      {/* ═══════════════ Settings Tab ═══════════════ */}
      {activeTab === 'settings' && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-foreground mb-1.5">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-foreground mb-1.5">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none"
                placeholder="Describe what this meeting is about"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Duration</label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              >
                {durationOptions.map((d) => (
                  <option key={d} value={d}>{d} minutes</option>
                ))}
              </select>
            </div>


            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Buffer Before (min)</label>
              <input
                type="number"
                min={0}
                value={bufferBefore}
                onChange={(e) => setBufferBefore(Number(e.target.value))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Buffer After (min)</label>
              <input
                type="number"
                min={0}
                value={bufferAfter}
                onChange={(e) => setBufferAfter(Number(e.target.value))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Max Advance (days)</label>
              <input
                type="number"
                min={1}
                value={maxAdvanceDays}
                onChange={(e) => setMaxAdvanceDays(Number(e.target.value))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Min Notice (min)</label>
              <input
                type="number"
                min={0}
                value={minNoticeMins}
                onChange={(e) => setMinNoticeMins(Number(e.target.value))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Timezone</label>
              <input
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              />
            </div>

            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-foreground">Active</label>
              <button
                type="button"
                onClick={() => setActive(!active)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  active ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    active ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Video Conferencing */}
          <div className="border-t border-border pt-5">
            <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
              <span className="material-icons text-lg">videocam</span>
              Video Conferencing
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Automatically generate a video call link for each booking. The link will be included in confirmation emails.
            </p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: 'none', label: 'None', icon: 'videocam_off', desc: 'No video call' },
                { value: 'google_meet', label: 'Google Meet', icon: 'video_call', desc: 'Requires Google Calendar' },
                { value: 'zoom', label: 'Zoom', icon: 'video_camera_front', desc: 'Requires Zoom connection' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setConferenceType(opt.value)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    conferenceType === opt.value
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <span className={`material-icons text-xl mb-1 ${conferenceType === opt.value ? 'text-primary' : 'text-muted-foreground'}`}>
                    {opt.icon}
                  </span>
                  <p className="text-sm font-medium text-foreground">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Block Thumbnail */}
          <div className="border-t border-border pt-5">
            <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
              <span className="material-icons text-lg">image</span>
              Block Thumbnail
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              This image is used as the preview thumbnail when this booking page appears on your website.
            </p>
            <MediaPicker
              value={thumbnail}
              onChange={(url) => setThumbnail(url)}
              label="Select Thumbnail"
              apiEndpoint="/api/portal/media"
            />
          </div>

          {/* Danger zone */}
          <div className="border-t border-border pt-5">
            <h3 className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">Danger Zone</h3>
            {deleteConfirm ? (
              <div className="flex items-center gap-3">
                <p className="text-sm text-muted-foreground">Are you sure? This cannot be undone.</p>
                <button
                  onClick={handleDelete}
                  className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                >
                  Yes, delete
                </button>
                <button
                  onClick={() => setDeleteConfirm(false)}
                  className="px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setDeleteConfirm(true)}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              >
                <span className="material-icons text-lg">delete</span>
                Delete Booking Page
              </button>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════ Styling Tab ═══════════════ */}
      {activeTab === 'styling' && (
        <div className="bg-card border border-border rounded-xl p-6 space-y-6">
          <div>
            <h3 className="text-base font-semibold text-foreground mb-1">Appearance</h3>
            <p className="text-sm text-muted-foreground">Customize how your booking page looks. These settings override the branding profile when set.</p>
          </div>

          {/* Branding Profile */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Branding Profile</label>
            <select
              value={brandingProfileId || ''}
              onChange={(e) => {
                const profileId = e.target.value ? Number(e.target.value) : null;
                setBrandingProfileId(profileId);
                // When selecting a profile, optionally load its values as starting point
                if (profileId) {
                  const profile = brandingProfiles.find(p => p.id === profileId);
                  if (profile?.primaryColor) {
                    setColor(profile.primaryColor);
                  }
                }
              }}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">None (use overrides below)</option>
              {brandingProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.isDefault ? ' (default)' : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              Select a branding profile as a base, then override individual values below.
              {brandingProfiles.length === 0 && (
                <> <a href="/portal/branding" className="text-primary hover:underline">Create a branding profile</a> first.</>
              )}
            </p>
          </div>

          {/* Colors */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
              <span className="material-icons text-base text-muted-foreground">color_lens</span>
              Colors
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {([
                { key: 'primaryColor', label: 'Primary', fallback: color || '#2563eb' },
                { key: 'secondaryColor', label: 'Secondary', fallback: '#1e40af' },
                { key: 'accentColor', label: 'Accent', fallback: '#f59e0b' },
                { key: 'backgroundColor', label: 'Background', fallback: '#ffffff' },
                { key: 'textColor', label: 'Text', fallback: '#111827' },
              ] as const).map(({ key, label, fallback }) => (
                <div key={key}>
                  <label className="block text-xs text-muted-foreground mb-1">{label}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={(styling[key] as string) || fallback}
                      onChange={(e) => setStyling(prev => ({ ...prev, [key]: e.target.value }))}
                      className="w-8 h-8 rounded border border-border cursor-pointer shrink-0"
                    />
                    <input
                      type="text"
                      value={(styling[key] as string) || ''}
                      onChange={(e) => setStyling(prev => ({ ...prev, [key]: e.target.value }))}
                      placeholder={fallback}
                      className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Fonts */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
              <span className="material-icons text-base text-muted-foreground">text_fields</span>
              Fonts
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Heading Font</label>
                <GoogleFontPicker
                  value={(styling.headingFont as string) || ''}
                  onChange={(font) => setStyling(prev => ({ ...prev, headingFont: font }))}
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Body Font</label>
                <GoogleFontPicker
                  value={(styling.bodyFont as string) || ''}
                  onChange={(font) => setStyling(prev => ({ ...prev, bodyFont: font }))}
                />
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
              <span className="material-icons text-base text-muted-foreground">smart_button</span>
              Buttons
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Button Background</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={(styling.buttonPrimaryBg as string) || color || '#2563eb'}
                    onChange={(e) => setStyling(prev => ({ ...prev, buttonPrimaryBg: e.target.value }))}
                    className="w-8 h-8 rounded border border-border cursor-pointer shrink-0"
                  />
                  <input
                    type="text"
                    value={(styling.buttonPrimaryBg as string) || ''}
                    onChange={(e) => setStyling(prev => ({ ...prev, buttonPrimaryBg: e.target.value }))}
                    placeholder="Auto"
                    className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Button Text</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={(styling.buttonPrimaryText as string) || '#ffffff'}
                    onChange={(e) => setStyling(prev => ({ ...prev, buttonPrimaryText: e.target.value }))}
                    className="w-8 h-8 rounded border border-border cursor-pointer shrink-0"
                  />
                  <input
                    type="text"
                    value={(styling.buttonPrimaryText as string) || ''}
                    onChange={(e) => setStyling(prev => ({ ...prev, buttonPrimaryText: e.target.value }))}
                    placeholder="#ffffff"
                    className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Border Radius</label>
                <select
                  value={(styling.buttonBorderRadius as string) || ''}
                  onChange={(e) => setStyling(prev => ({ ...prev, buttonBorderRadius: e.target.value }))}
                  className="w-full px-2 py-1 text-xs bg-background border border-border rounded text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Default</option>
                  <option value="0px">Square (0px)</option>
                  <option value="4px">Slight (4px)</option>
                  <option value="8px">Rounded (8px)</option>
                  <option value="12px">More Rounded (12px)</option>
                  <option value="9999px">Pill (full)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Layout */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
              <span className="material-icons text-base text-muted-foreground">view_quilt</span>
              Layout
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Card Border Radius</label>
                <select
                  value={(styling.borderRadius as string) || ''}
                  onChange={(e) => setStyling(prev => ({ ...prev, borderRadius: e.target.value }))}
                  className="w-full px-2 py-1 text-xs bg-background border border-border rounded text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Default (8px)</option>
                  <option value="0px">Square (0px)</option>
                  <option value="4px">Slight (4px)</option>
                  <option value="12px">Rounded (12px)</option>
                  <option value="16px">More Rounded (16px)</option>
                  <option value="24px">Very Rounded (24px)</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-6 mt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!styling.hideTitle}
                  onChange={(e) => setStyling(prev => ({ ...prev, hideTitle: e.target.checked }))}
                  className="rounded border-border accent-primary"
                />
                <span className="text-sm text-foreground">Hide title on public page</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!styling.hideLogo}
                  onChange={(e) => setStyling(prev => ({ ...prev, hideLogo: e.target.checked }))}
                  className="rounded border-border accent-primary"
                />
                <span className="text-sm text-foreground">Hide logo</span>
              </label>
            </div>
          </div>

          {/* Preview swatch */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Preview</h4>
            <div
              className="rounded-xl border p-6 flex items-center justify-center gap-4"
              style={{
                backgroundColor: (styling.backgroundColor as string) || '#ffffff',
                borderColor: ((styling.textColor as string) || '#111827') + '20',
                borderRadius: (styling.borderRadius as string) || '8px',
              }}
            >
              <div className="text-center space-y-2">
                <p style={{
                  fontFamily: (styling.headingFont as string) ? `"${styling.headingFont}", sans-serif` : undefined,
                  color: (styling.textColor as string) || '#111827',
                  fontWeight: 600,
                  fontSize: '1.1rem',
                }}>
                  Book a Meeting
                </p>
                <button
                  className="px-5 py-2 text-sm font-medium transition-opacity"
                  style={{
                    backgroundColor: (styling.buttonPrimaryBg as string) || (styling.primaryColor as string) || color || '#2563eb',
                    color: (styling.buttonPrimaryText as string) || '#ffffff',
                    borderRadius: (styling.buttonBorderRadius as string) || '8px',
                  }}
                >
                  Confirm Booking
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ Availability Tab ═══════════════ */}
      {activeTab === 'availability' && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-icons text-primary">schedule</span>
            <h2 className="text-sm font-medium text-foreground">Weekly Availability</h2>
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6, 0].map((day) => {
              const slot = availability.find((s) => s.day === day);
              if (!slot) return null;
              return (
                <div
                  key={day}
                  className={`flex items-center gap-4 p-3 rounded-lg border transition-colors ${
                    slot.enabled
                      ? 'border-border bg-background'
                      : 'border-transparent bg-muted/50'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => updateSlot(day, 'enabled', !slot.enabled)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
                      slot.enabled ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        slot.enabled ? 'translate-x-4.5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                  <span className={`text-sm font-medium w-24 ${slot.enabled ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {DAY_NAMES[day]}
                  </span>
                  {slot.enabled ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={slot.startTime}
                        onChange={(e) => updateSlot(day, 'startTime', e.target.value)}
                        className="px-2 py-1 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                      <span className="text-muted-foreground text-sm">to</span>
                      <input
                        type="time"
                        value={slot.endTime}
                        onChange={(e) => updateSlot(day, 'endTime', e.target.value)}
                        className="px-2 py-1 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">Unavailable</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════════ Questions Tab ═══════════════ */}
      {activeTab === 'questions' && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="material-icons text-primary">quiz</span>
              <h2 className="text-sm font-medium text-foreground">Custom Questions</h2>
            </div>
            <button
              onClick={addQuestion}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <span className="material-icons text-lg">add</span>
              Add Question
            </button>
          </div>

          {questions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <span className="material-icons text-3xl mb-2 block">quiz</span>
              <p className="text-sm">No custom questions yet. Guests will only be asked for name, email, and phone.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {questions.map((q, idx) => (
                <div key={q.id} className="border border-border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <span className="text-xs text-muted-foreground font-medium">Question {idx + 1}</span>
                    <button
                      onClick={() => removeQuestion(q.id)}
                      className="text-muted-foreground hover:text-red-500 transition-colors"
                    >
                      <span className="material-icons text-lg">close</span>
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Label</label>
                    <input
                      type="text"
                      value={q.label}
                      onChange={(e) => updateQuestion(q.id, 'label', e.target.value)}
                      placeholder="e.g. What would you like to discuss?"
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <label className="block text-xs text-muted-foreground mb-1">Type</label>
                      <select
                        value={q.type}
                        onChange={(e) => updateQuestion(q.id, 'type', e.target.value)}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      >
                        <option value="text">Short Text</option>
                        <option value="textarea">Long Text</option>
                        <option value="select">Select</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2 pt-4">
                      <label className="text-xs text-muted-foreground">Required</label>
                      <button
                        type="button"
                        onClick={() => updateQuestion(q.id, 'required', !q.required)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          q.required ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                            q.required ? 'translate-x-4.5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                  {q.type === 'select' && (
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Options</label>
                      <div className="space-y-2">
                        {(q.options || []).map((opt, optIdx) => (
                          <div key={optIdx} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={opt}
                              onChange={(e) => updateOption(q.id, optIdx, e.target.value)}
                              placeholder={`Option ${optIdx + 1}`}
                              className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                            <button
                              onClick={() => removeOption(q.id, optIdx)}
                              className="text-muted-foreground hover:text-red-500 transition-colors"
                            >
                              <span className="material-icons text-lg">remove_circle_outline</span>
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => addOption(q.id)}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <span className="material-icons text-sm">add</span>
                          Add option
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ Embed Tab ═══════════════ */}
      {activeTab === 'embed' && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-icons text-primary">link</span>
              <h2 className="text-sm font-medium text-foreground">Direct Link</h2>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-muted rounded-lg text-sm text-foreground font-mono overflow-x-auto">
                {publicUrl}
              </code>
              <button
                onClick={() => copyText(publicUrl, 'link')}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex-shrink-0"
              >
                <span className="material-icons text-lg">
                  {copied === 'link' ? 'check' : 'content_copy'}
                </span>
                {copied === 'link' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-icons text-primary">code</span>
              <h2 className="text-sm font-medium text-foreground">Iframe Embed Code</h2>
            </div>
            <div className="relative">
              <pre className="px-3 py-3 bg-muted rounded-lg text-sm text-foreground font-mono overflow-x-auto whitespace-pre-wrap break-all">
                {iframeCode}
              </pre>
              <button
                onClick={() => copyText(iframeCode, 'iframe')}
                className="absolute top-2 right-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                <span className="material-icons text-sm">
                  {copied === 'iframe' ? 'check' : 'content_copy'}
                </span>
                {copied === 'iframe' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ Bookings Tab ═══════════════ */}
      {activeTab === 'bookings' && (
        <div className="space-y-6">
          {/* Upcoming */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-icons text-primary">event_upcoming</span>
              <h2 className="text-sm font-medium text-foreground">
                Upcoming ({upcomingBookings.length})
              </h2>
            </div>
            {upcomingBookings.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No upcoming bookings</p>
            ) : (
              <div className="divide-y divide-border">
                {upcomingBookings.map((b) => (
                  <div key={b.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{b.guestName}</p>
                      <p className="text-xs text-muted-foreground">{b.guestEmail}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(b.startTime).toLocaleDateString(undefined, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}{' '}
                        {new Date(b.startTime).toLocaleTimeString(undefined, {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                        {' - '}
                        {new Date(b.endTime).toLocaleTimeString(undefined, {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                      {b.assignedTo && (() => {
                        const member = pageMembers.find(m => m.userId === b.assignedTo);
                        return member ? (
                          <p className="text-xs mt-0.5 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: member.color || '#6b7280' }} />
                            <span className="text-muted-foreground">{member.displayName || member.userName}</span>
                          </p>
                        ) : null;
                      })()}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {pageMembers.length > 0 && (
                        <select
                          value={b.assignedTo || ''}
                          onChange={async (e) => {
                            const newAssignedTo = e.target.value ? parseInt(e.target.value) : null;
                            await fetch(`/api/portal/tools/booking/${id}/bookings/${b.id}`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ assignedTo: newAssignedTo }),
                            });
                            fetchBookings();
                          }}
                          className="px-2 py-1 bg-background border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                        >
                          <option value="">Unassigned</option>
                          {pageMembers.filter(m => m.active).map(m => (
                            <option key={m.userId} value={m.userId}>{m.displayName || m.userName}</option>
                          ))}
                        </select>
                      )}
                      <button
                        onClick={() => handleCancelBooking(b.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      >
                        <span className="material-icons text-sm">cancel</span>
                        Cancel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Past */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-icons text-muted-foreground">history</span>
              <h2 className="text-sm font-medium text-foreground">
                Past & Cancelled ({pastBookings.length})
              </h2>
            </div>
            {pastBookings.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No past bookings</p>
            ) : (
              <div className="divide-y divide-border">
                {pastBookings.map((b) => (
                  <div key={b.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{b.guestName}</p>
                      <p className="text-xs text-muted-foreground">{b.guestEmail}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(b.startTime).toLocaleDateString(undefined, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}{' '}
                        {new Date(b.startTime).toLocaleTimeString(undefined, {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                        b.status === 'cancelled'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : b.status === 'completed'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : b.status === 'no_show'
                          ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                      }`}
                    >
                      {b.status.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════ Staff Tab ═══════════════ */}
      {activeTab === 'staff' && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-6">
          {/* Staff Selection Toggle */}
          <div>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-foreground">Allow Customer Staff Selection</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  When enabled, customers can choose a specific staff member when booking. When disabled, bookings are auto-assigned using round-robin.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAllowStaffSelection(!allowStaffSelection)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  allowStaffSelection ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    allowStaffSelection ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="border-t border-border pt-5">
            <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
              <span className="material-icons text-lg">group</span>
              Assigned Staff Members
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Add team members who handle bookings for this page. Each member can have a custom display name, color, and availability.
            </p>

            {/* Add member form */}
            <div className="flex items-end gap-3 mb-4 p-3 bg-muted/50 rounded-lg">
              <div className="flex-1">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Team Member</label>
                <select
                  value={addMemberUserId}
                  onChange={e => {
                    const uid = parseInt(e.target.value);
                    setAddMemberUserId(uid || '');
                    const tm = teamMembers.find(m => m.userId === uid);
                    if (tm) setAddMemberName(tm.name);
                  }}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Select a team member...</option>
                  {teamMembers
                    .filter(tm => !pageMembers.some(pm => pm.userId === tm.userId))
                    .map(tm => (
                      <option key={tm.userId} value={tm.userId}>{tm.name} ({tm.email})</option>
                    ))
                  }
                </select>
              </div>
              <div className="w-36">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Display Name</label>
                <input
                  type="text"
                  value={addMemberName}
                  onChange={e => setAddMemberName(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="w-20">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Color</label>
                <input
                  type="color"
                  value={addMemberColor}
                  onChange={e => setAddMemberColor(e.target.value)}
                  className="w-full h-[38px] bg-background border border-border rounded-lg cursor-pointer"
                />
              </div>
              <button
                onClick={async () => {
                  if (!addMemberUserId) return;
                  try {
                    const res = await fetch(`/api/portal/tools/booking/${id}/members`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        userId: addMemberUserId,
                        displayName: addMemberName || null,
                        color: addMemberColor,
                      }),
                    });
                    const data = await res.json();
                    if (data.success) {
                      fetchMembers();
                      setAddMemberUserId('');
                      setAddMemberName('');
                      setAddMemberColor('#2563eb');
                    }
                  } catch { /* ignore */ }
                }}
                disabled={!addMemberUserId}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                <span className="material-icons text-lg align-middle mr-1">person_add</span>
                Add
              </button>
            </div>

            {/* Members list */}
            {staffLoading ? (
              <div className="flex items-center justify-center py-8">
                <span className="material-icons animate-spin text-2xl text-muted-foreground">autorenew</span>
              </div>
            ) : pageMembers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <span className="material-icons text-4xl mb-2 block opacity-50">group_off</span>
                <p className="text-sm">No staff members assigned yet.</p>
                <p className="text-xs mt-1">Add team members above to enable staff assignment.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pageMembers.map(member => (
                  <div key={member.id} className="flex items-center gap-3 p-3 bg-background border border-border rounded-lg">
                    <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: member.color || '#6b7280' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {member.displayName || member.userName}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{member.userEmail}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      member.active
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                    }`}>
                      {member.active ? 'Active' : 'Inactive'}
                    </span>
                    <button
                      onClick={async () => {
                        await fetch(`/api/portal/tools/booking/${id}/members`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ memberId: member.id, active: !member.active }),
                        });
                        fetchMembers();
                      }}
                      className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                      title={member.active ? 'Deactivate' : 'Activate'}
                    >
                      <span className="material-icons text-lg text-muted-foreground">
                        {member.active ? 'toggle_on' : 'toggle_off'}
                      </span>
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(`Remove ${member.displayName || member.userName} from this booking page?`)) return;
                        await fetch(`/api/portal/tools/booking/${id}/members?memberId=${member.id}`, {
                          method: 'DELETE',
                        });
                        fetchMembers();
                      }}
                      className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      <span className="material-icons text-lg text-red-500">remove_circle</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {pageMembers.length > 0 && (
            <div className="border-t border-border pt-5">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="material-icons text-sm">info</span>
                Remember to click <strong>Save Changes</strong> above to persist the staff selection toggle.
                Staff member additions and removals are saved immediately.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ Automations Tab ═══════════════ */}
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
