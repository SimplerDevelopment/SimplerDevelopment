'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../_lib/api';
import type { Company, Contact, Deal, Pipeline } from '../_lib/types';

export interface UseDealsState {
  pipelines: Pipeline[];
  selectedPipelineId: number | null;
  setSelectedPipelineId: (id: number | null) => void;
  deals: Deal[];
  setDeals: React.Dispatch<React.SetStateAction<Deal[]>>;
  contacts: Contact[];
  setContacts: React.Dispatch<React.SetStateAction<Contact[]>>;
  companies: Company[];
  setCompanies: React.Dispatch<React.SetStateAction<Company[]>>;
  loading: boolean;
  dealsLoading: boolean;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  customFilters: Record<number, string>;
  setCustomFilters: (v: Record<number, string>) => void;
  fetchDeals: () => Promise<void>;
  /** Optimistic-update helper — flips a deal's stageId in local state and
   *  fires the API call. Used by the kanban drag-and-drop handler. */
  moveDeal: (dealId: number, newStageId: number) => Promise<void>;
}

/**
 * Owns the data layer for the deals page: pipelines + deals + contacts +
 * companies + filters + their fetch lifecycle. Returns setters for the
 * collections so child views (NewDealModal, drawer) can splice in newly
 * created records without a full refetch.
 */
export function useDeals(): UseDealsState {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<number | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('open');
  const [customFilters, setCustomFilters] = useState<Record<number, string>>({});
  // Synchronous mirror of `deals` for reading pre-move state inside the
  // async moveDeal (setState updaters don't run synchronously). Synced in an
  // effect, not during render (react-hooks/refs).
  const dealsRef = useRef<Deal[]>([]);
  useEffect(() => {
    dealsRef.current = deals;
  }, [deals]);
  // In-flight move guard, one entry per deal id.
  const movingRef = useRef<Set<number>>(new Set());

  // Initial load. We no longer bulk-fetch companies — the company pickers
  // inside NewDealModal/DealDetailDrawer use the typeahead endpoint
  // (?q=<query>) instead. `companies` here is just a local cache that grows
  // when the user inline-creates a company so the drawer/modal can render
  // the freshly-created option without an extra round-trip.
  useEffect(() => {
    Promise.all([api.fetchPipelines(), api.fetchContacts()]).then(
      ([p, c]) => {
        setPipelines(p);
        setContacts(c);
        if (p.length > 0) {
          setSelectedPipelineId(p[0].id);
        }
        setLoading(false);
      },
    );
  }, []);

  const fetchDeals = useCallback(async () => {
    if (!selectedPipelineId) return;
    setDealsLoading(true);
    const data = await api.fetchDeals({
      pipelineId: selectedPipelineId,
      status: statusFilter,
      customFilters,
    });
    setDeals(data);
    setDealsLoading(false);
  }, [selectedPipelineId, statusFilter, customFilters]);

  useEffect(() => {
    if (selectedPipelineId) fetchDeals();
  }, [selectedPipelineId, statusFilter, customFilters, fetchDeals]);

  const moveDeal = useCallback(async (dealId: number, newStageId: number) => {
    // One in-flight move per deal: concurrent drags would resolve out of
    // order and leave the board on the wrong stage.
    if (movingRef.current.has(dealId)) return;
    movingRef.current.add(dealId);
    const prevStage = dealsRef.current.find((d) => d.id === dealId)?.stageId ?? null;
    setDeals((prev) =>
      prev.map((d) => (d.id === dealId ? { ...d, stageId: newStageId } : d)),
    );
    try {
      const res = await api.moveDealStage(dealId, newStageId);
      if (!res.success) throw new Error(res.message ?? 'Move failed');
    } catch (err) {
      // Roll back so the board never shows a stage the server rejected.
      if (prevStage !== null) {
        setDeals((prev) =>
          prev.map((d) => (d.id === dealId ? { ...d, stageId: prevStage } : d)),
        );
      }
      console.error('[deals] moveDeal failed, rolled back:', err);
    } finally {
      movingRef.current.delete(dealId);
    }
  }, []);

  return {
    pipelines,
    selectedPipelineId,
    setSelectedPipelineId,
    deals,
    setDeals,
    contacts,
    setContacts,
    companies,
    setCompanies,
    loading,
    dealsLoading,
    statusFilter,
    setStatusFilter,
    customFilters,
    setCustomFilters,
    fetchDeals,
    moveDeal,
  };
}
