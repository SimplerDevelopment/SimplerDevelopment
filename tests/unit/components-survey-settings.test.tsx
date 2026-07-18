// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/surveys/[id]/_components/SurveySettings.tsx`
 * Covers: render sections, branding profile select, color/font/button/layout
 * inputs, toggles (requireEmail, allowMultiple, publishResults, notify,
 * certificateEnabled, hideTitle, hideLogo), digest select, consent field,
 * closesAt / maxResponses inputs, thank-you title/message/redirect, save/delete
 * buttons, SCORE-02 auto-route panel visibility, pipeline/stage/threshold/template
 * inputs, pipelines fetch effect.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks (must precede component import)
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useParams: () => ({}),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// GoogleFontPicker is a complex dropdown — stub it to a controlled select.
vi.mock('@/components/blocks/visual/GoogleFontPicker', () => ({
  GoogleFontPicker: function GoogleFontPickerStub({
    value,
    onChange,
  }: {
    value: string;
    onChange: (font: string) => void;
  }) {
    return React.createElement('select', {
      'data-testid': 'google-font-picker',
      value,
      onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value),
    }, [
      React.createElement('option', { key: '', value: '' }, '(default)'),
      React.createElement('option', { key: 'Roboto', value: 'Roboto' }, 'Roboto'),
    ]);
  },
}));

// Stub the _lib/api module — no runtime behavior needed (only types imported).
vi.mock('@/app/portal/surveys/[id]/_lib/api', () => ({}));

// Stub SurveyBuilder types — no runtime import in SurveySettings.
vi.mock('@/components/admin/SurveyBuilder', () => ({}));

// Stub db/schema — only types used.
vi.mock('@/lib/db/schema', () => ({}));

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------

import SurveySettings from '@/app/portal/surveys/[id]/_components/SurveySettings';
import type { SurveyField } from '@/components/admin/SurveyBuilder';
import type { SurveyScoringConfig } from '@/lib/db/schema';
import type { BrandingProfile } from '@/app/portal/surveys/[id]/_lib/api';

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

const brandingProfiles: BrandingProfile[] = [
  { id: 1, name: 'Brand A', isDefault: true, primaryColor: '#ff0000', logoUrl: null },
  { id: 2, name: 'Brand B', isDefault: false, primaryColor: null, logoUrl: null },
];

const emptyStyling: Record<string, string | boolean | undefined> = {};

function buildDefaultProps(overrides: Partial<React.ComponentProps<typeof SurveySettings>> = {}) {
  const setEditStyling = vi.fn();
  return {
    saving: false,
    brandingProfiles,
    editColor: '#2563eb',
    editBrandingProfileId: null,
    setEditBrandingProfileId: vi.fn(),
    editStyling: emptyStyling,
    setEditStyling,
    editThankYouTitle: 'Thank you!',
    setEditThankYouTitle: vi.fn(),
    editThankYouMessage: 'Your response has been recorded.',
    setEditThankYouMessage: vi.fn(),
    editRedirectUrl: '',
    setEditRedirectUrl: vi.fn(),
    editRequireEmail: false,
    setEditRequireEmail: vi.fn(),
    editAllowMultiple: true,
    setEditAllowMultiple: vi.fn(),
    editPublishResults: false,
    setEditPublishResults: vi.fn(),
    editCertificateEnabled: false,
    setEditCertificateEnabled: vi.fn(),
    editNotify: true,
    setEditNotify: vi.fn(),
    editDigest: 'off',
    setEditDigest: vi.fn(),
    editClosesAt: '',
    setEditClosesAt: vi.fn(),
    editMaxResponses: '',
    setEditMaxResponses: vi.fn(),
    editFields: [] as SurveyField[],
    editScoringConfig: null as SurveyScoringConfig | null,
    setEditScoringConfig: vi.fn(),
    editConsentField: null as string | null,
    setEditConsentField: vi.fn(),
    onSave: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
}

function renderSettings(props: Partial<React.ComponentProps<typeof SurveySettings>> = {}) {
  const merged = buildDefaultProps(props);
  render(<SurveySettings {...merged} />);
  return merged;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default fetch: success with empty pipelines
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: [] }),
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SurveySettings — section rendering', () => {
  it('renders Appearance, Completion Screen, and Response Settings sections', () => {
    renderSettings();
    expect(screen.getByText('Appearance')).toBeInTheDocument();
    expect(screen.getByText('Completion Screen')).toBeInTheDocument();
    expect(screen.getByText('Response Settings')).toBeInTheDocument();
  });

  it('renders Save Settings and Delete Survey buttons', () => {
    renderSettings();
    expect(screen.getByRole('button', { name: /Save Settings/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete Survey/i })).toBeInTheDocument();
  });

  it('shows "Saving..." text when saving prop is true', () => {
    renderSettings({ saving: true });
    expect(screen.getByText('Saving...')).toBeInTheDocument();
  });

  it('Save button is disabled when saving', () => {
    renderSettings({ saving: true });
    const saveBtn = screen.getByRole('button', { name: /Saving.../i });
    expect(saveBtn).toBeDisabled();
  });
});

