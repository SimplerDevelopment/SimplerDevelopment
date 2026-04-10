'use client';

import { useState, useEffect, useCallback } from 'react';
import { BookingPaymentForm } from './BookingPaymentForm';

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
  // New fields
  price: number;
  priceLabel: string | null;
  maxGuests: number | null;
  enableAddOns: boolean;
  enableGiftCertificates: boolean;
  enableDiscountCodes: boolean;
  enableWaivers: boolean;
  requireWaiverBeforeBooking: boolean;
  waiverContent: string | null;
  checkinEnabled: boolean;
}

interface SlotData {
  time: string;
  remainingCapacity: number | null;
}

interface TimeSlot {
  start: string;
  end: string;
  display: string;
  remainingCapacity: number | null;
}

interface AddOnItem {
  id: number;
  source: 'custom' | 'product';
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  maxQuantity: number;
}

type Step = 'date' | 'time' | 'addons' | 'info' | 'payment' | 'confirmed';

export interface BookingFormInlineProps {
  slug: string;
  showPageTitle?: boolean;
  showDescription?: boolean;
  showSteps?: boolean;
  styleOverrides?: {
    primaryColor?: string;
    backgroundColor?: string;
    textColor?: string;
    formBg?: string;
    inputBg?: string;
    headingFont?: string;
    bodyFont?: string;
    buttonBg?: string;
    buttonText?: string;
    buttonBorderRadius?: string;
    borderRadius?: string;
  };
}

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

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ─── Component ───────────────────────────────────────────────────────────────

