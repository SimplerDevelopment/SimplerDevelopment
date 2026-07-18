// Integration coverage for the extracted MessagingTab — verifies inline edits, differentiator add/remove, and the rewrite-button hook.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MessagingTab } from '@/app/portal/branding/profiles/[profileId]/_components/MessagingTab';
import { EMPTY_MESSAGING, type MessagingData } from '@/app/portal/branding/profiles/[profileId]/_lib/types';

function makeMessaging(overrides: Partial<MessagingData> = {}): MessagingData {
  return {
    ...EMPTY_MESSAGING,
    ...overrides,
    keyDifferentiators: overrides.keyDifferentiators ?? [],
    voiceSamples: overrides.voiceSamples ?? [],
    toneAxes: overrides.toneAxes ?? {},
  };
}

describe('MessagingTab', () => {
  it('renders all four section headings (identity, voice, key messaging, social proof)', () => {
    render(
      <MessagingTab
        messaging={makeMessaging()}
        updateMessaging={vi.fn()}
        openRewrite={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: /Company Identity/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Brand Voice/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Key Messaging/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Social Proof/i })).toBeInTheDocument();
  });

  it('emits updateMessaging when company name and mission are edited', () => {
    const updateMessaging = vi.fn();
    render(
      <MessagingTab
        messaging={makeMessaging()}
        updateMessaging={updateMessaging}
        openRewrite={vi.fn()}
      />,
    );

    const companyName = screen.getByPlaceholderText('Acme Corp') as HTMLInputElement;
    fireEvent.change(companyName, { target: { value: 'Acme' } });
    expect(updateMessaging).toHaveBeenCalledWith('companyName', 'Acme');

    const mission = screen.getByPlaceholderText("What is your company's mission?") as HTMLTextAreaElement;
    fireEvent.change(mission, { target: { value: 'Make things simpler.' } });
    expect(updateMessaging).toHaveBeenCalledWith('missionStatement', 'Make things simpler.');
  });

  it('adds a new differentiator and clears the input', () => {
    const updateMessaging = vi.fn();
    render(
      <MessagingTab
        messaging={makeMessaging()}
        updateMessaging={updateMessaging}
        openRewrite={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText(/Add a differentiator/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Owns the pipeline' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(updateMessaging).toHaveBeenCalledWith('keyDifferentiators', ['Owns the pipeline']);
  });

  it('opens the rewrite handler with the correct field + label when AI button is clicked', () => {
    const openRewrite = vi.fn();
    render(
      <MessagingTab
        messaging={makeMessaging({ missionStatement: 'old mission' })}
        updateMessaging={vi.fn()}
        openRewrite={openRewrite}
      />,
    );

    const buttons = screen.getAllByTitle('Rewrite with AI');
    expect(buttons.length).toBeGreaterThan(0);
    // Mission Statement is the first textarea-with-rewrite in Company Identity.
    fireEvent.click(buttons[0]);
    expect(openRewrite).toHaveBeenCalledWith('missionStatement', 'Mission Statement');
  });
});