describe('SurveySettings — branding profile', () => {
  it('renders branding profile options', () => {
    renderSettings();
    expect(screen.getByRole('option', { name: /Brand A/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Brand B/ })).toBeInTheDocument();
  });

  it('calls setEditBrandingProfileId with number when profile selected', () => {
    const props = renderSettings();
    // The branding profile select is the first combobox
    const profileSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(profileSelect, { target: { value: '2' } });
    expect(props.setEditBrandingProfileId).toHaveBeenCalledWith(2);
  });

  it('calls setEditBrandingProfileId with null when empty option selected', () => {
    const props = renderSettings({ editBrandingProfileId: 1 });
    const profileSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(profileSelect, { target: { value: '' } });
    expect(props.setEditBrandingProfileId).toHaveBeenCalledWith(null);
  });

  it('shows "Create a branding profile" link when no profiles exist', () => {
    renderSettings({ brandingProfiles: [] });
    expect(screen.getByRole('link', { name: /Create a branding profile/i })).toBeInTheDocument();
  });
});

describe('SurveySettings — color inputs', () => {
  it('renders color picker inputs for primary color', () => {
    renderSettings();
    const labels = screen.getAllByText('Primary');
    expect(labels.length).toBeGreaterThanOrEqual(1);
  });

  it('calls setEditStyling when a color text input changes', () => {
    const setEditStyling = vi.fn();
    renderSettings({ setEditStyling, editColor: '#2563eb' });
    // Primary color text input has placeholder "#2563eb" (the fallback value for primaryColor)
    const primaryColorTextInput = screen.getByPlaceholderText('#2563eb');
    fireEvent.change(primaryColorTextInput, { target: { value: '#ff0000' } });
    // The component always uses a functional updater: (prev) => ({ ...prev, primaryColor: val })
    expect(setEditStyling).toHaveBeenCalled();
    const updater = setEditStyling.mock.calls[0][0];
    // Verify the updater is a function that merges the new key
    expect(typeof updater).toBe('function');
    // Call the updater with a known prev state to verify it merges correctly
    const result = (updater as (prev: Record<string, string>) => Record<string, string>)({
      otherKey: 'val',
    });
    // The key 'primaryColor' is set (value is whatever e.target.value was in jsdom)
    expect(Object.keys(result)).toContain('primaryColor');
    expect(result).toMatchObject({ otherKey: 'val' });
  });
});

describe('SurveySettings — font pickers', () => {
  it('renders heading and body font pickers', () => {
    renderSettings();
    const pickers = screen.getAllByTestId('google-font-picker');
    expect(pickers).toHaveLength(2);
  });

  it('calls setEditStyling with headingFont when heading font changes', () => {
    const setEditStyling = vi.fn();
    renderSettings({ setEditStyling });
    const [headingPicker] = screen.getAllByTestId('google-font-picker');
    fireEvent.change(headingPicker, { target: { value: 'Roboto' } });
    expect(setEditStyling).toHaveBeenCalled();
    const updater = setEditStyling.mock.calls[0][0];
    const result = typeof updater === 'function' ? updater({}) : updater;
    expect(result).toMatchObject({ headingFont: 'Roboto' });
  });
});

