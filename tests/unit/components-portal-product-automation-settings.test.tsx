// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
}));

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

function makeLoadFetch(rules: unknown[] = []) {
  return vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
    // Initial GET /api/portal/automations
    if (!opts || opts.method === undefined) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, rules }),
      });
    }
    // Default POST/PATCH success
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: true, rule: { id: 999, enabled: true, ...JSON.parse(opts.body as string) } }),
    });
  });
}

// ---------------------------------------------------------------------------
// Fixture presets
// ---------------------------------------------------------------------------

import type { AutomationPreset } from '@/components/portal/ProductAutomationSettings';

const selectPreset: AutomationPreset = {
  key: 'welcome_email',
  name: 'Welcome Email',
  description: 'Send a welcome email on signup',
  icon: 'email',
  trigger: { event: 'user.signup' },
  actions: [{ tool: 'send_email', params: { template: 'welcome', delay: 0 } }],
  settings: [
    {
      key: 'template',
      label: 'Template',
      type: 'select',
      options: [
        { value: 'welcome', label: 'Welcome' },
        { value: 'onboarding', label: 'Onboarding' },
      ],
      defaultValue: 'welcome',
      mapsTo: { actionIndex: 0, paramKey: 'template' },
    },
  ],
};

const numberPreset: AutomationPreset = {
  key: 'reminder',
  name: 'Reminder',
  description: 'Send a reminder after N days',
  icon: 'schedule',
  trigger: { event: 'trial.started' },
  actions: [{ tool: 'send_email', params: { delay: 3 } }],
  settings: [
    {
      key: 'delay',
      label: 'Delay',
      type: 'number',
      defaultValue: 3,
      unit: 'days',
      mapsTo: { actionIndex: 0, paramKey: 'delay' },
    },
  ],
};

const textPreset: AutomationPreset = {
  key: 'custom_msg',
  name: 'Custom Message',
  description: 'Send a custom message',
  icon: 'chat',
  trigger: { event: 'order.created' },
  actions: [{ tool: 'send_sms', params: { body: '' } }],
  settings: [
    {
      key: 'body',
      label: 'Message',
      type: 'text',
      defaultValue: 'Hello!',
      mapsTo: { actionIndex: 0, paramKey: 'body' },
    },
  ],
};

const simplePreset: AutomationPreset = {
  key: 'tag_lead',
  name: 'Tag Lead',
  description: 'Tag the lead on contact',
  icon: 'label',
  trigger: { event: 'contact.created' },
  actions: [{ tool: 'tag', params: {} }],
};

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------

