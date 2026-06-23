// @vitest-environment jsdom
/**
 * Batch 44f — four medium-size presentational/wrapper components drawn from
 * previously-unexplored directories.
 *
 * Components covered:
 *   - CardActivity                 (components/portal/card-detail/_sections/CardActivity.tsx)
 *   - WebsiteAutomationSettings    (components/portal/WebsiteAutomationSettings.tsx)
 *   - WebsiteNotificationSettings  (components/portal/WebsiteNotificationSettings.tsx)
 *   - SurveyBlockRender            (components/blocks/render/SurveyBlockRender.tsx)
 *
 * The heavier child dependencies (ProductAutomationSettings, SurveyFormInline)
 * are stubbed so the tests exercise only the wrapper logic — branch coverage
 * over empty-state vs. delegate paths, prop pass-through, and preset payload
 * wiring.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks for heavy child components used by the wrappers under test.
// ---------------------------------------------------------------------------

vi.mock('@/components/portal/ProductAutomationSettings', () => ({
  __esModule: true,
  default: ({ productScope, presets, title, description }: any) =>
    React.createElement(
      'div',
      {
        'data-testid': 'product-automation-settings',
        'data-scope': productScope,
        'data-title': title,
        'data-description': description,
        'data-preset-count': String(presets?.length ?? 0),
        'data-preset-keys': (presets ?? []).map((p: any) => p.key).join(','),
      },
      `${title} stub`,
    ),
}));

vi.mock('@/components/blocks/render/SurveyFormInline', () => ({
  SurveyFormInline: ({ slug, showPageTitle, showDescription, showLogo, styleOverrides }: any) =>
    React.createElement('div', {
      'data-testid': 'survey-form-inline',
      'data-slug': slug,
      'data-show-page-title': String(showPageTitle),
      'data-show-description': String(showDescription),
      'data-show-logo': String(showLogo),
      'data-has-style-overrides': String(Boolean(styleOverrides)),
    }),
}));

// elementStyles lib returns CSSProperties — leave the real impl in place so we
// exercise the wrapper end-to-end. (No mock needed.)

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------
import { CardActivity } from '@/components/portal/card-detail/_sections/CardActivity';
import WebsiteAutomationSettings from '@/components/portal/WebsiteAutomationSettings';
import WebsiteNotificationSettings from '@/components/portal/WebsiteNotificationSettings';
import { SurveyBlockRender } from '@/components/blocks/render/SurveyBlockRender';

// ---------------------------------------------------------------------------
// CardActivity
// ---------------------------------------------------------------------------
describe('CardActivity', () => {
  const baseActivity = {
    id: 1,
    type: 'card.created',
    payload: {},
    createdAt: '2025-01-01T12:00:00.000Z',
    userId: 1,
    userName: 'Ada',
  };

  it('renders the toggle header without a count when activities is empty and the panel is collapsed', () => {
    const setShowActivity = vi.fn();
    const { container, queryByText } = render(
      <CardActivity activities={[]} showActivity={false} setShowActivity={setShowActivity} />,
    );
    // Header text includes the word "Activity" but no parenthesized count.
    expect(container.textContent).toContain('Activity');
    expect(container.textContent).not.toContain('(0)');
    // Collapsed branch: empty-state text should NOT appear.
    expect(queryByText('No activity yet.')).toBeNull();
    // Chevron has no rotation class when collapsed.
    const chevron = container.querySelector('.material-icons');
    expect(chevron?.className).not.toContain('rotate-90');
  });

  it('shows the (count) suffix when there are activities to display', () => {
    const setShowActivity = vi.fn();
    const activities = [
      { ...baseActivity, id: 1 },
      { ...baseActivity, id: 2 },
      { ...baseActivity, id: 3 },
    ];
    const { container } = render(
      <CardActivity
        activities={activities}
        showActivity={false}
        setShowActivity={setShowActivity}
      />,
    );
    expect(container.textContent).toContain('Activity (3)');
  });

  it('renders the empty-state copy when expanded with no activities', () => {
    const { container } = render(
      <CardActivity activities={[]} showActivity={true} setShowActivity={() => {}} />,
    );
    expect(container.textContent).toContain('No activity yet.');
    // Chevron should now carry the rotate-90 class.
    const chevron = container.querySelector('.material-icons');
    expect(chevron?.className).toContain('rotate-90');
  });

  it('renders one row per activity with formatted text when expanded', () => {
    const activities = [
      {
        id: 10,
        type: 'card.title_changed',
        payload: { to: 'New title' },
        createdAt: '2025-02-01T00:00:00.000Z',
        userId: 2,
        userName: 'Grace',
      },
      {
        id: 11,
        type: 'card.label_added',
        payload: { name: 'urgent' },
        createdAt: '2025-02-02T00:00:00.000Z',
        userId: 3,
        userName: 'Linus',
      },
    ];
    const { container } = render(
      <CardActivity activities={activities} showActivity={true} setShowActivity={() => {}} />,
    );
    const items = container.querySelectorAll('li');
    expect(items.length).toBe(2);
    expect(container.textContent).toContain('Grace renamed to "New title"');
    expect(container.textContent).toContain('Linus added label "urgent"');
    // Empty-state copy must NOT appear when activities exist.
    expect(container.textContent).not.toContain('No activity yet.');
  });

  it('invokes setShowActivity with a toggling updater function when the header button is clicked', () => {
    const setShowActivity = vi.fn();
    const { container } = render(
      <CardActivity activities={[]} showActivity={false} setShowActivity={setShowActivity} />,
    );
    const btn = container.querySelector('button')!;
    fireEvent.click(btn);
    expect(setShowActivity).toHaveBeenCalledTimes(1);
    // Component calls setShowActivity(v => !v): pass it a value and confirm the flip.
    const updater = setShowActivity.mock.calls[0][0] as (v: boolean) => boolean;
    expect(typeof updater).toBe('function');
    expect(updater(false)).toBe(true);
    expect(updater(true)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// WebsiteAutomationSettings
// ---------------------------------------------------------------------------
describe('WebsiteAutomationSettings', () => {
  it('delegates to ProductAutomationSettings with website scope, automation title, and the three automation presets', () => {
    const { getByTestId } = render(<WebsiteAutomationSettings />);
    const el = getByTestId('product-automation-settings');
    expect(el.getAttribute('data-scope')).toBe('website');
    expect(el.getAttribute('data-title')).toBe('Automations');
    expect(el.getAttribute('data-description')).toBe(
      'Automate CRM workflows and customer follow-ups',
    );
    expect(el.getAttribute('data-preset-count')).toBe('3');
    // The keys must include each of the three known automation presets.
    const keys = el.getAttribute('data-preset-keys')!.split(',');
    expect(keys).toContain('form_to_crm');
    expect(keys).toContain('order_to_crm');
    expect(keys).toContain('post_purchase_followup');
  });
});

// ---------------------------------------------------------------------------
// WebsiteNotificationSettings
// ---------------------------------------------------------------------------
describe('WebsiteNotificationSettings', () => {
  it('delegates to ProductAutomationSettings with website scope, notification title, and the five notification presets', () => {
    const { getByTestId } = render(<WebsiteNotificationSettings />);
    const el = getByTestId('product-automation-settings');
    expect(el.getAttribute('data-scope')).toBe('website');
    expect(el.getAttribute('data-title')).toBe('Notifications');
    expect(el.getAttribute('data-description')).toBe(
      'Get alerted about important website and store events',
    );
    expect(el.getAttribute('data-preset-count')).toBe('5');
    const keys = el.getAttribute('data-preset-keys')!.split(',');
    // Spot-check each known notification preset.
    expect(keys).toContain('form_notification');
    expect(keys).toContain('page_published_notify');
    expect(keys).toContain('order_placed_notify');
    expect(keys).toContain('order_shipped_notify');
    expect(keys).toContain('low_stock_notify');
  });

  it('differentiates itself from the automation wrapper via title and preset count', () => {
    // Render both wrappers in isolation and confirm they pass different payloads.
    // Scope each query to its own render container to avoid the shared
    // document body in jsdom returning both stubs.
    const aResult = render(<WebsiteAutomationSettings />);
    const a = aResult.container.querySelector(
      '[data-testid="product-automation-settings"]',
    )!;
    aResult.unmount();
    const nResult = render(<WebsiteNotificationSettings />);
    const n = nResult.container.querySelector(
      '[data-testid="product-automation-settings"]',
    )!;
    expect(a.getAttribute('data-title')).not.toBe(n.getAttribute('data-title'));
    expect(a.getAttribute('data-preset-count')).not.toBe(n.getAttribute('data-preset-count'));
  });
});

// ---------------------------------------------------------------------------
// SurveyBlockRender
// ---------------------------------------------------------------------------
describe('SurveyBlockRender', () => {
  it('renders the empty-state placeholder when no slug is provided', () => {
    const block: any = { type: 'survey' };
    const { container, queryByTestId } = render(<SurveyBlockRender block={block} />);
    expect(container.textContent).toContain('No survey selected');
    // The dashed placeholder should NOT delegate to the inline form.
    expect(queryByTestId('survey-form-inline')).toBeNull();
    // The placeholder icon is the "assignment" material icon.
    const icon = container.querySelector('.material-icons');
    expect(icon?.textContent).toBe('assignment');
  });

  it('omits the title and description elements when neither is set on the block', () => {
    const block: any = { type: 'survey', slug: 'test-survey' };
    const { container, getByTestId } = render(<SurveyBlockRender block={block} />);
    // Delegate branch: form rendered, no heading or paragraph emitted by the wrapper.
    expect(getByTestId('survey-form-inline')).toBeTruthy();
    expect(container.querySelector('h2')).toBeNull();
    expect(container.querySelector('p')).toBeNull();
  });

  it('renders the title and description when set, with editable-field data attributes', () => {
    const block: any = {
      type: 'survey',
      slug: 'feedback',
      title: 'How are we doing?',
      description: 'Two-minute pulse check.',
    };
    const { container } = render(<SurveyBlockRender block={block} />);
    const heading = container.querySelector('h2');
    const paragraph = container.querySelector('p');
    expect(heading?.textContent).toBe('How are we doing?');
    expect(heading?.getAttribute('data-editable-field')).toBe('title');
    expect(paragraph?.textContent).toBe('Two-minute pulse check.');
    expect(paragraph?.getAttribute('data-editable-field')).toBe('description');
  });

  it('forwards the show* defaults to SurveyFormInline as true when undefined on the block', () => {
    const block: any = { type: 'survey', slug: 'defaults' };
    const { getByTestId } = render(<SurveyBlockRender block={block} />);
    const form = getByTestId('survey-form-inline');
    expect(form.getAttribute('data-slug')).toBe('defaults');
    expect(form.getAttribute('data-show-page-title')).toBe('true');
    expect(form.getAttribute('data-show-description')).toBe('true');
    expect(form.getAttribute('data-show-logo')).toBe('true');
    expect(form.getAttribute('data-has-style-overrides')).toBe('false');
  });

  it('forwards explicit false flags and styleOverrides to SurveyFormInline', () => {
    const block: any = {
      type: 'survey',
      slug: 'minimal',
      showPageTitle: false,
      showDescription: false,
      showLogo: false,
      styleOverrides: { primaryColor: '#000' },
    };
    const { getByTestId } = render(<SurveyBlockRender block={block} />);
    const form = getByTestId('survey-form-inline');
    expect(form.getAttribute('data-show-page-title')).toBe('false');
    expect(form.getAttribute('data-show-description')).toBe('false');
    expect(form.getAttribute('data-show-logo')).toBe('false');
    expect(form.getAttribute('data-has-style-overrides')).toBe('true');
  });
});