describe('SurveySettings — button / layout selects', () => {
  it('calls setEditStyling when border radius select changes', () => {
    const setEditStyling = vi.fn();
    renderSettings({ setEditStyling });
    const borderRadiusSelects = screen.getAllByRole('combobox').filter((el) => {
      return [...el.querySelectorAll('option')].some((o) => o.textContent?.includes('Square'));
    });
    fireEvent.change(borderRadiusSelects[0], { target: { value: '0px' } });
    expect(setEditStyling).toHaveBeenCalled();
  });
});

describe('SurveySettings — layout toggles', () => {
  it('calls setEditStyling when Hide title checkbox is toggled', () => {
    const setEditStyling = vi.fn();
    renderSettings({ setEditStyling });
    const labels = screen.getAllByText(/Hide title on public page/i);
    const label = labels[0];
    const hideTitle = label.closest('label')?.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(hideTitle);
    expect(setEditStyling).toHaveBeenCalled();
    const updater = setEditStyling.mock.calls[0][0];
    // Updater is a functional updater — verify it merges correctly
    expect(typeof updater).toBe('function');
    const result = (updater as (prev: Record<string, unknown>) => Record<string, unknown>)({});
    expect(Object.keys(result)).toContain('hideTitle');
  });

  it('calls setEditStyling when Hide logo checkbox is toggled', () => {
    const setEditStyling = vi.fn();
    renderSettings({ setEditStyling });
    const labels = screen.getAllByText(/Hide logo/i);
    const label = labels[0];
    const hideLogo = label.closest('label')?.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(hideLogo);
    expect(setEditStyling).toHaveBeenCalled();
  });
});

describe('SurveySettings — completion screen fields', () => {
  it('renders thank you title input with current value', () => {
    renderSettings({ editThankYouTitle: 'Great job!' });
    // The thank-you title input is the first type="text" input after the Completion Screen heading
    // Use getAllByRole('textbox') — first one in the Completion section is the title
    const allTextboxes = screen.getAllByRole('textbox');
    // Find the one whose value is 'Great job!'
    const titleInput = allTextboxes.find(
      (el) => (el as HTMLInputElement).value === 'Great job!',
    ) as HTMLInputElement;
    expect(titleInput).toBeTruthy();
  });

  it('calls setEditThankYouTitle when title changes', () => {
    const props = renderSettings({ editThankYouTitle: 'Thank you!' });
    // Find the title input by its current value
    const allTextboxes = screen.getAllByRole('textbox');
    const titleInput = allTextboxes.find(
      (el) => (el as HTMLInputElement).value === 'Thank you!',
    );
    fireEvent.change(titleInput!, { target: { value: 'Awesome!' } });
    expect(props.setEditThankYouTitle).toHaveBeenCalledWith('Awesome!');
  });

  it('calls setEditThankYouMessage when message changes', () => {
    const props = renderSettings({ editThankYouMessage: 'Default msg' });
    const textarea = screen.getByDisplayValue('Default msg');
    fireEvent.change(textarea, { target: { value: 'Done!' } });
    expect(props.setEditThankYouMessage).toHaveBeenCalledWith('Done!');
  });

  it('calls setEditRedirectUrl when redirect URL changes', () => {
    const props = renderSettings();
    const urlInput = screen.getByPlaceholderText('https://example.com/thank-you');
    fireEvent.change(urlInput, { target: { value: 'https://example.com/done' } });
    expect(props.setEditRedirectUrl).toHaveBeenCalledWith('https://example.com/done');
  });
});

function findCheckboxByText(text: RegExp): HTMLInputElement {
  // Some labels use inline text without `for` — find by parent label's text content
  const allInputs = document.querySelectorAll('input[type="checkbox"]');
  for (const inp of Array.from(allInputs)) {
    const parentLabel = inp.closest('label');
    if (parentLabel?.textContent?.match(text)) {
      return inp as HTMLInputElement;
    }
  }
  throw new Error(`No checkbox found matching label text: ${text}`);
}

