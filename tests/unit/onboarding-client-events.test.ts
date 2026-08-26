// @vitest-environment jsdom
/**
 * Unit tests for lib/onboarding/client-events.ts — the pub/sub DomainGetStarted
 * uses to refetch its step status after an in-page create action (OBQA-025
 * defect 3: "creating a new project did not complete the task" — the card
 * only ever fetched status once on mount, so an inline create on the same
 * page had no way to tell it to look again).
 */
import { describe, it, expect, vi } from 'vitest';
import { notifyOnboardingProgress, subscribeOnboardingProgress } from '@/lib/onboarding/client-events';

describe('onboarding client-events pub/sub', () => {
  it('delivers a notify() to a subscriber for the same domain', () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeOnboardingProgress('projects', onChange);
    notifyOnboardingProgress('projects');
    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('does NOT deliver a notify() for a different domain', () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeOnboardingProgress('projects', onChange);
    notifyOnboardingProgress('crm');
    expect(onChange).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('a domain-less notify() (any) reaches every subscriber', () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeOnboardingProgress('projects', onChange);
    notifyOnboardingProgress();
    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('unsubscribe stops further delivery', () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeOnboardingProgress('projects', onChange);
    unsubscribe();
    notifyOnboardingProgress('projects');
    expect(onChange).not.toHaveBeenCalled();
  });
});