export function BookingFormInline({
  slug,
  showPageTitle = true,
  showDescription = true,
  showSteps = true,
  styleOverrides,
}: BookingFormInlineProps) {
  const [pageInfo, setPageInfo] = useState<BookingPageInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);

  // Add-ons
  const [addOns, setAddOns] = useState<AddOnItem[]>([]);
  const [selectedAddOns, setSelectedAddOns] = useState<Record<number, number>>({}); // addOnId → quantity

  // Group size
  const [groupSize, setGroupSize] = useState(1);

  // Discount & gift cert
  const [discountCode, setDiscountCode] = useState('');
  const [discountResult, setDiscountResult] = useState<{ code: string; discountType: string; amount: number; discountAmount: number | null } | null>(null);
  const [discountError, setDiscountError] = useState('');
  const [giftCertCode, setGiftCertCode] = useState('');
  const [giftCertResult, setGiftCertResult] = useState<{ code: string; remainingAmount: number } | null>(null);
  const [giftCertError, setGiftCertError] = useState('');

  // Guest info
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [step, setStep] = useState<Step>('date');
  const [meetingLink, setMeetingLink] = useState<string | null>(null);
  const [bookingResult, setBookingResult] = useState<{ id: number; clientSecret?: string; total?: number; paymentStatus?: string; checkinCode?: string } | null>(null);

  // ─── Fetch page info ────────────────────────────────────────────────────

  useEffect(() => {
    async function fetchInfo() {
      try {
        const res = await fetch(`/api/public/booking/${slug}`);
        if (!res.ok) { setNotFound(true); setLoading(false); return; }
        const data = await res.json();
        if (data.success) setPageInfo(data.data);
        else setNotFound(true);
      } catch { setNotFound(true); }
      finally { setLoading(false); }
    }
    fetchInfo();
  }, [slug]);

  // Load Google Fonts
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

  // Fetch add-ons when page loads
  useEffect(() => {
    if (!pageInfo?.enableAddOns) return;
    fetch(`/api/public/booking/${slug}/add-ons`)
      .then(r => r.json())
      .then(d => { if (d.success) setAddOns(d.data); })
      .catch(() => {});
  }, [slug, pageInfo?.enableAddOns]);

  // ─── Fetch slots ────────────────────────────────────────────────────────

  const fetchSlots = useCallback(async (date: string) => {
    setSlotsLoading(true);
    setSlots([]);
    try {
      const res = await fetch(`/api/public/booking/${slug}/slots?date=${date}`);
      const data = await res.json();
      if (data.success && pageInfo) {
        const mapped: TimeSlot[] = (data.data as SlotData[]).map((slot) => {
          const start = new Date(slot.time);
          const end = new Date(start.getTime() + pageInfo.duration * 60 * 1000);
          const display = start.toLocaleTimeString(undefined, {
            hour: 'numeric', minute: '2-digit', hour12: true,
          });
          return { start: slot.time, end: end.toISOString(), display, remainingCapacity: slot.remainingCapacity };
        });
        setSlots(mapped);
      }
    } catch { /* ignore */ }
    finally { setSlotsLoading(false); }
  }, [slug, pageInfo]);

  // ─── Price calculation ──────────────────────────────────────────────────

  function calculateTotal() {
    if (!pageInfo) return { subtotal: 0, addOnTotal: 0, discount: 0, giftCert: 0, total: 0 };

    const basePrice = (pageInfo.price || 0) * groupSize;
    const addOnTotal = Object.entries(selectedAddOns).reduce((sum, [id, qty]) => {
      const addOn = addOns.find(a => a.id === parseInt(id));
      return sum + (addOn ? addOn.price * qty : 0);
    }, 0);

    const subtotal = basePrice + addOnTotal;

    let discount = 0;
    if (discountResult?.discountAmount) {
      discount = discountResult.discountAmount;
    } else if (discountResult) {
      if (discountResult.discountType === 'percent') {
        discount = Math.round(subtotal * (discountResult.amount / 10000));
      } else if (discountResult.discountType === 'fixed_amount') {
        discount = Math.min(discountResult.amount, subtotal);
      }
    }

    const afterDiscount = subtotal - discount;
    const giftCert = giftCertResult ? Math.min(giftCertResult.remainingAmount, afterDiscount) : 0;
    const total = Math.max(0, afterDiscount - giftCert);

    return { subtotal, addOnTotal, discount, giftCert, total };
  }

  const pricing = calculateTotal();

  // ─── Handlers ───────────────────────────────────────────────────────────

  function handleDateSelect(date: string) {
    setSelectedDate(date);
    setSelectedSlot(null);
    setStep('time');
    fetchSlots(date);
  }

  function handleSlotSelect(slot: TimeSlot) {
    setSelectedSlot(slot);
    // Go to add-ons if enabled and there are add-ons, otherwise info
    if (pageInfo?.enableAddOns && addOns.length > 0) {
      setStep('addons');
    } else {
      setStep('info');
    }
  }

  async function validateDiscount() {
    if (!discountCode.trim()) return;
    setDiscountError('');
    setDiscountResult(null);
    try {
      const res = await fetch(`/api/public/booking/${slug}/validate-discount`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: discountCode.trim(), subtotal: pricing.subtotal }),
      });
      const data = await res.json();
      if (data.success) setDiscountResult(data.data);
      else setDiscountError(data.message);
    } catch { setDiscountError('Failed to validate code'); }
  }

  async function validateGiftCert() {
    if (!giftCertCode.trim()) return;
    setGiftCertError('');
    setGiftCertResult(null);
    try {
      const res = await fetch('/api/public/gift-certificates/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: giftCertCode.trim(), context: 'booking' }),
      });
      const data = await res.json();
      if (data.success) setGiftCertResult(data.data);
      else setGiftCertError(data.message);
    } catch { setGiftCertError('Failed to validate certificate'); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot || !guestName.trim() || !guestEmail.trim()) return;

    setSubmitting(true);
    setSubmitError('');

    try {
      const addOnsList = Object.entries(selectedAddOns)
        .filter(([, qty]) => qty > 0)
        .map(([id, qty]) => ({ addOnId: parseInt(id), quantity: qty }));

      const res = await fetch(`/api/public/booking/${slug}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: guestName.trim(),
          email: guestEmail.trim(),
          phone: guestPhone.trim() || undefined,
          startTime: selectedSlot.start,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          answers: Object.keys(answers).length > 0 ? answers : undefined,
          groupSize,
          addOns: addOnsList.length > 0 ? addOnsList : undefined,
          discountCode: discountResult?.code || undefined,
          giftCertificateCode: giftCertResult?.code || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setBookingResult(data.data);
        if (data.data?.meetingLink) setMeetingLink(data.data.meetingLink);

        if (data.data?.clientSecret) {
          // Payment required — go to payment step
          setStep('payment');
        } else {
          setStep('confirmed');
        }
      } else {
        setSubmitError(data.message || 'Failed to book. Please try again.');
      }
    } catch {
      setSubmitError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); }
    else { setCalMonth(calMonth - 1); }
  }

  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); }
    else { setCalMonth(calMonth + 1); }
  }

  function isDateAvailable(year: number, month: number, day: number): boolean {
    if (!pageInfo) return false;
    const date = new Date(year, month, day);
    const dayOfWeek = date.getDay();
    const slot = pageInfo.availability.find((s) => s.day === dayOfWeek);
    if (!slot || !slot.enabled) return false;
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (date < todayStart) return false;
    const nowMs = Date.now();
    const dateMs = date.getTime();
    if (dateMs - nowMs < pageInfo.minNoticeMins * 60 * 1000 - 24 * 60 * 60 * 1000) return false;
    const maxDate = new Date(todayStart);
    maxDate.setDate(maxDate.getDate() + pageInfo.maxAdvanceDays);
    if (date > maxDate) return false;
    return true;
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  if (notFound || !pageInfo) {
    return (
      <div className="flex items-center justify-center py-12">
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
  const so = styleOverrides;
  const accent = so?.primaryColor || b?.primaryColor || pageInfo.color || '#2563eb';
  const bgColor = so?.backgroundColor || b?.backgroundColor;
  const textColor = so?.textColor || b?.textColor;
  const headingFont = so?.headingFont || b?.headingFont;
  const bodyFont = so?.bodyFont || b?.bodyFont;
  const logoUrl = b?.logoUrl;
  const btnRadius = so?.buttonBorderRadius || b?.buttonStyle?.borderRadius || b?.borderRadius;
  const btnBg = so?.buttonBg || b?.buttonStyle?.primaryBg || accent;
  const btnText = so?.buttonText || b?.buttonStyle?.primaryText || '#ffffff';
  const secondaryColor = b?.secondaryColor;
  const formBg = so?.formBg;
  const inputBg = so?.inputBg;

  const headingStyle: React.CSSProperties | undefined = headingFont
    ? { fontFamily: `"${headingFont}", sans-serif` }
    : undefined;

  const cardStyle: React.CSSProperties = {
    ...(secondaryColor ? { borderColor: `${secondaryColor}30` } : {}),
    ...(formBg ? { backgroundColor: formBg } : {}),
  };

  const inputFieldStyle: React.CSSProperties = {
    ...(inputBg ? { backgroundColor: inputBg } : {}),
    ...(textColor ? { color: textColor } : {}),
  };

  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDayOfMonth(calYear, calMonth);
  const canGoPrev = calYear > today.getFullYear() || (calYear === today.getFullYear() && calMonth > today.getMonth());
  const hasPricing = pageInfo.price > 0 || addOns.some(a => (a.price || 0) > 0);

  const wrapperStyle: React.CSSProperties = {
    ...(bgColor ? { backgroundColor: bgColor } : {}),
    ...(textColor ? { color: textColor } : {}),
    ...(bodyFont ? { fontFamily: `"${bodyFont}", sans-serif` } : {}),
    ...(pageInfo.cssVars || {}),
  };

  // Build steps list dynamically
  const stepList: Step[] = ['date', 'time'];
  if (pageInfo.enableAddOns && addOns.length > 0) stepList.push('addons');
  stepList.push('info');
  if (hasPricing) stepList.push('payment');

  const stepLabels: Record<Step, string> = {
    date: 'Date',
    time: 'Time',
    addons: 'Extras',
    info: 'Details',
    payment: 'Pay',
    confirmed: 'Done',
  };

  const backButton = (targetStep: Step) => (
    <button
      onClick={() => setStep(targetStep)}
      className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
    >
      <span className="material-icons text-lg">arrow_back</span>
      Back
    </button>
  );

  return (
    <div className="flex items-start justify-center p-4" style={wrapperStyle}>
      <div className="w-full max-w-lg">
        {logoUrl && (
          <div className="flex justify-center mb-6">
            <img src={logoUrl} alt="Logo" className="h-10 object-contain" />
          </div>
        )}
        {/* Header */}
        {showPageTitle && (
          <div className="text-center mb-6">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
              style={{ backgroundColor: accent + '15' }}
            >
              <span className="material-icons text-2xl" style={{ color: accent }}>calendar_month</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100" style={{ ...headingStyle, ...(textColor ? { color: textColor } : {}) }}>{pageInfo.title}</h1>
            {pageInfo.description && showDescription && (
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
              {pageInfo.price > 0 && (
                <span className="flex items-center gap-1 font-medium" style={{ color: accent }}>
                  <span className="material-icons text-sm">payments</span>
                  {formatCents(pageInfo.price)}{pageInfo.priceLabel ? ` ${pageInfo.priceLabel}` : ''}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Step indicator */}
        {showSteps && step !== 'confirmed' && (
          <div className="flex items-center justify-center gap-2 mb-6">
            {stepList.map((s, i) => {
              const currentIdx = stepList.indexOf(step);
              const isActive = i <= currentIdx;
              return (
                <div key={s} className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                      isActive ? 'text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                    }`}
                    style={isActive ? { backgroundColor: accent } : undefined}
                    title={stepLabels[s]}
                  >
                    {i < currentIdx
                      ? <span className="material-icons text-sm">check</span>
                      : i + 1}
                  </div>
                  {i < stepList.length - 1 && (
                    <div className="w-6 h-0.5 bg-gray-200 dark:bg-gray-800 rounded" />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Step: Date */}
        {step === 'date' && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-5" style={cardStyle}>
            <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4" style={textColor ? { color: textColor } : undefined}>Select a date</h2>
            <div className="flex items-center justify-between mb-4">
              <button onClick={prevMonth} disabled={!canGoPrev}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <span className="material-icons">chevron_left</span>
              </button>
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {MONTH_NAMES[calMonth]} {calYear}
              </span>
              <button onClick={nextMonth}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors">
                <span className="material-icons">chevron_right</span>
              </button>
            </div>
            <div className="grid grid-cols-7 mb-1">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                <div key={d} className="text-center text-xs font-medium text-gray-400 dark:text-gray-500 py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = formatDate(new Date(calYear, calMonth, day));
                const available = isDateAvailable(calYear, calMonth, day);
                const isToday = calYear === today.getFullYear() && calMonth === today.getMonth() && day === today.getDate();
                return (
                  <button key={day} onClick={() => available && handleDateSelect(dateStr)} disabled={!available}
                    className={`h-10 rounded-lg text-sm font-medium transition-all ${available ? 'hover:shadow-sm cursor-pointer text-gray-900 dark:text-gray-100' : 'text-gray-300 dark:text-gray-700 cursor-not-allowed'} ${isToday ? 'ring-1 ring-gray-300 dark:ring-gray-600' : ''}`}
                    style={available ? { backgroundColor: accent + '10' } : undefined}
                    onMouseEnter={(e) => { if (available) e.currentTarget.style.backgroundColor = accent + '25'; }}
                    onMouseLeave={(e) => { if (available) e.currentTarget.style.backgroundColor = accent + '10'; }}
                  >{day}</button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step: Time */}
        {step === 'time' && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-5" style={cardStyle}>
            <div className="flex items-center justify-between mb-4">
              {backButton('date')}
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {selectedDate && new Date(selectedDate + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
              </span>
            </div>

            {/* Group size selector */}
            {pageInfo.maxGuests && pageInfo.maxGuests > 1 && (
              <div className="mb-4 flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Group size:</label>
                <div className="flex items-center gap-2">
                  <button onClick={() => setGroupSize(Math.max(1, groupSize - 1))} disabled={groupSize <= 1}
                    className="w-8 h-8 rounded-lg border border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 disabled:opacity-30">
                    <span className="material-icons text-sm">remove</span>
                  </button>
                  <span className="w-8 text-center text-sm font-medium">{groupSize}</span>
                  <button onClick={() => setGroupSize(groupSize + 1)}
                    className="w-8 h-8 rounded-lg border border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300">
                    <span className="material-icons text-sm">add</span>
                  </button>
                </div>
                {pageInfo.price > 0 && (
                  <span className="text-xs text-gray-400 ml-auto">
                    {formatCents(pageInfo.price * groupSize)}
                  </span>
                )}
              </div>
            )}

            {slotsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-300" style={{ borderTopColor: accent }} />
              </div>
            ) : slots.length === 0 ? (
              <div className="text-center py-12">
                <span className="material-icons text-3xl text-gray-300 dark:text-gray-600 mb-2 block">event_busy</span>
                <p className="text-sm text-gray-500 dark:text-gray-400">No available times on this day</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 max-h-80 overflow-y-auto">
                {slots.map((slot) => {
                  const capacityOk = !pageInfo.maxGuests || !slot.remainingCapacity || groupSize <= slot.remainingCapacity;
                  return (
                    <button key={slot.start}
                      onClick={() => capacityOk && handleSlotSelect(slot)}
                      disabled={!capacityOk}
                      className="px-3 py-2.5 rounded-lg text-sm font-medium border transition-all hover:shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ borderColor: accent + '40', color: accent, backgroundColor: accent + '08' }}
                      onMouseEnter={(e) => { if (capacityOk) { e.currentTarget.style.backgroundColor = accent; e.currentTarget.style.color = '#ffffff'; }}}
                      onMouseLeave={(e) => { if (capacityOk) { e.currentTarget.style.backgroundColor = accent + '08'; e.currentTarget.style.color = accent; }}}
                    >
                      <div>{slot.display}</div>
                      {slot.remainingCapacity !== null && (
                        <div className="text-[10px] opacity-70 mt-0.5">
                          {slot.remainingCapacity} spot{slot.remainingCapacity !== 1 ? 's' : ''} left
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Step: Add-ons */}
        {step === 'addons' && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-5" style={cardStyle}>
            <div className="flex items-center justify-between mb-4">
              {backButton('time')}
              <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">Add extras</h2>
            </div>

            <div className="space-y-3 mb-4">
              {addOns.map((addOn) => {
                const qty = selectedAddOns[addOn.id] || 0;
                return (
                  <div key={addOn.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                    {addOn.image && (
                      <img src={addOn.image} alt={addOn.name || ''} className="w-12 h-12 rounded-lg object-cover" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{addOn.name}</p>
                      {addOn.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{addOn.description}</p>
                      )}
                      <p className="text-xs font-medium mt-0.5" style={{ color: accent }}>{formatCents(addOn.price)}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setSelectedAddOns(prev => ({ ...prev, [addOn.id]: Math.max(0, (prev[addOn.id] || 0) - 1) }))}
                        disabled={qty === 0}
                        className="w-7 h-7 rounded-md border border-gray-300 dark:border-gray-600 flex items-center justify-center disabled:opacity-30"
                      >
                        <span className="material-icons text-sm">remove</span>
                      </button>
                      <span className="w-6 text-center text-sm font-medium">{qty}</span>
                      <button
                        onClick={() => setSelectedAddOns(prev => ({ ...prev, [addOn.id]: Math.min(addOn.maxQuantity, (prev[addOn.id] || 0) + 1) }))}
                        disabled={qty >= addOn.maxQuantity}
                        className="w-7 h-7 rounded-md border border-gray-300 dark:border-gray-600 flex items-center justify-center disabled:opacity-30"
                      >
                        <span className="material-icons text-sm">add</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Running total */}
            {hasPricing && (
              <div className="text-right text-sm text-gray-500 dark:text-gray-400 mb-3">
                Subtotal: <span className="font-medium text-gray-900 dark:text-gray-100">{formatCents(pricing.subtotal)}</span>
              </div>
            )}

            <button
              onClick={() => setStep('info')}
              className="w-full py-3 rounded-xl font-medium transition-all hover:shadow-md"
              style={{ backgroundColor: btnBg, color: btnText, ...(btnRadius ? { borderRadius: btnRadius } : {}) }}
            >
              Continue
            </button>
          </div>
        )}

        {/* Step: Info */}
        {step === 'info' && selectedSlot && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-5" style={cardStyle}>
            <div className="flex items-center justify-between mb-4">
              {backButton(pageInfo.enableAddOns && addOns.length > 0 ? 'addons' : 'time')}
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {new Date(selectedSlot.start).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {selectedSlot.display} ({pageInfo.duration} min)
                  {groupSize > 1 && ` / ${groupSize} guests`}
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name <span className="text-red-500">*</span></label>
                <input type="text" required value={guestName} onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{ '--tw-ring-color': accent + '50', ...inputFieldStyle } as React.CSSProperties}
                  disabled={submitting} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email <span className="text-red-500">*</span></label>
                <input type="email" required value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{ '--tw-ring-color': accent + '50', ...inputFieldStyle } as React.CSSProperties}
                  disabled={submitting} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="tel" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{ '--tw-ring-color': accent + '50', ...inputFieldStyle } as React.CSSProperties}
                  disabled={submitting} />
              </div>

              {/* Custom questions */}
              {pageInfo.questions.map((q) => (
                <div key={q.id}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {q.label}{q.required && <span className="text-red-500"> *</span>}
                  </label>
                  {q.type === 'text' && (
                    <input type="text" required={q.required} value={answers[q.id] || ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                      className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent"
                      style={{ '--tw-ring-color': accent + '50', ...inputFieldStyle } as React.CSSProperties} disabled={submitting} />
                  )}
                  {q.type === 'textarea' && (
                    <textarea required={q.required} value={answers[q.id] || ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} rows={3}
                      className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent resize-none"
                      style={{ '--tw-ring-color': accent + '50', ...inputFieldStyle } as React.CSSProperties} disabled={submitting} />
                  )}
                  {q.type === 'select' && (
                    <select required={q.required} value={answers[q.id] || ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                      className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:border-transparent"
                      style={{ '--tw-ring-color': accent + '50', ...inputFieldStyle } as React.CSSProperties} disabled={submitting}>
                      <option value="">Select...</option>
                      {(q.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  )}
                </div>
              ))}

              {/* Discount code */}
              {pageInfo.enableDiscountCodes && hasPricing && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Discount code</label>
                  <div className="flex gap-2">
                    <input type="text" value={discountCode} onChange={(e) => setDiscountCode(e.target.value)}
                      placeholder="Enter code" disabled={!!discountResult}
                      className="flex-1 px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent text-sm"
                      style={{ '--tw-ring-color': accent + '50', ...inputFieldStyle } as React.CSSProperties} />
                    {discountResult ? (
                      <button type="button" onClick={() => { setDiscountResult(null); setDiscountCode(''); }}
                        className="px-3 py-2 rounded-xl text-sm border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300">
                        Clear
                      </button>
                    ) : (
                      <button type="button" onClick={validateDiscount} disabled={!discountCode.trim()}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                        style={{ backgroundColor: accent }}>
                        Apply
                      </button>
                    )}
                  </div>
                  {discountError && <p className="text-xs text-red-500 mt-1">{discountError}</p>}
                  {discountResult && (
                    <p className="text-xs mt-1" style={{ color: accent }}>
                      <span className="material-icons text-sm align-middle mr-0.5">check_circle</span>
                      {discountResult.code} applied ({discountResult.discountType === 'percent' ? `${discountResult.amount / 100}% off` : `${formatCents(discountResult.amount)} off`})
                    </p>
                  )}
                </div>
              )}

              {/* Gift certificate */}
              {pageInfo.enableGiftCertificates && hasPricing && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Gift certificate</label>
                  <div className="flex gap-2">
                    <input type="text" value={giftCertCode} onChange={(e) => setGiftCertCode(e.target.value)}
                      placeholder="CERT-XXXXXX" disabled={!!giftCertResult}
                      className="flex-1 px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent text-sm"
                      style={{ '--tw-ring-color': accent + '50', ...inputFieldStyle } as React.CSSProperties} />
                    {giftCertResult ? (
                      <button type="button" onClick={() => { setGiftCertResult(null); setGiftCertCode(''); }}
                        className="px-3 py-2 rounded-xl text-sm border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300">
                        Clear
                      </button>
                    ) : (
                      <button type="button" onClick={validateGiftCert} disabled={!giftCertCode.trim()}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                        style={{ backgroundColor: accent }}>
                        Apply
                      </button>
                    )}
                  </div>
                  {giftCertError && <p className="text-xs text-red-500 mt-1">{giftCertError}</p>}
                  {giftCertResult && (
                    <p className="text-xs mt-1" style={{ color: accent }}>
                      <span className="material-icons text-sm align-middle mr-0.5">check_circle</span>
                      Certificate applied (balance: {formatCents(giftCertResult.remainingAmount)})
                    </p>
                  )}
                </div>
              )}

              {/* Order summary */}
              {hasPricing && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 space-y-1.5 text-sm">
                  <div className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>{pageInfo.price > 0 ? `${formatCents(pageInfo.price)} x ${groupSize}` : 'Booking'}</span>
                    <span>{formatCents((pageInfo.price || 0) * groupSize)}</span>
                  </div>
                  {pricing.addOnTotal > 0 && (
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>Add-ons</span>
                      <span>{formatCents(pricing.addOnTotal)}</span>
                    </div>
                  )}
                  {pricing.discount > 0 && (
                    <div className="flex justify-between" style={{ color: accent }}>
                      <span>Discount</span>
                      <span>-{formatCents(pricing.discount)}</span>
                    </div>
                  )}
                  {pricing.giftCert > 0 && (
                    <div className="flex justify-between" style={{ color: accent }}>
                      <span>Gift certificate</span>
                      <span>-{formatCents(pricing.giftCert)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold text-gray-900 dark:text-gray-100 pt-1.5 border-t border-gray-200 dark:border-gray-700">
                    <span>Total</span>
                    <span>{pricing.total === 0 ? 'Free' : formatCents(pricing.total)}</span>
                  </div>
                </div>
              )}

              <button type="submit" disabled={submitting || !guestName.trim() || !guestEmail.trim()}
                className="w-full py-3 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-md"
                style={{ backgroundColor: btnBg, color: btnText, ...(btnRadius ? { borderRadius: btnRadius } : {}) }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}>
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/30" style={{ borderTopColor: '#ffffff' }} />
                    {pricing.total > 0 ? 'Processing...' : 'Booking...'}
                  </span>
                ) : (
                  pricing.total > 0 ? `Pay ${formatCents(pricing.total)}` : 'Confirm Booking'
                )}
              </button>
            </form>
          </div>
        )}

        {/* Step: Payment (Stripe) */}
        {step === 'payment' && bookingResult?.clientSecret && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-5" style={cardStyle}>
            <div className="text-center mb-4">
              <span className="material-icons text-3xl mb-2" style={{ color: accent }}>lock</span>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Complete Payment</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Total: <span className="font-semibold" style={{ color: accent }}>{formatCents(bookingResult.total || 0)}</span>
              </p>
            </div>
            <BookingPaymentForm
              clientSecret={bookingResult.clientSecret}
              total={bookingResult.total || 0}
              accent={accent}
              btnBg={btnBg}
              btnText={btnText}
              btnRadius={btnRadius}
              onSuccess={() => setStep('confirmed')}
              onError={(msg) => setSubmitError(msg)}
            />
          </div>
        )}

        {/* Step: Confirmed */}
        {step === 'confirmed' && selectedSlot && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-8 text-center" style={cardStyle}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: accent + '15' }}>
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
                  {new Date(selectedSlot.start).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="material-icons text-gray-400 text-lg">schedule</span>
                <span className="text-sm text-gray-900 dark:text-gray-100">
                  {selectedSlot.display} - {new Date(selectedSlot.end).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} ({pageInfo.duration} min)
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="material-icons text-gray-400 text-lg">person</span>
                <span className="text-sm text-gray-900 dark:text-gray-100">
                  {guestName}{groupSize > 1 ? ` (${groupSize} guests)` : ''}
                </span>
              </div>
              {pricing.total > 0 && (
                <div className="flex items-center gap-3">
                  <span className="material-icons text-gray-400 text-lg">receipt</span>
                  <span className="text-sm text-gray-900 dark:text-gray-100">{formatCents(pricing.total)} paid</span>
                </div>
              )}
              {meetingLink && (
                <div className="flex items-center gap-3">
                  <span className="material-icons text-gray-400 text-lg">videocam</span>
                  <a href={meetingLink} target="_blank" rel="noopener noreferrer"
                    className="text-sm font-medium hover:underline" style={{ color: accent }}>
                    Join Video Call
                  </a>
                </div>
              )}
              {bookingResult?.checkinCode && (
                <div className="flex items-center gap-3">
                  <span className="material-icons text-gray-400 text-lg">qr_code_2</span>
                  <span className="text-sm text-gray-900 dark:text-gray-100">
                    Check-in code: <span className="font-mono font-bold">{bookingResult.checkinCode}</span>
                  </span>
                </div>
              )}
            </div>

            {meetingLink && (
              <a href={meetingLink} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-4 px-6 py-3 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: accent }}>
                <span className="material-icons text-lg">videocam</span>
                Join Video Call
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
