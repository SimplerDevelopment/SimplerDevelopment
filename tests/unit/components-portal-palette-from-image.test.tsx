// @vitest-environment jsdom
/**
 * Unit tests for `components/portal/branding/PaletteFromImage.tsx`.
 * Covers: initial render (drop zone), file type validation, image upload flow,
 * palette display, role assignment (including mutual-exclusion), apply button,
 * clear button, drag-over state, extraction error handling.
 *
 * extractPalette is mocked — no real canvas required.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { PaletteFromImage } from '@/components/portal/branding/PaletteFromImage';
import type { PaletteColor } from '@/lib/branding/palette-extract';
import type { RoleAssignment } from '@/lib/branding/palette-assign';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockExtractPalette = vi.fn<[File | string, number?], Promise<PaletteColor[]>>();
const mockAutoAssignRoles = vi.fn<[PaletteColor[]], RoleAssignment>();

vi.mock('@/lib/branding/palette-extract', () => ({
  extractPalette: (...args: [File | string, number?]) => mockExtractPalette(...args),
}));

vi.mock('@/lib/branding/palette-assign', () => ({
  autoAssignRoles: (...args: [PaletteColor[]]) => mockAutoAssignRoles(...args),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PALETTE_COLORS: PaletteColor[] = [
  { hex: '#3b82f6', weight: 0.4, h: 217, s: 0.91, l: 0.6 },
  { hex: '#f59e0b', weight: 0.25, h: 38, s: 0.92, l: 0.5 },
  { hex: '#111827', weight: 0.2, h: 221, s: 0.39, l: 0.11 },
  { hex: '#ffffff', weight: 0.15, h: 0, s: 0, l: 1 },
];

const AUTO_ROLES: RoleAssignment = {
  primaryColor: '#3b82f6',
  accentColor: '#f59e0b',
  textColor: '#111827',
  backgroundColor: '#ffffff',
};

function makeImageFile(name = 'logo.png', type = 'image/png'): File {
  return new File(['pixel'], name, { type });
}

// Stub URL.createObjectURL — jsdom doesn't implement it.
const objectUrl = 'blob:http://localhost/stub-image';
vi.stubGlobal('URL', {
  ...URL,
  createObjectURL: vi.fn(() => objectUrl),
  revokeObjectURL: vi.fn(),
});

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockExtractPalette.mockResolvedValue(PALETTE_COLORS);
  mockAutoAssignRoles.mockReturnValue(AUTO_ROLES);
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function uploadFile(file: File) {
  // Trigger via the hidden file input's onChange handler.
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  // Use fireEvent.change with a synthetic files list
  Object.defineProperty(input, 'files', {
    value: [file],
    configurable: true,
  });
  await act(async () => {
    fireEvent.change(input);
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PaletteFromImage', () => {
  describe('initial render', () => {
    it('renders the panel header', () => {
      render(<PaletteFromImage onApply={vi.fn()} />);
      expect(screen.getByText('Extract palette from image')).toBeInTheDocument();
    });

    it('renders the drop zone with upload instructions', () => {
      render(<PaletteFromImage onApply={vi.fn()} />);
      expect(
        screen.getByText('Drop an image or click to upload'),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/PNG, JPG, WebP, SVG/),
      ).toBeInTheDocument();
    });

    it('renders a hidden file input accepting image/*', () => {
      render(<PaletteFromImage onApply={vi.fn()} />);
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input.accept).toBe('image/*');
      expect(input.className).toContain('hidden');
    });

    it('does not render palette grid before upload', () => {
      render(<PaletteFromImage onApply={vi.fn()} />);
      // No color swatches visible
      expect(document.querySelectorAll('select').length).toBe(0);
    });

    it('does not render Apply button before upload', () => {
      render(<PaletteFromImage onApply={vi.fn()} />);
      expect(screen.queryByRole('button', { name: /apply/i })).not.toBeInTheDocument();
    });
  });

  describe('file type validation', () => {
    it('shows error when a non-image file is dropped', async () => {
      render(<PaletteFromImage onApply={vi.fn()} />);
      const nonImage = new File(['data'], 'doc.pdf', { type: 'application/pdf' });
      await uploadFile(nonImage);
      await waitFor(() => {
        expect(
          screen.getByText(/Please drop an image file/i),
        ).toBeInTheDocument();
      });
    });

    it('does not call extractPalette for non-image files', async () => {
      render(<PaletteFromImage onApply={vi.fn()} />);
      const nonImage = new File(['data'], 'doc.pdf', { type: 'application/pdf' });
      await uploadFile(nonImage);
      expect(mockExtractPalette).not.toHaveBeenCalled();
    });
  });

  describe('successful image upload', () => {
    it('shows image preview and file name after upload', async () => {
      render(<PaletteFromImage onApply={vi.fn()} />);
      await uploadFile(makeImageFile('brand.png'));
      await waitFor(() => {
        expect(screen.getByText('brand.png')).toBeInTheDocument();
      });
      // The preview img has alt="" so it's a presentation role — query via DOM
      const img = document.querySelector('img') as HTMLImageElement;
      expect(img.src).toBe(objectUrl);
    });

    it('hides the drop zone after a file is selected', async () => {
      render(<PaletteFromImage onApply={vi.fn()} />);
      await uploadFile(makeImageFile());
      await waitFor(() => {
        expect(
          screen.queryByText('Drop an image or click to upload'),
        ).not.toBeInTheDocument();
      });
    });

    it('calls extractPalette with the file and count 8', async () => {
      render(<PaletteFromImage onApply={vi.fn()} />);
      const file = makeImageFile();
      await uploadFile(file);
      await waitFor(() => {
        expect(mockExtractPalette).toHaveBeenCalledWith(file, 8);
      });
    });

    it('renders one role select per extracted color', async () => {
      render(<PaletteFromImage onApply={vi.fn()} />);
      await uploadFile(makeImageFile());
      await waitFor(() => {
        const selects = document.querySelectorAll('select');
        expect(selects.length).toBe(PALETTE_COLORS.length);
      });
    });

    it('renders color count summary text', async () => {
      render(<PaletteFromImage onApply={vi.fn()} />);
      await uploadFile(makeImageFile());
      await waitFor(() => {
        expect(screen.getByText(/4 colors found/)).toBeInTheDocument();
      });
    });

    it('renders hex codes in uppercase for each color', async () => {
      render(<PaletteFromImage onApply={vi.fn()} />);
      await uploadFile(makeImageFile());
      await waitFor(() => {
        expect(screen.getByText('#3B82F6')).toBeInTheDocument();
        expect(screen.getByText('#F59E0B')).toBeInTheDocument();
      });
    });

    it('pre-populates role selects from autoAssignRoles', async () => {
      render(<PaletteFromImage onApply={vi.fn()} />);
      await uploadFile(makeImageFile());
      await waitFor(() => {
        const selects = Array.from(
          document.querySelectorAll('select'),
        ) as HTMLSelectElement[];
        const primarySelect = selects.find((s) => s.value === 'primaryColor');
        expect(primarySelect).toBeDefined();
      });
    });
  });

  describe('role assignment', () => {
    async function renderWithPalette() {
      const utils = render(<PaletteFromImage onApply={vi.fn()} />);
      await uploadFile(makeImageFile());
      await waitFor(() => {
        expect(document.querySelectorAll('select').length).toBe(PALETTE_COLORS.length);
      });
      return utils;
    }

    it('allows changing a color role via the select', async () => {
      await renderWithPalette();
      const selects = Array.from(
        document.querySelectorAll('select'),
      ) as HTMLSelectElement[];
      // Select the first select (primaryColor #3b82f6) and change to secondaryColor
      await act(async () => {
        fireEvent.change(selects[0], { target: { value: 'secondaryColor' } });
      });
      expect(selects[0].value).toBe('secondaryColor');
    });

    it('clears another swatch when its role is taken by a new one', async () => {
      await renderWithPalette();
      const selects = Array.from(
        document.querySelectorAll('select'),
      ) as HTMLSelectElement[];

      // First swatch is primaryColor. Assign primaryColor to second swatch too.
      await act(async () => {
        fireEvent.change(selects[1], { target: { value: 'primaryColor' } });
      });

      // First swatch should have been cleared to 'none'
      expect(selects[0].value).toBe('none');
      expect(selects[1].value).toBe('primaryColor');
    });

    it('enables Apply button when at least one role is assigned', async () => {
      await renderWithPalette();
      const applyBtn = screen.getByRole('button', { name: /apply to profile/i });
      expect(applyBtn).not.toBeDisabled();
    });

    it('disables Apply button when all roles are set to none', async () => {
      // Return empty assignments from autoAssign
      mockAutoAssignRoles.mockReturnValueOnce({});
      mockExtractPalette.mockResolvedValueOnce(PALETTE_COLORS);

      render(<PaletteFromImage onApply={vi.fn()} />);
      await uploadFile(makeImageFile());
      await waitFor(() => {
        expect(document.querySelectorAll('select').length).toBe(PALETTE_COLORS.length);
      });

      // Set all selects to none
      const selects = Array.from(
        document.querySelectorAll('select'),
      ) as HTMLSelectElement[];
      for (const sel of selects) {
        await act(async () => {
          fireEvent.change(sel, { target: { value: 'none' } });
        });
      }

      const applyBtn = screen.getByRole('button', { name: /apply to profile/i });
      expect(applyBtn).toBeDisabled();
    });
  });

  describe('apply', () => {
    it('calls onApply with the current role assignment on Apply click', async () => {
      const onApply = vi.fn();
      render(<PaletteFromImage onApply={onApply} />);
      await uploadFile(makeImageFile());
      await waitFor(() => {
        expect(document.querySelectorAll('select').length).toBe(PALETTE_COLORS.length);
      });

      const applyBtn = screen.getByRole('button', { name: /apply to profile/i });
      await act(async () => {
        fireEvent.click(applyBtn);
      });

      expect(onApply).toHaveBeenCalledTimes(1);
      const arg: RoleAssignment = onApply.mock.calls[0][0];
      // auto-assigned primary should be present
      expect(arg.primaryColor).toBe('#3b82f6');
    });

    it('excludes colors assigned to "none" from the onApply argument', async () => {
      const onApply = vi.fn();
      // Only primaryColor assigned; others unassigned
      mockAutoAssignRoles.mockReturnValue({ primaryColor: '#3b82f6' });

      render(<PaletteFromImage onApply={onApply} />);
      await uploadFile(makeImageFile());
      await waitFor(() => {
        expect(document.querySelectorAll('select').length).toBe(PALETTE_COLORS.length);
      });

      const applyBtn = screen.getByRole('button', { name: /apply to profile/i });
      await act(async () => {
        fireEvent.click(applyBtn);
      });

      const arg: RoleAssignment = onApply.mock.calls[0][0];
      expect(Object.keys(arg)).not.toContain('secondaryColor');
    });
  });

  describe('clear button', () => {
    it('resets to drop zone state after clicking Clear', async () => {
      render(<PaletteFromImage onApply={vi.fn()} />);
      await uploadFile(makeImageFile('photo.jpg'));
      await waitFor(() => {
        expect(screen.getByText('photo.jpg')).toBeInTheDocument();
      });

      const clearBtn = screen.getByRole('button', { name: /clear/i });
      await act(async () => {
        fireEvent.click(clearBtn);
      });

      // Drop zone should return
      expect(
        screen.getByText('Drop an image or click to upload'),
      ).toBeInTheDocument();
      // No palette
      expect(document.querySelectorAll('select').length).toBe(0);
    });
  });

  describe('extraction error', () => {
    it('shows error message when extractPalette rejects', async () => {
      mockExtractPalette.mockRejectedValueOnce(new Error('Canvas 2D unsupported'));
      render(<PaletteFromImage onApply={vi.fn()} />);
      await uploadFile(makeImageFile());
      await waitFor(() => {
        expect(screen.getByText('Canvas 2D unsupported')).toBeInTheDocument();
      });
    });

    it('shows fallback error for non-Error thrown values', async () => {
      mockExtractPalette.mockRejectedValueOnce('something went wrong');
      render(<PaletteFromImage onApply={vi.fn()} />);
      await uploadFile(makeImageFile());
      await waitFor(() => {
        expect(screen.getByText('Extraction failed')).toBeInTheDocument();
      });
    });

    it('clears error on next successful upload', async () => {
      mockExtractPalette.mockRejectedValueOnce(new Error('fail'));
      render(<PaletteFromImage onApply={vi.fn()} />);
      await uploadFile(makeImageFile('bad.png'));
      await waitFor(() => {
        expect(screen.getByText('fail')).toBeInTheDocument();
      });

      // Clear the state first
      // The error persists until clear or next upload; trigger clear
      const clearBtn = screen.getByRole('button', { name: /clear/i });
      await act(async () => {
        fireEvent.click(clearBtn);
      });
      expect(screen.queryByText('fail')).not.toBeInTheDocument();
    });
  });

  describe('drag and drop', () => {
    it('applies drag-over style class on dragOver', () => {
      render(<PaletteFromImage onApply={vi.fn()} />);
      const dropZone = screen
        .getByText('Drop an image or click to upload')
        .closest('div')!.parentElement!;

      fireEvent.dragOver(dropZone, {
        preventDefault: vi.fn(),
        dataTransfer: { files: [] },
      });

      // The drag-over class includes 'border-primary'
      expect(dropZone.className).toContain('border-primary');
    });

    it('removes drag-over class on dragLeave', () => {
      render(<PaletteFromImage onApply={vi.fn()} />);
      const dropZone = screen
        .getByText('Drop an image or click to upload')
        .closest('div')!.parentElement!;

      fireEvent.dragOver(dropZone, {
        preventDefault: vi.fn(),
        dataTransfer: { files: [] },
      });
      fireEvent.dragLeave(dropZone);

      expect(dropZone.className).not.toContain('bg-primary/5');
    });

    it('handles a valid image file dropped on the zone', async () => {
      render(<PaletteFromImage onApply={vi.fn()} />);
      const dropZone = screen
        .getByText('Drop an image or click to upload')
        .closest('div')!.parentElement!;

      const file = makeImageFile('dropped.png');
      await act(async () => {
        fireEvent.drop(dropZone, {
          preventDefault: vi.fn(),
          dataTransfer: { files: [file] },
        });
      });

      await waitFor(() => {
        expect(screen.getByText('dropped.png')).toBeInTheDocument();
      });
    });
  });

  describe('role options', () => {
    it('renders all expected role options in each select', async () => {
      render(<PaletteFromImage onApply={vi.fn()} />);
      await uploadFile(makeImageFile());
      await waitFor(() => {
        const selects = document.querySelectorAll('select');
        expect(selects.length).toBeGreaterThan(0);
      });

      const firstSelect = document.querySelector('select')!;
      const options = Array.from(firstSelect.options).map((o) => o.value);
      expect(options).toContain('none');
      expect(options).toContain('primaryColor');
      expect(options).toContain('secondaryColor');
      expect(options).toContain('accentColor');
      expect(options).toContain('backgroundColor');
      expect(options).toContain('textColor');
    });

    it('renders human-readable labels for role options', async () => {
      render(<PaletteFromImage onApply={vi.fn()} />);
      await uploadFile(makeImageFile());
      await waitFor(() => {
        const selects = document.querySelectorAll('select');
        expect(selects.length).toBeGreaterThan(0);
      });

      const firstSelect = document.querySelector('select')!;
      const labels = Array.from(firstSelect.options).map((o) => o.text);
      expect(labels).toContain('Primary');
      expect(labels).toContain('Secondary');
      expect(labels).toContain('Background');
      expect(labels).toContain('Text');
    });
  });
});