describe('SurveySettings — response setting toggles', () => {
  it('calls setEditRequireEmail when checkbox toggled', () => {
    const props = renderSettings({ editRequireEmail: false });
    const cb = findCheckboxByText(/Require respondent email/i);
    fireEvent.click(cb);
    expect(props.setEditRequireEmail).toHaveBeenCalledWith(true);
  });

  it('calls setEditAllowMultiple when checkbox toggled off', () => {
    const props = renderSettings({ editAllowMultiple: true });
    const cb = findCheckboxByText(/Allow multiple submissions per person/i);
    fireEvent.click(cb);
    expect(props.setEditAllowMultiple).toHaveBeenCalledWith(false);
  });

  it('calls setEditNotify when checkbox toggled', () => {
    const props = renderSettings({ editNotify: false });
    const cb = findCheckboxByText(/Email notification on new response/i);
    fireEvent.click(cb);
    expect(props.setEditNotify).toHaveBeenCalledWith(true);
  });

  it('calls setEditPublishResults when Publish results checkbox toggled', () => {
    const props = renderSettings({ editPublishResults: false });
    const cb = findCheckboxByText(/Publish public results page/i);
    fireEvent.click(cb);
    expect(props.setEditPublishResults).toHaveBeenCalledWith(true);
  });

  it('calls setEditCertificateEnabled when certificate checkbox toggled', () => {
    const props = renderSettings({ editCertificateEnabled: false });
    const cb = findCheckboxByText(/Offer completion certificate/i);
    fireEvent.click(cb);
    expect(props.setEditCertificateEnabled).toHaveBeenCalledWith(true);
  });
});

describe('SurveySettings — digest select', () => {
  it('renders digest select with current value', () => {
    renderSettings({ editDigest: 'daily' });
    const digestOption = screen.getByRole('option', { name: 'Daily digest' }) as HTMLOptionElement;
    expect(digestOption.selected).toBe(true);
  });

  it('calls setEditDigest when digest option changes', () => {
    const props = renderSettings();
    // Digest select is identified by its unique options (Off/Daily/Weekly)
    const offOption = screen.getByRole('option', { name: 'Off' });
    const digestSelect = offOption.closest('select')!;
    fireEvent.change(digestSelect, { target: { value: 'weekly' } });
    expect(props.setEditDigest).toHaveBeenCalledWith('weekly');
  });
});

describe('SurveySettings — consent field', () => {
  const fieldsWithConsent = [
    {
      id: 'consent-1',
      type: 'toggle' as const,
      label: 'I agree',
      placeholder: '',
      helpText: '',
      required: false,
      options: [],
      order: 0,
    },
    {
      id: 'heading-1',
      type: 'heading' as const,
      label: 'Section',
      placeholder: '',
      helpText: '',
      required: false,
      options: [],
      order: 1,
    },
  ];

  it('shows non-heading, non-page_break fields in consent dropdown', () => {
    renderSettings({ editFields: fieldsWithConsent });
    expect(screen.getByRole('option', { name: 'I agree' })).toBeInTheDocument();
    // heading type is filtered out
    expect(screen.queryByRole('option', { name: 'Section' })).not.toBeInTheDocument();
  });

  it('calls setEditConsentField with field id when selected', () => {
    const props = renderSettings({ editFields: fieldsWithConsent });
    // The consent field select contains a "none" option and the consent field option
    const noneOption = screen.getByRole('option', { name: /none — email presence is enough/i });
    const consentSelect = noneOption.closest('select')!;
    fireEvent.change(consentSelect, { target: { value: 'consent-1' } });
    expect(props.setEditConsentField).toHaveBeenCalledWith('consent-1');
  });

  it('calls setEditConsentField with null when empty option selected', () => {
    const props = renderSettings({
      editFields: fieldsWithConsent,
      editConsentField: 'consent-1',
    });
    const noneOption = screen.getByRole('option', { name: /none — email presence is enough/i });
    const consentSelect = noneOption.closest('select')!;
    fireEvent.change(consentSelect, { target: { value: '' } });
    expect(props.setEditConsentField).toHaveBeenCalledWith(null);
  });
});

