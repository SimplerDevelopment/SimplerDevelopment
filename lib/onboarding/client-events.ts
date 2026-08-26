// Tiny client-side pub/sub for "an onboarding-tracked action just happened
// on this page" (OBQA-025). DomainGetStarted only fetches its status once on
// mount — an in-page action that satisfies a step's detection query (e.g.
// creating a project via the inline form on /portal/projects, which never
// navigates away) has no other way to tell the mounted card to refetch, so
// the step visibly stays "pending" until a full remount. This module is the
// signal; callers `notify()` right after a successful create, DomainGetStarted
// `subscribe()`s and refetches.
//
// Plain window CustomEvent rather than a React context: the emitting page
// (app/portal/projects/page.tsx) and the card (DomainGetStarted, mounted at
// the top of that same page) don't share a component tree edge worth wiring
// a provider for, and this needs to scale to other domains' create flows
// later without new plumbing per page.

const EVENT_NAME = 'sd:onboarding-progress';

interface OnboardingProgressDetail {
  /** Domain key whose detection just changed, e.g. 'projects'. Omit to signal "any". */
  domainKey?: string;
}

/** Call right after a create/action that a step's `detect` query would now see. */
export function notifyOnboardingProgress(domainKey?: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<OnboardingProgressDetail>(EVENT_NAME, { detail: { domainKey } }),
  );
}

/** Subscribe to progress notifications for one domain (or all, if omitted). Returns an unsubscribe fn. */
export function subscribeOnboardingProgress(domainKey: string, onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<OnboardingProgressDetail>).detail;
    if (!detail?.domainKey || detail.domainKey === domainKey) onChange();
  };
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
