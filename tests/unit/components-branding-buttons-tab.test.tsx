// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { ButtonsTab } from '@/app/portal/branding/profiles/[profileId]/_components/ButtonsTab';
import type { ButtonPreset, ButtonStyle, ProfileData } from '@/app/portal/branding/profiles/[profileId]/_lib/types';

// ---------------------------------------------------------------------------
// Helpers: profile fixture factories
// ---------------------------------------------------------------------------

function makeProfile(overrides: Partial<ProfileData> = {}): ProfileData {
  return {
    id: 1,
    name: 'Test Profile',
    isDefault: false,
    logoUrl: '',
    logoAlt: '',
    logoSquareUrl: '',
    logoRectUrl: '',
    logoText: '',
    logoIconUrl: '',
    primaryColor: '#2563eb',
    secondaryColor: '#1e40af',
    accentColor: '#f59e0b',
    backgroundColor: '#ffffff',
    textColor: '#111827',
    headingFont: '',
    bodyFont: '',
    typography: {},
    darkMode: {},
    navTemplate: 'classic',
    navPosition: 'top',
    navBackground: '#ffffff',
    navTextColor: '#111827',
    borderRadius: '8px',
    linkColor: '',
    linkHoverColor: '',
    buttonStyle: {},
    buttonPresets: [],
    faviconUrl: '',
    ogImageUrl: '',
    ...overrides,
  };
}