describe('SurveySettings — closes at / max responses', () => {
  it('calls setEditClosesAt when datetime-local input changes', () => {
    const props = renderSettings();
    // The datetime-local input is uniquely identifiable by type
    const closesAtInput = document.querySelector('input[type="datetime-local"]')!;
    fireEvent.change(closesAtInput, { target: { value: '2026-12-31T00:00' } });
    expect(props.setEditClosesAt).toHaveBeenCalledWith('2026-12-31T00:00');
  });

  it('calls setEditMaxResponses when max responses input changes', () => {
    const props = renderSettings();
    // Max responses uses placeholder "Unlimited"
    const maxInput = screen.getByPlaceholderText('Unlimited');
    fireEvent.change(maxInput, { target: { value: '100' } });
    expect(props.setEditMaxResponses).toHaveBeenCalledWith('100');
  });
});

describe('SurveySettings — Save / Delete callbacks', () => {
  it('calls onSave when Save Settings is clicked', () => {
    const props = renderSettings();
    fireEvent.click(screen.getByRole('button', { name: /Save Settings/i }));
    expect(props.onSave).toHaveBeenCalledOnce();
  });

  it('calls onDelete when Delete Survey is clicked', () => {
    const props = renderSettings();
    fireEvent.click(screen.getByRole('button', { name: /Delete Survey/i }));
    expect(props.onDelete).toHaveBeenCalledOnce();
  });
});

