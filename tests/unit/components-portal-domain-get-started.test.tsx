// @vitest-environment jsdom
/**
 * Unit tests for DomainGetStarted (OBQA-025).
 *
 * Covers the two client-side defects that are fixable/pinnable without a
 * real DB or browser:
 *   1. Slow load: the status fetch must be scoped to the mounted domain via
 *      `?domain=`, not the un-scoped endpoint that computes every entitled
 *      domain's steps.
 *   3. project-create doesn't flip the step: the card must refetch its
 *      status when notifyOnboardingProgress(domainKey) fires — the signal an
 *      inline same-page create (e.g. /portal/projects' "New Project" form)
 *      sends since the card never remounts to see the change on its own.
 *
 * (Defect 2 — premature dismissal — is fixed by swapping the action's plain
 * `<a>` for next/link's `Link` so opening a pending step doesn't force a full
 * page reload; that's a navigation-behavior change with no observable jsdom
 * signal to pin here, verified by reading the diff instead.)
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { notifyOnboardingProgress } from '@/lib/onboarding/client-events';

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; [key: string]: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}));

import DomainGetStarted from '@/components/portal/onboarding/DomainGetStarted';

interface StatusStep {
  key: string;
  done: boolean;
  preCredited: boolean;
  counted: boolean;
}

function projectsStatus(hasProject: boolean) {
  const steps: StatusStep[] = [
    { key: 'enabled', done: true, preCredited: true, counted: true },
    { key: 'create-project', done: hasProject, preCredited: false, counted: true },
    { key: 'check-tasks', done: false, preCredited: false, counted: false },
  ];
  const counted = steps.filter((s) => s.counted);
  const done = counted.filter((s) => s.done).length;
  return { steps, done, total: counted.length, complete: done >= counted.length };
}

function makeFetchMock(getStatus: () => ReturnType<typeof projectsStatus>) {
  return vi.fn((url: unknown) => {
    const u = String(url);
    if (u.includes('/api/portal/onboarding/status')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true, data: { domains: { projects: getStatus() } } }),
      });
    }
    if (u.includes('/api/portal/onboarding')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true, data: { answers: { dismissedDomains: [] } } }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({ success: false }) });
  });
}

describe('DomainGetStarted', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches status scoped to its own domain (?domain=<key>), not the unscoped endpoint', async () => {
    const fetchMock = makeFetchMock(() => projectsStatus(false));
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<DomainGetStarted domainKey="projects" />);

    await waitFor(() => {
      const statusCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/portal/onboarding/status'));
      expect(statusCall).toBeDefined();
      expect(String(statusCall![0])).toBe('/api/portal/onboarding/status?domain=projects');
    });
  });

  it('shows "Create your first project" as pending before the project exists', async () => {
    global.fetch = makeFetchMock(() => projectsStatus(false)) as unknown as typeof fetch;

    render(<DomainGetStarted domainKey="projects" />);

    await waitFor(() => expect(screen.getByText('1 of 2 steps complete')).toBeTruthy());
    expect(screen.getByRole('link', { name: /Open Create your first project/ })).toBeTruthy();
  });

  it('refetches and picks up the flipped step when notifyOnboardingProgress fires for this domain (defect 3)', async () => {
    let hasProject = false;
    const fetchMock = makeFetchMock(() => projectsStatus(hasProject));
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<DomainGetStarted domainKey="projects" />);
    await waitFor(() => expect(screen.getByText('1 of 2 steps complete')).toBeTruthy());
    const statusCallsBefore = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/status')).length;

    // Simulate the inline "New Project" form on /portal/projects succeeding —
    // it never navigates, so this event is the only thing that tells the
    // already-mounted card to look again. Both of the projects segment's
    // counted steps ('enabled' + 'create-project') are now done, so the
    // domain reads complete and the card correctly auto-hides — that
    // disappearance is the proof the refetch happened and picked up the
    // flip; before this fix the card just kept showing the stale "1 of 2".
    hasProject = true;
    act(() => { notifyOnboardingProgress('projects'); });

    await waitFor(() => expect(screen.queryByTestId('get-started-checklist')).toBeNull());
    const statusCallsAfter = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/status')).length;
    expect(statusCallsAfter).toBeGreaterThan(statusCallsBefore);
  });

  it('does NOT refetch on a notifyOnboardingProgress for a different domain', async () => {
    const getStatus = vi.fn(() => projectsStatus(false));
    const fetchMock = makeFetchMock(getStatus);
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<DomainGetStarted domainKey="projects" />);
    await waitFor(() => expect(screen.getByText('1 of 2 steps complete')).toBeTruthy());

    const callsBefore = fetchMock.mock.calls.length;
    act(() => { notifyOnboardingProgress('crm'); });

    // Give any (incorrect) refetch a tick to happen, then assert it didn't.
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });
});
