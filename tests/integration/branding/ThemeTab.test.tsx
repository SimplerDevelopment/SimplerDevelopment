// Integration coverage for ColorsTab + TypographyTab — the visual identity ("theme") slice of the editor.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ColorsTab } from '@/app/portal/branding/profiles/[profileId]/_components/ColorsTab';
import { TypographyTab } from '@/app/portal/branding/profiles/[profileId]/_components/TypographyTab';
import { PROFILE_DEFAULTS, type ProfileData } from '@/app/portal/branding/profiles/[profileId]/_lib/types';

function makeProfile(overrides: Partial<ProfileData> = {}): ProfileData {
  return {
    id: 1,
    name: 'Test Profile',
    isDefault: false,
    ...PROFILE_DEFAULTS,
    ...overrides,
  } as ProfileData;
}

describe('ColorsTab', () => {
  it('renders colors heading and palette / link-color sections', () => {
    render(<ColorsTab profile={makeProfile()} update={vi.fn()} updateDark={vi.fn()} />);
    // Headings include an inline material-icons span so the accessible name is
    // "<icon> Colors". Match on level + substring to disambiguate "Colors"
    // (h2 top of tab) from "Link Colors" / "Dark Mode Color Overrides" (h3).
    expect(screen.getByRole('heading', { level: 2, name: /Colors/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Link Colors/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Dark Mode Color Overrides/i })).toBeInTheDocument();
  });

  it('emits update() when the primary color hex input is edited', () => {
    const update = vi.fn();
    render(<ColorsTab profile={makeProfile({ primaryColor: '#3b82f6' })} update={update} updateDark={vi.fn()} />);

    // The primary text input is the first one whose value is the seeded primary.
    const primaryHex = screen
      .getAllByDisplayValue('#3b82f6')
      .find((el) => (el as HTMLInputElement).type === 'text') as HTMLInputElement;
    expect(primaryHex).toBeDefined();

    fireEvent.change(primaryHex, { target: { value: '#10b981' } });
    expect(update).toHaveBeenCalledWith({ primaryColor: '#10b981' });
  });

  it('emits updateDark() when a dark-mode override is set', () => {
    const updateDark = vi.fn();
    render(<ColorsTab profile={makeProfile()} update={vi.fn()} updateDark={updateDark} />);

    // Dark-mode primary text input is empty (placeholder shows light value);
    // grab the first one beneath "Dark Mode Color Overrides".
    const darkSectionHeading = screen.getByRole('heading', { name: /Dark Mode Color Overrides/i });
    const darkSection = darkSectionHeading.closest('div');
    const textInputs = darkSection?.querySelectorAll('input[type="text"]') ?? [];
    expect(textInputs.length).toBeGreaterThan(0);

    fireEvent.change(textInputs[0]!, { target: { value: '#222222' } });
    expect(updateDark).toHaveBeenCalledWith({ primaryColor: '#222222' });
  });
});

describe('TypographyTab', () => {
  it('renders typography heading and per-category sections', () => {
    render(<TypographyTab profile={makeProfile()} update={vi.fn()} updateTypo={vi.fn()} />);

    // Each heading also contains a material-icons span so the accessible name
    // includes the icon glyph name (e.g. "text_fields Typography").
    expect(screen.getByRole('heading', { name: /Typography/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Headings/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Body Text/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /UI Elements/i })).toBeInTheDocument();
  });

  it('emits updateTypo() when an element size is edited', () => {
    const updateTypo = vi.fn();
    render(<TypographyTab profile={makeProfile()} update={vi.fn()} updateTypo={updateTypo} />);

    // The H1 row exposes a Size input with placeholder "1rem". Multiple rows
    // share placeholders so we pick the first.
    const sizeInputs = screen.getAllByPlaceholderText('1rem');
    expect(sizeInputs.length).toBeGreaterThan(0);
    fireEvent.change(sizeInputs[0], { target: { value: '3rem' } });

    expect(updateTypo).toHaveBeenCalled();
    const args = updateTypo.mock.calls[0];
    expect(args[1]).toEqual({ size: '3rem' });
  });
});
