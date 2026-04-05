'use client';

import { useState, useEffect, useCallback } from 'react';
import { use } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BookingQuestion {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  required: boolean;
  options?: string[];
}

interface AvailabilitySlot {
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startTime: string;
  endTime: string;
  enabled: boolean;
}

interface BrandingInfo {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  headingFont: string;
  bodyFont: string;
  logoUrl: string;
  borderRadius?: string;
  buttonStyle?: {
    primaryBg?: string; primaryText?: string; primaryHoverBg?: string;
    borderRadius?: string;
  };
}

interface BookingPageInfo {
  id: number;
  title: string;
  description: string | null;
  duration: number;
  timezone: string;
  color: string;
  availability: AvailabilitySlot[];
  questions: BookingQuestion[];
  maxAdvanceDays: number;
  minNoticeMins: number;
  branding?: BrandingInfo | null;
  cssVars?: Record<string, string>;
}

interface TimeSlot {
  start: string; // ISO
  end: string;   // ISO
  display: string; // "9:00 AM"
}

type Step = 'date' | 'time' | 'info' | 'confirmed';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function formatDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function PublicBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);

  const [pageInfo, setPageInfo] = useState<BookingPageInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  // Calendar state
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Slots state
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);

  // Guest info state
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Step
  const [step, setStep] = useState<Step>('date');
  const [meetingLink, setMeetingLink] = useState<string | null>(null);

  // ─── Fetch page info ────────────────────────────────────────────────────

  useEffect(() => {
    async function fetchInfo() {
      try {
        const res = await fetch(`/api/public/booking/${slug}`);
        if (!res.ok) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        const data = await res.json();
        if (data.success) {
          setPageInfo(data.data);
        } else {
          setNotFound(true);
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    fetchInfo();
  }, [slug]);

  // Load Google Fonts dynamically when branding specifies custom fonts
  useEffect(() => {
    if (!pageInfo?.branding) return;
    const fonts = [pageInfo.branding.headingFont, pageInfo.branding.bodyFont].filter(Boolean);
    if (fonts.length === 0) return;
    const families = [...new Set(fonts)].map(f => f.replace(/ /g, '+')).join('&family=');
    const id = 'booking-brand-fonts';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${families}&display=swap`;
    document.head.appendChild(link);
  }, [pageInfo?.branding]);

  // ─── Fetch slots ────────────────────────────────────────────────────────

  const fetchSlots = useCallback(async (date: string) => {
    setSlotsLoading(true);
    setSlots([]);
    try {
      const res = await fetch(`/api/public/booking/${slug}/slots?date=${date}`);
      const data = await res.json();
      if (data.success && pageInfo) {
        const mapped: TimeSlot[] = (data.data as string[]).map((iso) => {
          const start = new Date(iso);
          const end = new Date(start.getTime() + pageInfo.duration * 60 * 1000);
          const display = start.toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          });
          return { start: iso, end: end.toISOString(), display };
        });
        setSlots(mapped);
      }
    } catch {
      /* ignore */
    } finally {
      setSlotsLoading(false);
    }
  }, [slug, pageInfo]);

  // ─── Date selection ─────────────────────────────────────────────────────

  function handleDateSelect(date: string) {
    setSelectedDate(date);
    setSelectedSlot(null);
    setStep('time');
    fetchSlots(date);
  }

  // ─── Slot selection ─────────────────────────────────────────────────────

  function handleSlotSelect(slot: TimeSlot) {
    setSelectedSlot(slot);
    setStep('info');
  }

  // ─── Submit booking ─────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot || !guestName.trim() || !guestEmail.trim()) return;

    setSubmitting(true);
    setSubmitError('');

    try {
      const res = await fetch(`/api/public/booking/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime: selectedSlot.start,
          endTime: selectedSlot.end,
          guestName: guestName.trim(),
          guestEmail: guestEmail.trim(),
          guestPhone: guestPhone.trim() || undefined,
          answers: Object.keys(answers).length > 0 ? answers : undefined,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.data?.meetingLink) setMeetingLink(data.data.meetingLink);
        setStep('confirmed');
      } else {
        setSubmitError(data.message || 'Failed to book. Please try again.');
      }
    } catch {
      setSubmitError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Calendar navigation ───────────────────────────────────────────────

  function prevMonth() {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear(calYear - 1);
    } else {
      setCalMonth(calMonth - 1);
    }
  }

  function nextMonth() {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear(calYear + 1);
    } else {
      setCalMonth(calMonth + 1);
    }
  }

  // ─── Check if date is available ─────────────────────────────────────────

  function isDateAvailable(year: number, month: number, day: number): boolean {
    if (!pageInfo) return false;
    const date = new Date(year, month, day);
    const dayOfWeek = date.getDay();

    // Check availability config
    const slot = pageInfo.availability.find((s) => s.day === dayOfWeek);
    if (!slot || !slot.enabled) return false;

    // Check if in the past
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (date < todayStart) return false;

    // Check min notice
    const nowMs = Date.now();
    const dateMs = date.getTime();
    if (dateMs - nowMs < pageInfo.minNoticeMins * 60 * 1000 - 24 * 60 * 60 * 1000) return false;

    // Check max advance
    const maxDate = new Date(todayStart);
    maxDate.setDate(maxDate.getDate() + pageInfo.maxAdvanceDays);
    if (date > maxDate) return false;

    return true;
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  if (notFound || !pageInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center space-y-3 p-8">
          <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto">
            <span className="material-icons text-3xl text-gray-400">event_busy</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Page Not Found</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            This booking page doesn&apos;t exist or is no longer active.
          </p>
        </div>
      </div>
    );
  }

  const b = pageInfo.branding;
  const accent = b?.primaryColor || pageInfo.color || '#2563eb';
  const bgColor = b?.backgroundColor;
  const textColor = b?.textColor;
  const headingFont = b?.headingFont;
  const bodyFont = b?.bodyFont;
  const logoUrl = b?.logoUrl;
  const btnRadius = b?.buttonStyle?.borderRadius || b?.borderRadius;
  const btnBg = b?.buttonStyle?.primaryBg || accent;
  const btnText = b?.buttonStyle?.primaryText || '#ffffff';
  const secondaryColor = b?.secondaryColor;

  const headingStyle: React.CSSProperties | undefined = headingFont
    ? { fontFamily: `"${headingFont}", sans-serif` }
    : undefined;

  const cardStyle: React.CSSProperties = {
    ...(secondaryColor ? { borderColor: `${secondaryColor}30` } : {}),
  };

  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDayOfMonth(calYear, calMonth);
  const canGoPrev = calYear > today.getFullYear() || (calYear === today.getFullYear() && calMonth > today.getMonth());

  const wrapperStyle: React.CSSProperties = {
    ...(bgColor ? { backgroundColor: bgColor } : {}),
    ...(textColor ? { color: textColor } : {}),
    ...(bodyFont ? { fontFamily: `"${bodyFont}", sans-serif` } : {}),
    ...(pageInfo.cssVars || {}),
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-start justify-center p-4 sm:p-8" style={wrapperStyle}>
      <div className="w-full max-w-lg">
        {logoUrl && (
          <div className="flex justify-center mb-6">
            <img src={logoUrl} alt="Logo" className="h-10 object-contain" />
          </div>
        )}
        {/* Header */}
        <div className="text-center mb-6">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
            style={{ backgroundColor: accent + '15' }}
          >
            <span className="material-icons text-2xl" style={{ color: accent }}>calendar_month</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100" style={{ ...headingStyle, ...(textColor ? { color: textColor } : {}) }}>{pageInfo.title}</h1>
          {pageInfo.description && (
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1 max-w-sm mx-auto" style={textColor ? { color: `${textColor}bb` } : undefined}>{pageInfo.description}</p>
          )}
          <div className="flex items-center justify-center gap-3 mt-2 text-xs text-gray-400 dark:text-gray-500">
            <span className="flex items-center gap-1">
              <span className="material-icons text-sm">timer</span>
              {pageInfo.duration} min
            </span>
            <span className="flex items-center gap-1">
              <span className="material-icons text-sm">public</span>
              {pageInfo.timezone}
            </span>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {(['date', 'time', 'info'] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                  step === s || (step === 'confirmed' && i < 3)
                    ? 'text-white'
                    : 'bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                }`}
                style={
                  step === s || (step === 'confirmed' && i < 3)
                    ? { backgroundColor: accent }
                    : undefined
                }
              >
                {step === 'confirmed' || (['time', 'info', 'confirmed'].indexOf(step) > i - 1 && i < ['date', 'time', 'info'].indexOf(step))
                  ? <span className="material-icons text-sm">check</span>
                  : i + 1}
              </div>
              {i < 2 && (
                <div className="w-8 h-0.5 bg-gray-200 dark:bg-gray-800 rounded" />
              )}
            </div>
          ))}
        </div>

        {/* ═══════════════ Step 1: Date ═══════════════ */}
        {step === 'date' && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-5" style={cardStyle}>
            <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4" style={textColor ? { color: textColor } : undefined}>Select a date</h2>
            {/* Month nav */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={prevMonth}
                disabled={!canGoPrev}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <span className="material-icons">chevron_left</span>
              </button>
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {MONTH_NAMES[calMonth]} {calYear}
              </span>
              <button
                onClick={nextMonth}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors"
              >
                <span className="material-icons">chevron_right</span>
              </button>
            </div>
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                <div key={d} className="text-center text-xs font-medium text-gray-400 dark:text-gray-500 py-1">
                  {d}
                </div>
              ))}
            </div>
            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = formatDate(new Date(calYear, calMonth, day));
                const available = isDateAvailable(calYear, calMonth, day);
                const isToday =
                  calYear === today.getFullYear() &&
                  calMonth === today.getMonth() &&
                  day === today.getDate();

                return (
                  <button
                    key={day}
                    onClick={() => available && handleDateSelect(dateStr)}
                    disabled={!available}
                    className={`h-10 rounded-lg text-sm font-medium transition-all ${
                      available
                        ? 'hover:shadow-sm cursor-pointer text-gray-900 dark:text-gray-100'
                        : 'text-gray-300 dark:text-gray-700 cursor-not-allowed'
                    } ${isToday ? 'ring-1 ring-gray-300 dark:ring-gray-600' : ''}`}
                    style={
                      available
                        ? {
                            backgroundColor: accent + '10',
                          }
                        : undefined
                    }
                    onMouseEnter={(e) => {
                      if (available) {
                        e.currentTarget.style.backgroundColor = accent + '25';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (available) {
                        e.currentTarget.style.backgroundColor = accent + '10';
                      }
                    }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══════════════ Step 2: Time ═══════════════ */}
        {step === 'time' && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-5" style={cardStyle}>
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => { setStep('date'); setSelectedSlot(null); }}
                className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                <span className="material-icons text-lg">arrow_back</span>
                Back
              </button>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {selectedDate &&
                  new Date(selectedDate + 'T12:00:00').toLocaleDateString(undefined, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
              </span>
            </div>

            {slotsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div
                  className="animate-spin rounded-full h-6 w-6 border-2 border-gray-300"
                  style={{ borderTopColor: accent }}
                />
              </div>
            ) : slots.length === 0 ? (
              <div className="text-center py-12">
                <span className="material-icons text-3xl text-gray-300 dark:text-gray-600 mb-2 block">event_busy</span>
                <p className="text-sm text-gray-500 dark:text-gray-400">No available times on this day</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 max-h-80 overflow-y-auto">
                {slots.map((slot) => (
                  <button key={slot.start}
                    onClick={() => handleSlotSelect(slot)}
                    className="px-3 py-2.5 rounded-lg text-sm font-medium border transition-all hover:shadow-sm"
                    style={{
                      borderColor: accent + '40',
                      color: accent,
                      backgroundColor: accent + '08',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = accent;
                      e.currentTarget.style.color = '#ffffff';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = accent + '08';
                      e.currentTarget.style.color = accent;
                    }}
                  >
                    {slot.display}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ Step 3: Info ═══════════════ */}
        {step === 'info' && selectedSlot && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-5" style={cardStyle}>
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setStep('time')}
                className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                <span className="material-icons text-lg">arrow_back</span>
                Back
              </button>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {new Date(selectedSlot.start).toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {selectedSlot.display} ({pageInfo.duration} min)
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {submitError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
                  <span className="material-icons text-lg">error</span>
                  {submitError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{ '--tw-ring-color': accent + '50' } as React.CSSProperties}
                  disabled={submitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{ '--tw-ring-color': accent + '50' } as React.CSSProperties}
                  disabled={submitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Phone <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="tel"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{ '--tw-ring-color': accent + '50' } as React.CSSProperties}
                  disabled={submitting}
                />
              </div>

              {/* Custom questions */}
              {pageInfo.questions.map((q) => (
                <div key={q.id}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {q.label}
                    {q.required && <span className="text-red-500"> *</span>}
                  </label>
                  {q.type === 'text' && (
                    <input
                      type="text"
                      required={q.required}
                      value={answers[q.id] || ''}
                      onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                      className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent"
                      style={{ '--tw-ring-color': accent + '50' } as React.CSSProperties}
                      disabled={submitting}
                    />
                  )}
                  {q.type === 'textarea' && (
                    <textarea
                      required={q.required}
                      value={answers[q.id] || ''}
                      onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent resize-none"
                      style={{ '--tw-ring-color': accent + '50' } as React.CSSProperties}
                      disabled={submitting}
                    />
                  )}
                  {q.type === 'select' && (
                    <select
                      required={q.required}
                      value={answers[q.id] || ''}
                      onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                      className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:border-transparent"
                      style={{ '--tw-ring-color': accent + '50' } as React.CSSProperties}
                      disabled={submitting}
                    >
                      <option value="">Select...</option>
                      {(q.options || []).map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  )}
                </div>
              ))}

              <button
                type="submit"
                disabled={submitting || !guestName.trim() || !guestEmail.trim()}
                className="w-full py-3 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-md"
                style={{ backgroundColor: btnBg, color: btnText, ...(btnRadius ? { borderRadius: btnRadius } : {}) }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.9';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span
                      className="animate-spin rounded-full h-4 w-4 border-2 border-white/30"
                      style={{ borderTopColor: '#ffffff' }}
                    />
                    Booking...
                  </span>
                ) : (
                  'Confirm Booking'
                )}
              </button>
            </form>
          </div>
        )}

        {/* ═══════════════ Step 4: Confirmed ═══════════════ */}
        {step === 'confirmed' && selectedSlot && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-8 text-center" style={cardStyle}>
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: accent + '15' }}
            >
              <span className="material-icons text-3xl" style={{ color: accent }}>check_circle</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Booking Confirmed</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
              A confirmation has been sent to {guestEmail}
            </p>

            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 space-y-2 text-left">
              <div className="flex items-center gap-3">
                <span className="material-icons text-gray-400 text-lg">event</span>
                <span className="text-sm text-gray-900 dark:text-gray-100">
                  {new Date(selectedSlot.start).toLocaleDateString(undefined, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="material-icons text-gray-400 text-lg">schedule</span>
                <span className="text-sm text-gray-900 dark:text-gray-100">
                  {selectedSlot.display} - {new Date(selectedSlot.end).toLocaleTimeString(undefined, {
                    hour: 'numeric',
                    minute: '2-digit',
                  })} ({pageInfo.duration} min)
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="material-icons text-gray-400 text-lg">person</span>
                <span className="text-sm text-gray-900 dark:text-gray-100">{guestName}</span>
              </div>
              {meetingLink && (
                <div className="flex items-center gap-3">
                  <span className="material-icons text-gray-400 text-lg">videocam</span>
                  <a
                    href={meetingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium hover:underline"
                    style={{ color: accent }}
                  >
                    Join Video Call
                  </a>
                </div>
              )}
            </div>

            {meetingLink && (
              <a
                href={meetingLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-4 px-6 py-3 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: accent }}
              >
                <span className="material-icons text-lg">videocam</span>
                Join Video Call
              </a>
            )}
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 dark:text-gray-600 mt-6">
          Powered by Simpler Development
        </p>
      </div>
    </div>
  );
}
