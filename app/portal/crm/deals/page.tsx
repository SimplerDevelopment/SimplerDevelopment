'use client';

import { useState } from 'react';
import DealDetailDrawer from './_components/DealDetailDrawer';
import DealFilters from './_components/DealFilters';
import DealKanban from './_components/DealKanban';
import NewDealModal from './_components/NewDealModal';
import { useDeals } from './_hooks/useDeals';
import type { Company, Contact, Deal, DealFormState } from './_lib/types';

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
 */
export default function CrmDealsPage() {
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
      <div className="bg-card border border-border rounded-xl p-12 text-center">
        <span className="material-icons text-4xl text-muted-foreground mb-3 block">view_column</span>
        <p className="text-muted-foreground mb-2">No pipelines set up yet.</p>
        <p className="text-sm text-muted-foreground mb-4">Create a pipeline in CRM Settings to get started.</p>
        <a
          href="/portal/crm/settings"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
        >
          <span className="material-icons text-base">settings</span>
          Go to Settings
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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

      <DealKanban
        stages={stages}
        deals={deals}
        loading={dealsLoading}
        onMoveDeal={moveDeal}
        onOpenDeal={setEditingDeal}
      />

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
