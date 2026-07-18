/**
 * `useBookingPage` — single source of truth for the booking-page editor.
 *
 * Owns:
 *   - the loaded `BookingPageData` and the form-mirrored field state
 *   - bookings list, page members, team members, branding profiles
 *   - the save / delete / cancel-booking / member CRUD action surface
 *
 * The page component composes panel components and passes slices of this
 * state in. Keeping all I/O here means each panel is presentational and
 * unit-testable without mocking fetch.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import * as api from '../_lib/api';
import type {
  BookingPageData,
  Booking,
  PageMember,
  TeamMember,
  BrandingProfileSummary,
  AvailabilitySlot,
  BookingQuestion,
  StylingMap,
} from '../_lib/types';

interface UseBookingPageResult {
  // Loaded data
  page: BookingPageData | null;
  loading: boolean;
  error: string;
  setError: (msg: string) => void;

  // Form fields
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  duration: number;
  setDuration: (v: number) => void;
  color: string;
  setColor: (v: string) => void;
  brandingProfileId: number | null;
  setBrandingProfileId: (v: number | null) => void;
  brandingProfiles: BrandingProfileSummary[];
  bufferBefore: number;
  setBufferBefore: (v: number) => void;
  bufferAfter: number;
  setBufferAfter: (v: number) => void;
  maxAdvanceDays: number;
  setMaxAdvanceDays: (v: number) => void;
  minNoticeMins: number;
  setMinNoticeMins: (v: number) => void;
  timezone: string;
  setTimezone: (v: string) => void;
  active: boolean;
  setActive: (v: boolean) => void;
  conferenceType: string;
  setConferenceType: (v: string) => void;
  availability: AvailabilitySlot[];
  setAvailability: React.Dispatch<React.SetStateAction<AvailabilitySlot[]>>;
  questions: BookingQuestion[];
  setQuestions: React.Dispatch<React.SetStateAction<BookingQuestion[]>>;
  styling: StylingMap;
  setStyling: React.Dispatch<React.SetStateAction<StylingMap>>;
  thumbnail: string;
  setThumbnail: (v: string) => void;
  allowStaffSelection: boolean;
  setAllowStaffSelection: (v: boolean) => void;
  // Monetization
  price: number | null;
  setPrice: (v: number | null) => void;
  priceLabel: string;
  setPriceLabel: (v: string) => void;
  enableAddOns: boolean;
  setEnableAddOns: (v: boolean) => void;
  enableGiftCertificates: boolean;
  setEnableGiftCertificates: (v: boolean) => void;
  enableDiscountCodes: boolean;
  setEnableDiscountCodes: (v: boolean) => void;
  enableWaivers: boolean;
  setEnableWaivers: (v: boolean) => void;
  waiverContent: string;
  setWaiverContent: (v: string) => void;
  requireWaiverBeforeBooking: boolean;
  setRequireWaiverBeforeBooking: (v: boolean) => void;
  // Round-robin / group bookings
  assignmentMode: 'fixed' | 'round_robin' | 'fewest_upcoming';
  setAssignmentMode: (v: 'fixed' | 'round_robin' | 'fewest_upcoming') => void;
  roundRobinPool: { userId: number; weight: number }[];
  setRoundRobinPool: React.Dispatch<React.SetStateAction<{ userId: number; weight: number }[]>>;
  bookingType: 'individual' | 'group';
  setBookingType: (v: 'individual' | 'group') => void;
  groupCapacity: number | null;
  setGroupCapacity: (v: number | null) => void;

  // Bookings list
  bookingsList: Booking[];
  refreshBookings: () => Promise<void>;
  cancelBooking: (bookingId: number) => Promise<void>;
  reassignBooking: (bookingId: number, userId: number | null) => Promise<void>;

  // Members
  pageMembers: PageMember[];
  teamMembers: TeamMember[];
  staffLoading: boolean;
  refreshMembers: () => Promise<void>;

  // Save/delete
  saving: boolean;
  saved: boolean;
  save: () => Promise<void>;
  remove: () => Promise<boolean>;
}

export function useBookingPage(id: string): UseBookingPageResult {
  const [page, setPage] = useState<BookingPageData | null>(null);
  const [bookingsList, setBookingsList] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Form state mirrors the loaded page; kept separate so the user can edit
  // before saving without trampling the canonical record.
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(30);
  const [color, setColor] = useState('#2563eb');
  const [brandingProfileId, setBrandingProfileId] = useState<number | null>(null);
  const [brandingProfiles, setBrandingProfiles] = useState<BrandingProfileSummary[]>([]);
  const [bufferBefore, setBufferBefore] = useState(0);
  const [bufferAfter, setBufferAfter] = useState(15);
  const [maxAdvanceDays, setMaxAdvanceDays] = useState(60);
  const [minNoticeMins, setMinNoticeMins] = useState(60);
  const [timezone, setTimezone] = useState('America/New_York');
  const [active, setActive] = useState(true);
  const [conferenceType, setConferenceType] = useState('none');
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [questions, setQuestions] = useState<BookingQuestion[]>([]);
  const [styling, setStyling] = useState<StylingMap>({});
  const [thumbnail, setThumbnail] = useState('');
  const [allowStaffSelection, setAllowStaffSelection] = useState(false);
  // Monetization state
  const [price, setPrice] = useState<number | null>(null);
  const [priceLabel, setPriceLabel] = useState('');
  const [enableAddOns, setEnableAddOns] = useState(false);
  const [enableGiftCertificates, setEnableGiftCertificates] = useState(false);
  const [enableDiscountCodes, setEnableDiscountCodes] = useState(false);
  const [enableWaivers, setEnableWaivers] = useState(false);
  const [waiverContent, setWaiverContent] = useState('');
  const [requireWaiverBeforeBooking, setRequireWaiverBeforeBooking] = useState(false);
  const [assignmentMode, setAssignmentMode] = useState<'fixed' | 'round_robin' | 'fewest_upcoming'>('fixed');
  const [roundRobinPool, setRoundRobinPool] = useState<{ userId: number; weight: number }[]>([]);
  const [bookingType, setBookingType] = useState<'individual' | 'group'>('individual');
  const [groupCapacity, setGroupCapacity] = useState<number | null>(null);

  // Staff
  const [pageMembers, setPageMembers] = useState<PageMember[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);

  const fetchPage = useCallback(async () => {
    try {
      const data = await api.getBookingPage(id);
      if (data.success) {
        const p = data.data;
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
        // styling and thumbnail aren't in the typed shape but the API echoes
        // them through a JSON column. Keep the same untyped pull-through as
        // the original implementation.
        setStyling(((p as unknown as Record<string, unknown>).styling as StylingMap) || {});
        setThumbnail(((p as unknown as Record<string, unknown>).thumbnail as string) || '');
        setAllowStaffSelection(p.allowStaffSelection || false);
        // Monetization hydration
        setPrice(p.price ?? null);
        setPriceLabel(p.priceLabel || '');
        setEnableAddOns(p.enableAddOns || false);
        setEnableGiftCertificates(p.enableGiftCertificates || false);
        setEnableDiscountCodes(p.enableDiscountCodes || false);
        setEnableWaivers(p.enableWaivers || false);
        setWaiverContent(p.waiverContent || '');
        setRequireWaiverBeforeBooking(p.requireWaiverBeforeBooking || false);
        setAssignmentMode((p.assignmentMode as 'fixed' | 'round_robin' | 'fewest_upcoming') || 'fixed');
        setRoundRobinPool(Array.isArray(p.roundRobinPool) ? p.roundRobinPool : []);
        setBookingType((p.bookingType as 'individual' | 'group') || 'individual');
        setGroupCapacity(p.groupCapacity ?? null);
      } else {
        setError('Booking page not found');
      }
    } catch {
      setError('Failed to load booking page');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const refreshBookings = useCallback(async () => {
    try {
      const data = await api.listBookings(id);
      if (data.success) setBookingsList(data.data);
    } catch {
      /* ignore */
    }
  }, [id]);

  const refreshMembers = useCallback(async () => {
    setStaffLoading(true);
    try {
      const data = await api.listMembers(id);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pre-existing pattern, predates this change
    fetchPage();
    refreshBookings();
    refreshMembers();
    api
      .listBrandingProfiles()
      .then((d) => {
        if (d.success) setBrandingProfiles(d.data || []);
      })
      .catch(() => {});
  }, [fetchPage, refreshBookings, refreshMembers]);

  const save = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const data = await api.updateBookingPage(id, {
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
        price: price ?? null,
        priceLabel: priceLabel || null,
        enableAddOns,
        enableGiftCertificates,
        enableDiscountCodes,
        enableWaivers,
        waiverContent: waiverContent || null,
        requireWaiverBeforeBooking,
        assignmentMode,
        roundRobinPool: roundRobinPool.length > 0 ? roundRobinPool : null,
        bookingType,
        groupCapacity,
      });
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
  }, [
    id,
    title,
    description,
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
    thumbnail,
    allowStaffSelection,
    price,
    priceLabel,
    enableAddOns,
    enableGiftCertificates,
    enableDiscountCodes,
    enableWaivers,
    waiverContent,
    requireWaiverBeforeBooking,
    assignmentMode,
    roundRobinPool,
    bookingType,
    groupCapacity,
  ]);

  const remove = useCallback(async (): Promise<boolean> => {
    try {
      const data = await api.deleteBookingPage(id);
      if (data.success) return true;
      setError(data.message || 'Failed to delete');
      return false;
    } catch {
      setError('Failed to delete booking page');
      return false;
    }
  }, [id]);

  const cancelBooking = useCallback(
    async (bookingId: number) => {
      try {
        const data = await api.updateBooking(id, bookingId, { status: 'cancelled' });
        if (data.success) await refreshBookings();
      } catch {
        /* ignore */
      }
    },
    [id, refreshBookings],
  );

  const reassignBooking = useCallback(
    async (bookingId: number, userId: number | null) => {
      try {
        await api.updateBooking(id, bookingId, { assignedTo: userId });
        await refreshBookings();
      } catch {
        /* ignore */
      }
    },
    [id, refreshBookings],
  );

  return {
    page,
    loading,
    error,
    setError,
    title,
    setTitle,
    description,
    setDescription,
    duration,
    setDuration,
    color,
    setColor,
    brandingProfileId,
    setBrandingProfileId,
    brandingProfiles,
    bufferBefore,
    setBufferBefore,
    bufferAfter,
    setBufferAfter,
    maxAdvanceDays,
    setMaxAdvanceDays,
    minNoticeMins,
    setMinNoticeMins,
    timezone,
    setTimezone,
    active,
    setActive,
    conferenceType,
    setConferenceType,
    availability,
    setAvailability,
    questions,
    setQuestions,
    styling,
    setStyling,
    thumbnail,
    setThumbnail,
    allowStaffSelection,
    setAllowStaffSelection,
    price,
    setPrice,
    priceLabel,
    setPriceLabel,
    enableAddOns,
    setEnableAddOns,
    enableGiftCertificates,
    setEnableGiftCertificates,
    enableDiscountCodes,
    setEnableDiscountCodes,
    enableWaivers,
    setEnableWaivers,
    waiverContent,
    setWaiverContent,
    requireWaiverBeforeBooking,
    setRequireWaiverBeforeBooking,
    assignmentMode,
    setAssignmentMode,
    roundRobinPool,
    setRoundRobinPool,
    bookingType,
    setBookingType,
    groupCapacity,
    setGroupCapacity,
    bookingsList,
    refreshBookings,
    cancelBooking,
    reassignBooking,
    pageMembers,
    teamMembers,
    staffLoading,
    refreshMembers,
    saving,
    saved,
    save,
    remove,
  };
}