function makePreset(overrides: Partial<ButtonPreset> = {}): ButtonPreset {
  return {
    id: 'preset-1',
    name: 'Primary',
    backgroundColor: 'brand.primary',
    color: '#ffffff',
    borderRadius: 'brand.btnRadius',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let updateButtonStyle: ReturnType<typeof vi.fn>;
let setButtonPresets: ReturnType<typeof vi.fn>;

beforeEach(() => {
  updateButtonStyle = vi.fn();
  setButtonPresets = vi.fn();
});

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function renderTab(profileOverrides: Partial<ProfileData> = {}) {
  const profile = makeProfile(profileOverrides);
  return render(
    <ButtonsTab
      profile={profile}
      updateButtonStyle={updateButtonStyle}
      setButtonPresets={setButtonPresets}
    />,
  );
}

// ---------------------------------------------------------------------------
// Tests: basic render
// ---------------------------------------------------------------------------

describe('ButtonsTab — basic render', () => {
  it('renders the Button Style heading', () => {
    renderTab();
    expect(screen.getByText('Button Style')).toBeInTheDocument();
  });

  it('renders the "Default Variant" label', () => {
    renderTab();
    expect(screen.getByText('Default Variant')).toBeInTheDocument();
  });

  it('renders the "Button Border Radius" label', () => {
    renderTab();
    expect(screen.getByText('Button Border Radius')).toBeInTheDocument();
  });

  it('renders the "Button Presets" heading', () => {
    renderTab();
    expect(screen.getByText('Button Presets')).toBeInTheDocument();
  });

  it('renders the Preview section label', () => {
    renderTab();
    expect(screen.getByText('Preview')).toBeInTheDocument();
  });

  it('renders "Add preset" button', () => {
    renderTab();
    // Use getByRole to avoid matching the empty-state p tag that also contains "Add preset"
    expect(screen.getByRole('button', { name: /Add preset/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests: variant selector
// ---------------------------------------------------------------------------

describe('ButtonsTab — variant selector', () => {
  it('renders "filled" and "outline" variant buttons', () => {
    renderTab();
    const buttons = screen.getAllByRole('button');
    const filled = buttons.find((b) => b.textContent === 'filled');
    const outline = buttons.find((b) => b.textContent === 'outline');
    expect(filled).toBeInTheDocument();
    expect(outline).toBeInTheDocument();
  });

  it('calls updateButtonStyle with variant=filled when filled is clicked', () => {
    renderTab();
    const buttons = screen.getAllByRole('button');
    const filled = buttons.find((b) => b.textContent === 'filled')!;
    fireEvent.click(filled);
    expect(updateButtonStyle).toHaveBeenCalledWith({ variant: 'filled' });
  });

  it('calls updateButtonStyle with variant=outline when outline is clicked', () => {
    renderTab();
    const buttons = screen.getAllByRole('button');
    const outline = buttons.find((b) => b.textContent === 'outline')!;
    fireEvent.click(outline);
    expect(updateButtonStyle).toHaveBeenCalledWith({ variant: 'outline' });
  });

  it('defaults to "filled" variant when buttonStyle.variant is undefined', () => {
    renderTab({ buttonStyle: {} });
    // "filled" button should have primary border class (border-primary)
    const buttons = screen.getAllByRole('button');
    const filled = buttons.find((b) => b.textContent === 'filled')!;
    expect(filled.className).toContain('border-primary');
  });

  it('highlights outline button when variant is outline', () => {
    renderTab({ buttonStyle: { variant: 'outline' } });
    const buttons = screen.getAllByRole('button');
    const outline = buttons.find((b) => b.textContent === 'outline')!;
    expect(outline.className).toContain('border-primary');
  });
});

// ---------------------------------------------------------------------------
// Tests: border radius presets
// ---------------------------------------------------------------------------

describe('ButtonsTab — border radius presets', () => {
  it('renders all four radius preset buttons', () => {
    renderTab();
    expect(screen.getByText('Sharp')).toBeInTheDocument();
    expect(screen.getByText('Subtle')).toBeInTheDocument();
    expect(screen.getByText('Rounded')).toBeInTheDocument();
    expect(screen.getByText('Pill')).toBeInTheDocument();
  });

  it('calls updateButtonStyle with borderRadius=0px when Sharp clicked', () => {
    renderTab();
    fireEvent.click(screen.getByText('Sharp'));
    expect(updateButtonStyle).toHaveBeenCalledWith({ borderRadius: '0px' });
  });

  it('calls updateButtonStyle with borderRadius=4px when Subtle clicked', () => {
    renderTab();
    fireEvent.click(screen.getByText('Subtle'));
    expect(updateButtonStyle).toHaveBeenCalledWith({ borderRadius: '4px' });
  });

  it('calls updateButtonStyle with borderRadius=8px when Rounded clicked', () => {
    renderTab();
    fireEvent.click(screen.getByText('Rounded'));
    expect(updateButtonStyle).toHaveBeenCalledWith({ borderRadius: '8px' });
  });

  it('calls updateButtonStyle with borderRadius=9999px when Pill clicked', () => {
    renderTab();
    fireEvent.click(screen.getByText('Pill'));
    expect(updateButtonStyle).toHaveBeenCalledWith({ borderRadius: '9999px' });
  });

  it('highlights the active radius preset', () => {
    renderTab({ buttonStyle: { borderRadius: '8px' } });
    const rounded = screen.getByText('Rounded').closest('button')!;
    expect(rounded.className).toContain('border-primary');
  });
});

// ---------------------------------------------------------------------------
// Tests: border radius text input
// ---------------------------------------------------------------------------

describe('ButtonsTab — border radius text input', () => {
  it('renders border radius input with current value', () => {
    renderTab({ buttonStyle: { borderRadius: '12px' } });
    const inputs = screen.getAllByRole('textbox');
    const radiusInput = inputs.find(
      (i) => (i as HTMLInputElement).placeholder === '8px',
    ) as HTMLInputElement;
    expect(radiusInput).toBeTruthy();
    expect(radiusInput.value).toBe('12px');
  });

  it('calls updateButtonStyle when border radius input changes', () => {
    renderTab();
    const inputs = screen.getAllByRole('textbox');
    const radiusInput = inputs.find(
      (i) => (i as HTMLInputElement).placeholder === '8px',
    )!;
    fireEvent.change(radiusInput, { target: { value: '16px' } });
    expect(updateButtonStyle).toHaveBeenCalledWith({ borderRadius: '16px' });
  });
});

// ---------------------------------------------------------------------------
// Tests: button color inputs
// ---------------------------------------------------------------------------

describe('ButtonsTab — primary button color inputs', () => {
  it('renders primary background text input', () => {
    renderTab({ buttonStyle: { primaryBg: '#ff0000' } });
    const inputs = screen.getAllByRole('textbox');
    const primaryBgInput = inputs.find(
      (i) => (i as HTMLInputElement).value === '#ff0000',
    ) as HTMLInputElement | undefined;
    expect(primaryBgInput).toBeTruthy();
  });

  it('calls updateButtonStyle with primaryBg when primary bg text input changes', () => {
    renderTab({ buttonStyle: { primaryBg: '' } });
    const inputs = screen.getAllByRole('textbox');
    // The primary bg text input has placeholder matching primaryColor
    const primaryBgInput = inputs.find(
      (i) => (i as HTMLInputElement).placeholder === '#2563eb',
    )!;
    fireEvent.change(primaryBgInput, { target: { value: '#aa0000' } });
    expect(updateButtonStyle).toHaveBeenCalledWith({ primaryBg: '#aa0000' });
  });

  it('calls updateButtonStyle with primaryText when primary text color input changes', () => {
    renderTab({ buttonStyle: { primaryText: '' } });
    const inputs = screen.getAllByRole('textbox');
    const primaryTextInput = inputs.find(
      (i) => (i as HTMLInputElement).placeholder === '#ffffff',
    )!;
    fireEvent.change(primaryTextInput, { target: { value: '#000000' } });
    expect(updateButtonStyle).toHaveBeenCalledWith({ primaryText: '#000000' });
  });
});

describe('ButtonsTab — secondary button color inputs', () => {
  it('calls updateButtonStyle with secondaryBg when secondary bg text input changes', () => {
    renderTab({ buttonStyle: { secondaryBg: '' }, secondaryColor: '#1e40af' });
    const inputs = screen.getAllByRole('textbox');
    const secondaryBgInput = inputs.find(
      (i) => (i as HTMLInputElement).placeholder === '#1e40af',
    )!;
    fireEvent.change(secondaryBgInput, { target: { value: '#0000aa' } });
    expect(updateButtonStyle).toHaveBeenCalledWith({ secondaryBg: '#0000aa' });
  });
});

// ---------------------------------------------------------------------------
// Tests: button preview
// ---------------------------------------------------------------------------

describe('ButtonsTab — button preview', () => {
  it('renders Primary Button preview element', () => {
    renderTab();
    // Multiple "Primary Button" texts exist (multiple preview buttons); just check at least one
    expect(screen.getAllByText('Primary Button').length).toBeGreaterThanOrEqual(1);
  });

  it('renders Secondary Button preview element', () => {
    renderTab();
    expect(screen.getAllByText('Secondary Button').length).toBeGreaterThanOrEqual(1);
  });

  it('shows "Outline" label in preview when variant is filled', () => {
    renderTab({ buttonStyle: { variant: 'filled' } });
    // The preview area label uses a span with text "Outline variant:"
    expect(screen.getByText(/Outline\s+variant:/i)).toBeInTheDocument();
  });

  it('shows "Filled" label in preview when variant is outline', () => {
    renderTab({ buttonStyle: { variant: 'outline' } });
    expect(screen.getByText(/Filled\s+variant:/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests: button presets — empty state
// ---------------------------------------------------------------------------

describe('ButtonsTab — button presets empty state', () => {
  it('shows empty-state message when there are no presets', () => {
    renderTab({ buttonPresets: [] });
    expect(screen.getByText(/No presets yet/i)).toBeInTheDocument();
  });

  it('does not show empty-state message when presets exist', () => {
    renderTab({ buttonPresets: [makePreset()] });
    expect(screen.queryByText(/No presets yet/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: button presets — add
// ---------------------------------------------------------------------------

describe('ButtonsTab — addPreset', () => {
  it('calls setButtonPresets with a new preset when "Add preset" is clicked', () => {
    renderTab({ buttonPresets: [] });
    fireEvent.click(screen.getByRole('button', { name: /Add preset/i }));
    expect(setButtonPresets).toHaveBeenCalledOnce();
    const arg = setButtonPresets.mock.calls[0][0] as ButtonPreset[];
    expect(arg).toHaveLength(1);
    expect(arg[0].name).toBe('Primary');
  });

  it('names the first preset "Primary"', () => {
    renderTab({ buttonPresets: [] });
    fireEvent.click(screen.getByRole('button', { name: /Add preset/i }));
    const arg = setButtonPresets.mock.calls[0][0] as ButtonPreset[];
    expect(arg[0].name).toBe('Primary');
  });

  it('names additional presets "Preset N"', () => {
    const existing = [makePreset({ id: 'p1', name: 'Primary' })];
    renderTab({ buttonPresets: existing });
    fireEvent.click(screen.getByRole('button', { name: /Add preset/i }));
    const arg = setButtonPresets.mock.calls[0][0] as ButtonPreset[];
    expect(arg[1].name).toBe('Preset 2');
  });

  it('new preset has backgroundColor=brand.primary', () => {
    renderTab({ buttonPresets: [] });
    fireEvent.click(screen.getByRole('button', { name: /Add preset/i }));
    const arg = setButtonPresets.mock.calls[0][0] as ButtonPreset[];
    expect(arg[0].backgroundColor).toBe('brand.primary');
  });

  it('new preset has color=#ffffff', () => {
    renderTab({ buttonPresets: [] });
    fireEvent.click(screen.getByRole('button', { name: /Add preset/i }));
    const arg = setButtonPresets.mock.calls[0][0] as ButtonPreset[];
    expect(arg[0].color).toBe('#ffffff');
  });
});

// ---------------------------------------------------------------------------
// Tests: button presets — render
// ---------------------------------------------------------------------------

describe('ButtonsTab — preset rendering', () => {
  it('renders preset name in the name input', () => {
    renderTab({ buttonPresets: [makePreset({ name: 'Call To Action' })] });
    const inputs = screen.getAllByRole('textbox');
    const nameInput = inputs.find(
      (i) => (i as HTMLInputElement).value === 'Call To Action',
    ) as HTMLInputElement;
    expect(nameInput).toBeTruthy();
  });

  it('renders the preset preview span with preset name as text', () => {
    renderTab({ buttonPresets: [makePreset({ name: 'MyBtn' })] });
    // The PresetPreview renders a <span> with the preset name
    const spans = document.querySelectorAll('span');
    const previewSpan = Array.from(spans).find((s) => s.textContent === 'MyBtn');
    expect(previewSpan).toBeTruthy();
  });

  it('renders move-up, move-down, and delete buttons for each preset', () => {
    renderTab({ buttonPresets: [makePreset({ id: 'p1', name: 'One' })] });
    expect(screen.getByTitle('Move up')).toBeInTheDocument();
    expect(screen.getByTitle('Move down')).toBeInTheDocument();
    expect(screen.getByTitle('Delete preset')).toBeInTheDocument();
  });

  it('renders two presets as two separate cards', () => {
    renderTab({
      buttonPresets: [
        makePreset({ id: 'p1', name: 'First' }),
        makePreset({ id: 'p2', name: 'Second' }),
      ],
    });
    expect(screen.getAllByTitle('Delete preset')).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Tests: button presets — update
// ---------------------------------------------------------------------------

describe('ButtonsTab — updatePreset', () => {
  it('calls setButtonPresets with updated name when name input changes', () => {
    const preset = makePreset({ id: 'p1', name: 'Old Name' });
    renderTab({ buttonPresets: [preset] });
    const inputs = screen.getAllByRole('textbox');
    const nameInput = inputs.find(
      (i) => (i as HTMLInputElement).value === 'Old Name',
    )!;
    fireEvent.change(nameInput, { target: { value: 'New Name' } });
    expect(setButtonPresets).toHaveBeenCalledOnce();
    const arg = setButtonPresets.mock.calls[0][0] as ButtonPreset[];
    expect(arg[0].name).toBe('New Name');
  });

  it('calls setButtonPresets with updated borderStyle when select changes', () => {
    const preset = makePreset({ id: 'p1' });
    renderTab({ buttonPresets: [preset] });
    // The border style select has options Solid/Dashed/Dotted/None
    const selects = screen.getAllByRole('combobox');
    const borderStyleSelect = selects[0]; // first select is borderStyle
    fireEvent.change(borderStyleSelect, { target: { value: 'dashed' } });
    expect(setButtonPresets).toHaveBeenCalledOnce();
    const arg = setButtonPresets.mock.calls[0][0] as ButtonPreset[];
    expect(arg[0].borderStyle).toBe('dashed');
  });

  it('calls setButtonPresets with undefined borderStyle when empty option selected', () => {
    const preset = makePreset({ id: 'p1', borderStyle: 'solid' });
    renderTab({ buttonPresets: [preset] });
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: '' } });
    expect(setButtonPresets).toHaveBeenCalledOnce();
    const arg = setButtonPresets.mock.calls[0][0] as ButtonPreset[];
    expect(arg[0].borderStyle).toBeUndefined();
  });

  it('calls setButtonPresets with updated textTransform when select changes', () => {
    const preset = makePreset({ id: 'p1' });
    renderTab({ buttonPresets: [preset] });
    const selects = screen.getAllByRole('combobox');
    const textTransformSelect = selects[1]; // second select is textTransform
    fireEvent.change(textTransformSelect, { target: { value: 'uppercase' } });
    expect(setButtonPresets).toHaveBeenCalledOnce();
    const arg = setButtonPresets.mock.calls[0][0] as ButtonPreset[];
    expect(arg[0].textTransform).toBe('uppercase');
  });
});

// ---------------------------------------------------------------------------
// Tests: button presets — remove
// ---------------------------------------------------------------------------

describe('ButtonsTab — removePreset', () => {
  it('removes the preset when delete button is clicked', () => {
    const preset = makePreset({ id: 'p1', name: 'Gone' });
    renderTab({ buttonPresets: [preset] });
    fireEvent.click(screen.getByTitle('Delete preset'));
    expect(setButtonPresets).toHaveBeenCalledOnce();
    const arg = setButtonPresets.mock.calls[0][0] as ButtonPreset[];
    expect(arg).toHaveLength(0);
  });

  it('removes only the targeted preset when multiple exist', () => {
    const presets = [
      makePreset({ id: 'p1', name: 'Keep' }),
      makePreset({ id: 'p2', name: 'Delete' }),
    ];
    renderTab({ buttonPresets: presets });
    const deleteBtns = screen.getAllByTitle('Delete preset');
    fireEvent.click(deleteBtns[1]); // delete "Delete"
    const arg = setButtonPresets.mock.calls[0][0] as ButtonPreset[];
    expect(arg).toHaveLength(1);
    expect(arg[0].name).toBe('Keep');
  });
});

// ---------------------------------------------------------------------------
// Tests: button presets — move
// ---------------------------------------------------------------------------

describe('ButtonsTab — movePreset', () => {
  it('moves preset up when move-up button is clicked', () => {
    const presets = [
      makePreset({ id: 'p1', name: 'First' }),
      makePreset({ id: 'p2', name: 'Second' }),
    ];
    renderTab({ buttonPresets: presets });
    const upBtns = screen.getAllByTitle('Move up');
    // Move "Second" (index 1) up
    fireEvent.click(upBtns[1]);
    const arg = setButtonPresets.mock.calls[0][0] as ButtonPreset[];
    expect(arg[0].name).toBe('Second');
    expect(arg[1].name).toBe('First');
  });

  it('disables move-up button for the first preset', () => {
    renderTab({ buttonPresets: [makePreset({ id: 'p1', name: 'Only' })] });
    expect(screen.getByTitle('Move up')).toBeDisabled();
  });

  it('disables move-down button for the last preset', () => {
    renderTab({ buttonPresets: [makePreset({ id: 'p1', name: 'Only' })] });
    expect(screen.getByTitle('Move down')).toBeDisabled();
  });

  it('moves preset down when move-down button is clicked', () => {
    const presets = [
      makePreset({ id: 'p1', name: 'Alpha' }),
      makePreset({ id: 'p2', name: 'Beta' }),
    ];
    renderTab({ buttonPresets: presets });
    const downBtns = screen.getAllByTitle('Move down');
    fireEvent.click(downBtns[0]); // Move "Alpha" down
    const arg = setButtonPresets.mock.calls[0][0] as ButtonPreset[];
    expect(arg[0].name).toBe('Beta');
    expect(arg[1].name).toBe('Alpha');
  });

  it('does not call setButtonPresets when clicking disabled move-up on first item', () => {
    renderTab({ buttonPresets: [makePreset({ id: 'p1', name: 'Solo' })] });
    const upBtn = screen.getByTitle('Move up');
    fireEvent.click(upBtn); // disabled — should be a no-op
    expect(setButtonPresets).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: PresetField inputs within a preset card
// ---------------------------------------------------------------------------

describe('ButtonsTab — PresetField inputs', () => {
  it('renders background field with brand.primary value', () => {
    renderTab({
      buttonPresets: [makePreset({ id: 'p1', backgroundColor: 'brand.primary' })],
    });
    const inputs = screen.getAllByRole('textbox');
    const bgInput = inputs.find(
      (i) => (i as HTMLInputElement).value === 'brand.primary',
    ) as HTMLInputElement;
    expect(bgInput).toBeTruthy();
  });

  it('calls setButtonPresets with updated backgroundColor when background field changes', () => {
    renderTab({
      buttonPresets: [makePreset({ id: 'p1', backgroundColor: 'brand.primary' })],
    });
    const inputs = screen.getAllByRole('textbox');
    const bgInput = inputs.find(
      (i) => (i as HTMLInputElement).value === 'brand.primary',
    )!;
    fireEvent.change(bgInput, { target: { value: '#112233' } });
    const arg = setButtonPresets.mock.calls[0][0] as ButtonPreset[];
    expect(arg[0].backgroundColor).toBe('#112233');
  });

  it('renders border radius field with brand.btnRadius value', () => {
    renderTab({
      buttonPresets: [makePreset({ id: 'p1', borderRadius: 'brand.btnRadius' })],
    });
    const inputs = screen.getAllByRole('textbox');
    const radInput = inputs.find(
      (i) => (i as HTMLInputElement).value === 'brand.btnRadius',
    ) as HTMLInputElement;
    expect(radInput).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests: PresetPreview brand sentinel resolution
// ---------------------------------------------------------------------------

describe('ButtonsTab — PresetPreview sentinel resolution', () => {
  it('uses brandingPrimary color when preset backgroundColor=brand.primary', () => {
    const profile = makeProfile({
      primaryColor: '#abcdef',
      buttonStyle: { borderRadius: '6px' },
      buttonPresets: [
        makePreset({
          id: 'p1',
          name: 'BrandBtn',
          backgroundColor: 'brand.primary',
          color: '#ffffff',
        }),
      ],
    });
    render(
      <ButtonsTab
        profile={profile}
        updateButtonStyle={updateButtonStyle}
        setButtonPresets={setButtonPresets}
      />,
    );
    // The PresetPreview span gets backgroundColor resolved to #abcdef
    const spans = document.querySelectorAll('span');
    const previewSpan = Array.from(spans).find((s) => s.textContent === 'BrandBtn') as HTMLElement;
    expect(previewSpan).toBeTruthy();
    expect(previewSpan.style.backgroundColor).toBe('rgb(171, 205, 239)');
  });

  it('renders preset name "Button" as fallback when name is empty', () => {
    renderTab({
      buttonPresets: [makePreset({ id: 'p1', name: '' })],
    });
    // PresetPreview span shows "Button" when name is falsy
    const spans = document.querySelectorAll('span');
    const previewSpan = Array.from(spans).find((s) => s.textContent === 'Button');
    expect(previewSpan).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests: button style color controls — color type inputs
// ---------------------------------------------------------------------------

describe('ButtonsTab — color-type inputs', () => {
  it('renders a primary bg color-picker input with correct value', () => {
    renderTab({ buttonStyle: { primaryBg: '#ff5500' } });
    const colorInputs = document.querySelectorAll('input[type="color"]');
    const primaryBgColor = Array.from(colorInputs).find(
      (i) => (i as HTMLInputElement).value === '#ff5500',
    );
    expect(primaryBgColor).toBeTruthy();
  });

  it('calls updateButtonStyle with primaryBg when color picker changes', () => {
    renderTab({ buttonStyle: { primaryBg: '#ff5500' } });
    const colorInputs = document.querySelectorAll('input[type="color"]');
    const primaryBgColor = Array.from(colorInputs).find(
      (i) => (i as HTMLInputElement).value === '#ff5500',
    )!;
    fireEvent.change(primaryBgColor, { target: { value: '#00ff00' } });
    expect(updateButtonStyle).toHaveBeenCalledWith({ primaryBg: '#00ff00' });
  });

  it('calls updateButtonStyle with primaryText when primary text color picker changes', () => {
    renderTab({ buttonStyle: { primaryText: '#000000' } });
    const colorInputs = document.querySelectorAll('input[type="color"]');
    const primaryTextColor = Array.from(colorInputs).find(
      (i) => (i as HTMLInputElement).value === '#000000',
    )!;
    fireEvent.change(primaryTextColor, { target: { value: '#ffffff' } });
    expect(updateButtonStyle).toHaveBeenCalledWith({ primaryText: '#ffffff' });
  });
});