describe('SurveySettings — SCORE-02 auto-route panel', () => {
  const scoredField: SurveyField = {
    id: 'scored-1',
    type: 'rating',
    label: 'Rating',
    placeholder: '',
    helpText: '',
    required: false,
    options: [],
    order: 0,
    scoring: { type: 'nps' },
  };

  it('does NOT render Auto-route section when no fields have scoring', () => {
    renderSettings({ editFields: [], editScoringConfig: null });
    expect(screen.queryByText('Auto-route to CRM')).not.toBeInTheDocument();
  });

  it('renders Auto-route to CRM section when a scored field exists', () => {
    renderSettings({ editFields: [scoredField], editScoringConfig: null });
    expect(screen.getByText('Auto-route to CRM')).toBeInTheDocument();
  });

  it('fetches pipelines when scored field exists', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [{ id: 5, name: 'Sales', stages: [{ id: 10, name: 'New Lead', sortOrder: 0 }] }],
      }),
    });
    global.fetch = fetchMock;

    await act(async () => {
      renderSettings({ editFields: [scoredField], editScoringConfig: null });
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/portal/crm/pipelines');
    });
  });

  it('does NOT fetch pipelines when no scored fields exist', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    await act(async () => {
      renderSettings({ editFields: [], editScoringConfig: null });
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders Enable auto-route checkbox', () => {
    renderSettings({ editFields: [scoredField], editScoringConfig: null });
    expect(screen.getByRole('checkbox', { name: /Enable auto-route/i })).toBeInTheDocument();
  });

  it('calls setEditScoringConfig when Enable auto-route is toggled on', () => {
    const setEditScoringConfig = vi.fn();
    renderSettings({
      editFields: [scoredField],
      editScoringConfig: null,
      setEditScoringConfig,
    });
    const cb = findCheckboxByText(/Enable auto-route/i);
    fireEvent.click(cb);
    expect(setEditScoringConfig).toHaveBeenCalled();
    const arg = setEditScoringConfig.mock.calls[0][0] as SurveyScoringConfig;
    expect(arg.autoRouteToCrm?.enabled).toBe(true);
  });

  it('shows threshold/pipeline/stage/template fields when autoRoute.enabled is true', async () => {
    const scoringConfig: SurveyScoringConfig = {
      autoRouteToCrm: {
        enabled: true,
        minScore: 5,
        pipelineId: 0,
        stageId: 0,
        dealTitleTemplate: 'Lead: {surveyTitle}',
      },
    };

    await act(async () => {
      renderSettings({ editFields: [scoredField], editScoringConfig: scoringConfig });
    });

    // Minimum score: the only spinbutton in the auto-route panel
    expect(screen.getByPlaceholderText('Survey lead: {surveyTitle}')).toBeInTheDocument();
    // The Deal title template input uses that placeholder — check the min score spinbutton
    const spinbuttons = screen.getAllByRole('spinbutton');
    expect(spinbuttons.length).toBeGreaterThanOrEqual(1);
    // Pipeline and Stage selects: "Select a pipeline…" and "Select a stage…" options exist
    expect(screen.getByRole('option', { name: 'Select a pipeline…' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Select a stage…' })).toBeInTheDocument();
  });

  it('calls setEditScoringConfig when minimum score changes', async () => {
    const setEditScoringConfig = vi.fn();
    const scoringConfig: SurveyScoringConfig = {
      autoRouteToCrm: {
        enabled: true,
        minScore: 5,
        pipelineId: 0,
        stageId: 0,
        dealTitleTemplate: 'Lead',
      },
    };

    await act(async () => {
      renderSettings({
        editFields: [scoredField],
        editScoringConfig: scoringConfig,
        setEditScoringConfig,
      });
    });

    // Minimum score is the spinbutton with value 5
    const minScoreInput = screen.getAllByRole('spinbutton').find(
      (el) => (el as HTMLInputElement).value === '5',
    )!;
    fireEvent.change(minScoreInput, { target: { value: '10' } });
    expect(setEditScoringConfig).toHaveBeenCalled();
    const arg = setEditScoringConfig.mock.calls[0][0] as SurveyScoringConfig;
    expect(arg.autoRouteToCrm?.minScore).toBe(10);
  });

  it('renders fetched pipeline options', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [{ id: 7, name: 'Enterprise', stages: [] }],
      }),
    });

    const scoringConfig: SurveyScoringConfig = {
      autoRouteToCrm: {
        enabled: true,
        minScore: 0,
        pipelineId: 0,
        stageId: 0,
        dealTitleTemplate: '',
      },
    };

    await act(async () => {
      renderSettings({ editFields: [scoredField], editScoringConfig: scoringConfig });
    });

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Enterprise' })).toBeInTheDocument();
    });
  });

  it('shows stage options from selected pipeline', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          {
            id: 3,
            name: 'SMB',
            stages: [{ id: 11, name: 'Qualified', sortOrder: 0 }],
          },
        ],
      }),
    });

    const scoringConfig: SurveyScoringConfig = {
      autoRouteToCrm: {
        enabled: true,
        minScore: 0,
        pipelineId: 3,
        stageId: 0,
        dealTitleTemplate: '',
      },
    };

    await act(async () => {
      renderSettings({ editFields: [scoredField], editScoringConfig: scoringConfig });
    });

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Qualified' })).toBeInTheDocument();
    });
  });

  it('calls setEditScoringConfig when deal title template changes', async () => {
    const setEditScoringConfig = vi.fn();
    const scoringConfig: SurveyScoringConfig = {
      autoRouteToCrm: {
        enabled: true,
        minScore: 0,
        pipelineId: 0,
        stageId: 0,
        dealTitleTemplate: 'Old title',
      },
    };

    await act(async () => {
      renderSettings({
        editFields: [scoredField],
        editScoringConfig: scoringConfig,
        setEditScoringConfig,
      });
    });

    // Deal title template input: find by its value
    const templateInput = screen.getByDisplayValue('Old title');
    fireEvent.change(templateInput, { target: { value: 'New: {surveyTitle}' } });
    expect(setEditScoringConfig).toHaveBeenCalled();
    const arg = setEditScoringConfig.mock.calls[0][0] as SurveyScoringConfig;
    expect(arg.autoRouteToCrm?.dealTitleTemplate).toBe('New: {surveyTitle}');
  });
});
