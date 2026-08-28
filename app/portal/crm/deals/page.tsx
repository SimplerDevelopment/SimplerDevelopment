'use client';

import { useFeatureFlag } from '@/components/portal/FeatureFlagsProvider';
import { formatMoney } from '@/lib/utils/money';
import DealsTable from './_components/DealsTable';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import DealDetailDrawer from './_components/DealDetailDrawer';
import DealFilters from './_components/DealFilters';
import DealKanban from './_components/DealKanban';
import NewDealModal from './_components/NewDealModal';
import { useDeals } from './_hooks/useDeals';
import type { Company, Contact, Deal, DealFormState } from './_lib/types';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pCard } from '@/components/portal/portal-ui';

const EMPTY_FORM: DealFormState = {
  title: '',
  value: '',
  contactId: '',
  companyId: '',
  pipelineId: '',
  stageId: '',
  priority: 'medium',
  expectedCloseDate: '',
  notes: '',
};

/**
 * /portal/crm/deals — kanban board for CRM deals.
 *
 * Orchestrates four extracted modules:
 *   - useDeals       (hook)        — pipelines + deals + contacts + companies state
 *   - DealFilters    (component)   — pipeline picker, status buttons, custom-field filters
 *   - NewDealModal   (component)   — inline "New Deal" form
 *   - DealKanban     (component)   — drag-and-drop board
 *   - DealDetailDrawer (component) — slide-over with Details / Artifacts / Comments tabs
 *
 * Behavior is identical to the pre-refactor 1.4k-LOC implementation; the
 * `tests/e2e/portal-crm-deals-baseline.spec.ts` spec locks that contract in.
 *
 * Supports an additive `?dealId=` deep link (e.g. from the company detail
 * page's Deals tab) that opens that deal's drawer on load.
 */
function CrmDealsContent() {
  const searchParams = useSearchParams();
  const dealId = searchParams.get('dealId');

  const {
    pipelines,
    selectedPipelineId,
    setSelectedPipelineId,
    deals,
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
  } = useDeals();

  const [showForm, setShowForm] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  // PUX-171 (design doc screen 30): Board | Table, stale pills, one teal New deal. Flag off is today's page.
  const studio = useFeatureFlag('portal-redesign');
  const [view, setView] = useState<'board' | 'table'>('board');
  const openDeals = deals.filter((d) => d.status === 'open');

  useEffect(() => {
    if (!dealId) return;
    if (editingDeal?.id === Number(dealId)) return;
    fetch(`/api/portal/crm/deals/${dealId}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setEditingDeal(json.data);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId]);

  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId);
  const stages = selectedPipeline?.stages?.slice().sort((a, b) => a.order - b.order) ?? [];

  function handleCompanyCreated(c: Company) {
    setCompanies((prev) => [c, ...prev]);
  }

  function handleContactCreated(c: Contact) {
    setContacts((prev) => [c, ...prev]);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    );
  }

  if (pipelines.length === 0) {
    return (
      <div className={`${pCard} p-12 text-center`}>
        <span className="material-icons text-4xl text-muted-foreground mb-3 block">view_column</span>
        <p className="text-muted-foreground mb-2">No pipelines set up yet.</p>
        <p className="text-sm text-muted-foreground mb-4">Create a pipeline in CRM Settings to get started.</p>
        <a
          href="/portal/crm/settings"
          className={pBtnPrimary}
        >
          <span className="material-icons text-base">settings</span>
          Go to Settings
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PortalPageHeader
        eyebrow={studio ? 'Grow · CRM' : 'CRM'}
        title="Deals"
        subtitle={studio ? `${openDeals.length} open · ${formatMoney(openDeals.reduce((sum, d) => sum + d.value, 0))} pipeline` : 'Manage your sales pipeline'}
        actions={studio ? (
          <div className="inline-flex rounded-[9px] border border-border p-0.5 text-[12.5px] font-semibold" role="group" aria-label="View">
            {(['board', 'table'] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`rounded-[7px] px-3 py-1 capitalize transition-colors ${view === v ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}>
                {v}
              </button>
            ))}
          </div>
        ) : undefined}
      />
      <DealFilters
        pipelines={pipelines}
        selectedPipelineId={selectedPipelineId}
        onSelectPipeline={setSelectedPipelineId}
        statusFilter={statusFilter}
        onChangeStatus={setStatusFilter}
        customFilters={customFilters}
        onChangeCustomFilters={setCustomFilters}
        showForm={showForm}
        onToggleForm={() => setShowForm((s) => !s)}
        studio={studio}
      />

      {showForm && (
        <NewDealModal
          pipelines={pipelines}
          selectedPipelineId={selectedPipelineId}
          contacts={contacts}
          companies={companies}
          initialForm={{
            ...EMPTY_FORM,
            pipelineId: String(selectedPipelineId ?? ''),
            stageId: String(stages[0]?.id ?? ''),
          }}
          onCompanyCreated={handleCompanyCreated}
          onContactCreated={handleContactCreated}
          onCreated={() => {
            setShowForm(false);
            fetchDeals();
          }}
        />
      )}

      {studio && view === 'table' ? (
        <DealsTable stages={stages} deals={deals} onOpenDeal={setEditingDeal} />
      ) : (
        <DealKanban
          stages={stages}
          deals={deals}
          loading={dealsLoading}
          onMoveDeal={moveDeal}
          onOpenDeal={setEditingDeal}
          studio={studio}
        />
      )}

      {editingDeal && (
        <DealDetailDrawer
          deal={editingDeal}
          pipelines={pipelines}
          contacts={contacts}
          onCompanyCreated={handleCompanyCreated}
          onContactCreated={handleContactCreated}
          onSaved={() => {
            setEditingDeal(null);
            fetchDeals();
          }}
          onDeleted={() => {
            setEditingDeal(null);
            fetchDeals();
          }}
          onClose={() => setEditingDeal(null)}
        />
      )}
    </div>
  );
}

export default function CrmDealsPage() {
  return (
    <Suspense fallback={null}>
      <CrmDealsContent />
    </Suspense>
  );
}
