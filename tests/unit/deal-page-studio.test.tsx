// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { stageSteps } from '@/app/portal/crm/deals/_lib/stepper';
import type { Stage } from '@/app/portal/crm/deals/_lib/types';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => true }));
vi.mock('@/app/portal/crm/deals/_lib/api', () => ({
  fetchPipelines: vi.fn(async () => [{ id: 1, name: 'Sales', stages: [
    { id: 10, name: 'Lead', color: null, probability: 10, order: 1 }, { id: 11, name: 'Qualified', color: null, probability: 30, order: 2 },
    { id: 12, name: 'Proposal', color: null, probability: 60, order: 3 }, { id: 13, name: 'Won', color: null, probability: 100, order: 4 } ] }]),
  fetchArtifacts: vi.fn(async () => [
    { id: 5, dealId: 7, artifactType: 'proposal', artifactId: 3, displayTitle: 'Retreat proposal', pinned: true, createdAt: '2026-08-20T00:00:00Z' },
    { id: 6, dealId: 7, artifactType: 'pitch_deck', artifactId: 4, displayTitle: 'Retreat deck', pinned: false, createdAt: '2026-08-21T00:00:00Z' },
  ]),
  fetchAvailableArtifacts: vi.fn(async () => [{ type: 'proposal', id: 9, title: 'MSA' }]),
  fetchComments: vi.fn(async () => [{ id: 1, dealId: 7, authorId: 1, authorName: 'Sam Ortiz', body: 'Worth a call.', attachments: [], parentCommentId: null, createdAt: new Date().toISOString() }]),
  moveDealStage: vi.fn(async () => ({ success: true })),
  addArtifact: vi.fn(async () => ({ success: true })),
  updateArtifactPin: vi.fn(async () => ({ success: true })),
  removeArtifact: vi.fn(async () => ({ success: true })),
  postComment: vi.fn(async () => new Response('{}')),
  deleteDeal: vi.fn(async () => ({ success: true })),
}));
import * as api from '@/app/portal/crm/deals/_lib/api';
import DealPage from '@/app/portal/crm/deals/[id]/_components/DealPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const stages: Stage[] = [{ id: 2, name: 'B', color: null, probability: 50, order: 2 }, { id: 1, name: 'A', color: null, probability: 10, order: 1 }, { id: 3, name: 'C', color: null, probability: 90, order: 3 }];

describe('PUX-172 a deal as a page', () => {
  it('stageSteps orders by `order` and marks done / current / todo', () => {
    expect(stageSteps(stages, 2).map((s) => `${s.stage.name}:${s.state}`)).toEqual(['A:done', 'B:current', 'C:todo']);
    expect(stageSteps(stages, 99).every((s) => s.state === 'todo')).toBe(true);
  });

  it('renders the stepper header, pinned-first artifacts with the one teal Add, comments and stage probability; a step click moves the stage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ success: true, data: {
      id: 7, title: 'Summit Bank retreat', value: 1840000, status: 'open', priority: 'high', expectedCloseDate: '2026-09-12T00:00:00Z', contactId: 3, contactName: 'Jordan Whitfield',
      companyId: 2, companyName: 'Summit Bank', stageId: 12, pipelineId: 1, notes: null, ownerId: 1, ownerName: 'Marta', recurringValue: null, billingCycle: null, createdAt: '2026-08-01T00:00:00Z',
    } }) })));
    const { container } = render(<DealPage id={7} />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Summit Bank retreat' })).toBeTruthy());
    const current = container.querySelector('[aria-current="step"]');
    expect(current?.textContent).toContain('Proposal');
    expect(current?.className).toContain('bg-primary');
    const teal = Array.from(container.querySelectorAll('button')).filter((b) => b.className.includes('bg-primary') && !b.hasAttribute('aria-current'));
    expect(teal.map((b) => b.textContent)).toEqual(['addAdd artifact']);
    const rows = container.querySelectorAll('section ul li');
    expect(rows[0].textContent).toContain('Retreat proposal');
    expect(rows[0].querySelector('button')?.className).toContain('studio-gold-ink'); // pinned
    expect(screen.getByText('Worth a call.')).toBeTruthy();
    expect(container.textContent).toContain('60%');
    fireEvent.click(screen.getByRole('button', { name: /Won/ }));
    await waitFor(() => expect(vi.mocked(api.moveDealStage)).toHaveBeenCalledWith(7, 13));
  });
});