import ProductAutomationSettings from '@/components/portal/ProductAutomationSettings';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProductAutomationSettings', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── 1. Loading spinner ─────────────────────────────────────────────────────
  it('shows a loading spinner before data arrives', () => {
    // Never resolves so we can observe the loading state
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    render(
      <ProductAutomationSettings
        productScope="crm"
        presets={[simplePreset]}
      />,
    );

    // Material icon spinner
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeTruthy();
  });

  // ── 2. Preset cards render after load ─────────────────────────────────────
  it('renders preset cards after the automations load', async () => {
    global.fetch = makeLoadFetch([]);

    await act(async () => {
      render(
        <ProductAutomationSettings
          productScope="crm"
          presets={[simplePreset, selectPreset]}
        />,
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Tag Lead')).toBeInTheDocument();
    });

    expect(screen.getByText('Welcome Email')).toBeInTheDocument();
    expect(screen.getByText('Send a welcome email on signup')).toBeInTheDocument();
  });

  // ── 3. Optional title + description render ────────────────────────────────
  it('renders title and description when provided', async () => {
    global.fetch = makeLoadFetch([]);

    await act(async () => {
      render(
        <ProductAutomationSettings
          productScope="crm"
          presets={[simplePreset]}
          title="CRM Automations"
          description="Configure your CRM rules here"
        />,
      );
    });

    await waitFor(() => expect(screen.getByText('CRM Automations')).toBeInTheDocument());
    expect(screen.getByText('Configure your CRM rules here')).toBeInTheDocument();
  });

  // ── 4. No title/description when omitted ─────────────────────────────────
  it('omits title block when title prop is not provided', async () => {
    global.fetch = makeLoadFetch([]);

    await act(async () => {
      render(
        <ProductAutomationSettings
          productScope="crm"
          presets={[simplePreset]}
        />,
      );
    });

    await waitFor(() => expect(screen.getByText('Tag Lead')).toBeInTheDocument());
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
  });

  // ── 5. Toggle creates a new rule (POST) ───────────────────────────────────
  it('POSTs a new rule when toggling an off preset', async () => {
    const fetchMock = makeLoadFetch([]);
    global.fetch = fetchMock;

    await act(async () => {
      render(
        <ProductAutomationSettings
          productScope="crm"
          presets={[simplePreset]}
        />,
      );
    });

    await waitFor(() => expect(screen.getByText('Tag Lead')).toBeInTheDocument());

    const toggle = screen.getByRole('button');
    await act(async () => { fireEvent.click(toggle); });

    await waitFor(() => {
      const calls = fetchMock.mock.calls;
      const postCall = calls.find(
        ([url, opts]: [string, RequestInit]) =>
          url === '/api/portal/automations' && opts?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
    });
  });

  // ── 6. POST body includes correct fields ──────────────────────────────────
  it('includes name, trigger, source, productScope in POST body', async () => {
    const fetchMock = makeLoadFetch([]);
    global.fetch = fetchMock;

    await act(async () => {
      render(
        <ProductAutomationSettings
          productScope="crm"
          presets={[simplePreset]}
        />,
      );
    });

    await waitFor(() => expect(screen.getByText('Tag Lead')).toBeInTheDocument());

    await act(async () => { fireEvent.click(screen.getByRole('button')); });

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([url, opts]: [string, RequestInit]) =>
          url === '/api/portal/automations' && opts?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
      const body = JSON.parse(postCall![1].body as string);
      expect(body.name).toBe('Tag Lead');
      expect(body.source).toBe('settings');
      expect(body.productScope).toBe('crm');
      expect(body.trigger.event).toBe('contact.created');
    });
  });

  // ── 7. Existing enabled rule → toggle sends PATCH with enabled:false ───────
  it('PATCHes an existing enabled rule to toggle it off', async () => {
    const existingRule = {
      id: 55,
      name: 'Tag Lead',
      enabled: true,
      trigger: { event: 'contact.created' },
      actions: [{ tool: 'tag', params: {} }],
      conditions: [],
      source: 'settings',
      productScope: 'crm',
    };
    const fetchMock = makeLoadFetch([existingRule]);
    global.fetch = fetchMock;

    await act(async () => {
      render(
        <ProductAutomationSettings
          productScope="crm"
          presets={[simplePreset]}
        />,
      );
    });

    await waitFor(() => expect(screen.getByText('Tag Lead')).toBeInTheDocument());

    await act(async () => { fireEvent.click(screen.getByRole('button')); });

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([url, opts]: [string, RequestInit]) =>
          url === '/api/portal/automations/55' && opts?.method === 'PATCH',
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse(patchCall![1].body as string);
      expect(body.enabled).toBe(false);
    });
  });

  // ── 8. Existing disabled rule → toggle sends PATCH with enabled:true ───────
  it('PATCHes an existing disabled rule to toggle it on', async () => {
    const disabledRule = {
      id: 77,
      name: 'Tag Lead',
      enabled: false,
      trigger: { event: 'contact.created' },
      actions: [{ tool: 'tag', params: {} }],
      conditions: [],
      source: 'settings',
      productScope: 'crm',
    };
    const fetchMock = makeLoadFetch([disabledRule]);
    global.fetch = fetchMock;

    await act(async () => {
      render(
        <ProductAutomationSettings
          productScope="crm"
          presets={[simplePreset]}
        />,
      );
    });

    await waitFor(() => expect(screen.getByText('Tag Lead')).toBeInTheDocument());

    await act(async () => { fireEvent.click(screen.getByRole('button')); });

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([url, opts]: [string, RequestInit]) =>
          url === '/api/portal/automations/77' && opts?.method === 'PATCH',
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse(patchCall![1].body as string);
      expect(body.enabled).toBe(true);
    });
  });

  // ── 9. Settings hidden when preset is disabled ────────────────────────────
  it('does not show settings fields when a preset is not enabled', async () => {
    global.fetch = makeLoadFetch([]);

    await act(async () => {
      render(
        <ProductAutomationSettings
          productScope="crm"
          presets={[selectPreset]}
        />,
      );
    });

    await waitFor(() => expect(screen.getByText('Welcome Email')).toBeInTheDocument());

    // Select setting labelled "Template" should NOT be visible
    expect(screen.queryByLabelText('Template')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  // ── 10. Select setting visible when enabled ───────────────────────────────
  it('shows select settings when the preset is enabled', async () => {
    const enabledRule = {
      id: 1,
      name: 'Welcome Email',
      enabled: true,
      trigger: { event: 'user.signup' },
      actions: [{ tool: 'send_email', params: { template: 'welcome', delay: 0 } }],
      conditions: [],
      source: 'settings',
      productScope: 'crm',
    };
    global.fetch = makeLoadFetch([enabledRule]);

    await act(async () => {
      render(
        <ProductAutomationSettings
          productScope="crm"
          presets={[selectPreset]}
        />,
      );
    });

    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());

    const sel = screen.getByRole('combobox') as HTMLSelectElement;
    expect(sel.value).toBe('welcome');
    expect(screen.getByText('Onboarding')).toBeInTheDocument();
  });

  // ── 11. Number setting visible and functional ─────────────────────────────
  it('shows number input with unit label when preset is enabled', async () => {
    const enabledRule = {
      id: 2,
      name: 'Reminder',
      enabled: true,
      trigger: { event: 'trial.started' },
      actions: [{ tool: 'send_email', params: { delay: 3 } }],
      conditions: [],
      source: 'settings',
      productScope: 'crm',
    };
    global.fetch = makeLoadFetch([enabledRule]);

    await act(async () => {
      render(
        <ProductAutomationSettings
          productScope="crm"
          presets={[numberPreset]}
        />,
      );
    });

    await waitFor(() => expect(screen.getByRole('spinbutton')).toBeInTheDocument());

    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.value).toBe('3');
    expect(screen.getByText('days')).toBeInTheDocument();
  });

  // ── 12. Text setting visible when enabled ─────────────────────────────────
  it('shows text input for text-type settings when preset is enabled', async () => {
    const enabledRule = {
      id: 3,
      name: 'Custom Message',
      enabled: true,
      trigger: { event: 'order.created' },
      actions: [{ tool: 'send_sms', params: { body: 'Hello!' } }],
      conditions: [],
      source: 'settings',
      productScope: 'crm',
    };
    global.fetch = makeLoadFetch([enabledRule]);

    await act(async () => {
      render(
        <ProductAutomationSettings
          productScope="crm"
          presets={[textPreset]}
        />,
      );
    });

    await waitFor(() => {
      const inputs = screen.getAllByRole('textbox');
      expect(inputs.length).toBeGreaterThan(0);
    });

    const textInput = screen.getAllByRole('textbox')[0] as HTMLInputElement;
    expect(textInput.value).toBe('Hello!');
  });

  // ── 13. Number input change triggers PATCH ────────────────────────────────
  it('PATCHes the rule when a number setting changes for an enabled preset', async () => {
    const enabledRule = {
      id: 2,
      name: 'Reminder',
      enabled: true,
      trigger: { event: 'trial.started' },
      actions: [{ tool: 'send_email', params: { delay: 3 } }],
      conditions: [],
      source: 'settings',
      productScope: 'crm',
    };
    const fetchMock = makeLoadFetch([enabledRule]);
    global.fetch = fetchMock;

    await act(async () => {
      render(
        <ProductAutomationSettings
          productScope="crm"
          presets={[numberPreset]}
        />,
      );
    });

    await waitFor(() => expect(screen.getByRole('spinbutton')).toBeInTheDocument());

    await act(async () => {
      fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '7' } });
    });

    await waitFor(() => {
      const patchCalls = fetchMock.mock.calls.filter(
        ([url, opts]: [string, RequestInit]) =>
          url === '/api/portal/automations/2' && opts?.method === 'PATCH',
      );
      expect(patchCalls.length).toBeGreaterThan(0);
    });
  });

  // ── 14. Select change triggers PATCH ─────────────────────────────────────
  it('PATCHes the rule when a select setting changes for an enabled preset', async () => {
    const enabledRule = {
      id: 1,
      name: 'Welcome Email',
      enabled: true,
      trigger: { event: 'user.signup' },
      actions: [{ tool: 'send_email', params: { template: 'welcome', delay: 0 } }],
      conditions: [],
      source: 'settings',
      productScope: 'crm',
    };
    const fetchMock = makeLoadFetch([enabledRule]);
    global.fetch = fetchMock;

    await act(async () => {
      render(
        <ProductAutomationSettings
          productScope="crm"
          presets={[selectPreset]}
        />,
      );
    });

    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());

    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'onboarding' } });
    });

    await waitFor(() => {
      const patchCalls = fetchMock.mock.calls.filter(
        ([url, opts]: [string, RequestInit]) =>
          url === '/api/portal/automations/1' && opts?.method === 'PATCH',
      );
      expect(patchCalls.length).toBeGreaterThan(0);
    });
  });

  // ── 15. Text input change triggers PATCH ─────────────────────────────────
  it('PATCHes the rule when a text setting changes for an enabled preset', async () => {
    const enabledRule = {
      id: 3,
      name: 'Custom Message',
      enabled: true,
      trigger: { event: 'order.created' },
      actions: [{ tool: 'send_sms', params: { body: 'Hello!' } }],
      conditions: [],
      source: 'settings',
      productScope: 'crm',
    };
    const fetchMock = makeLoadFetch([enabledRule]);
    global.fetch = fetchMock;

    await act(async () => {
      render(
        <ProductAutomationSettings
          productScope="crm"
          presets={[textPreset]}
        />,
      );
    });

    await waitFor(() => {
      expect(screen.getAllByRole('textbox').length).toBeGreaterThan(0);
    });

    await act(async () => {
      fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'New message' } });
    });

    await waitFor(() => {
      const patchCalls = fetchMock.mock.calls.filter(
        ([url, opts]: [string, RequestInit]) =>
          url === '/api/portal/automations/3' && opts?.method === 'PATCH',
      );
      expect(patchCalls.length).toBeGreaterThan(0);
    });
  });

  // ── 16. Setting value initialised from saved rule params ──────────────────
  it('initialises setting values from the saved rule action params', async () => {
    const enabledRule = {
      id: 1,
      name: 'Welcome Email',
      enabled: true,
      trigger: { event: 'user.signup' },
      actions: [{ tool: 'send_email', params: { template: 'onboarding', delay: 0 } }],
      conditions: [],
      source: 'settings',
      productScope: 'crm',
    };
    global.fetch = makeLoadFetch([enabledRule]);

    await act(async () => {
      render(
        <ProductAutomationSettings
          productScope="crm"
          presets={[selectPreset]}
        />,
      );
    });

    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());

    const sel = screen.getByRole('combobox') as HTMLSelectElement;
    expect(sel.value).toBe('onboarding');
  });

  // ── 17. Multiple presets — only enabled one shows settings ────────────────
  it('shows settings only for enabled preset when multiple presets rendered', async () => {
    const enabledRule = {
      id: 1,
      name: 'Welcome Email',
      enabled: true,
      trigger: { event: 'user.signup' },
      actions: [{ tool: 'send_email', params: { template: 'welcome', delay: 0 } }],
      conditions: [],
      source: 'settings',
      productScope: 'crm',
    };
    global.fetch = makeLoadFetch([enabledRule]);

    await act(async () => {
      render(
        <ProductAutomationSettings
          productScope="crm"
          presets={[selectPreset, simplePreset]}
        />,
      );
    });

    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());

    // Only one combobox — from selectPreset (enabled), not simplePreset (disabled, no settings anyway)
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
  });

  // ── 18. enabled toggle button styling ────────────────────────────────────
  it('applies bg-green-500 class to toggle button when preset is enabled', async () => {
    const enabledRule = {
      id: 55,
      name: 'Tag Lead',
      enabled: true,
      trigger: { event: 'contact.created' },
      actions: [{ tool: 'tag', params: {} }],
      conditions: [],
      source: 'settings',
      productScope: 'crm',
    };
    global.fetch = makeLoadFetch([enabledRule]);

    await act(async () => {
      render(
        <ProductAutomationSettings
          productScope="crm"
          presets={[simplePreset]}
        />,
      );
    });

    await waitFor(() => expect(screen.getByText('Tag Lead')).toBeInTheDocument());

    const toggle = screen.getByRole('button');
    expect(toggle.className).toContain('bg-green-500');
  });

  // ── 19. Toggle button disabled while toggling ─────────────────────────────
  it('disables the toggle button while the toggle request is in-flight', async () => {
    let resolvePatch!: (v: unknown) => void;
    const patchPromise = new Promise((res) => { resolvePatch = res; });

    global.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (!opts || opts.method === undefined) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, rules: [] }),
        });
      }
      return patchPromise;
    });

    await act(async () => {
      render(
        <ProductAutomationSettings
          productScope="crm"
          presets={[simplePreset]}
        />,
      );
    });

    await waitFor(() => expect(screen.getByText('Tag Lead')).toBeInTheDocument());

    const toggle = screen.getByRole('button');

    act(() => { fireEvent.click(toggle); });

    // Button should be disabled while the toggle is in-flight
    expect(toggle).toBeDisabled();

    // Resolve with a full rule shape (trigger must be present or setRules will crash on re-render)
    await act(async () => {
      resolvePatch({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          rule: {
            id: 999,
            name: 'Tag Lead',
            enabled: true,
            trigger: { event: 'contact.created' },
            actions: [{ tool: 'tag', params: {} }],
            conditions: [],
            source: 'settings',
            productScope: 'crm',
          },
        }),
      });
    });
  });

  // ── 20. Empty preset list — no cards ─────────────────────────────────────
  it('renders no preset cards when presets array is empty', async () => {
    global.fetch = makeLoadFetch([]);

    await act(async () => {
      render(
        <ProductAutomationSettings
          productScope="crm"
          presets={[]}
          title="Nothing here"
        />,
      );
    });

    await waitFor(() => expect(screen.getByText('Nothing here')).toBeInTheDocument());
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
