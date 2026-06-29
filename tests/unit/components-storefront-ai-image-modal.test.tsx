// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

import AiImageModal from '@/components/storefront/designer/AiImageModal';
import type { UploadedImageResult } from '@/lib/designer/types';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/designer/aiPromptHistory', () => ({
  listAiPromptHistory: vi.fn(() => []),
  recordAiPrompt: vi.fn(),
}));

vi.mock('@/lib/designer/aiPromptBuilder', () => ({
  // no runtime usage in the modal; re-exported type only
}));

// ---------------------------------------------------------------------------
// Import mocked modules so we can control return values per-test
// ---------------------------------------------------------------------------
import { listAiPromptHistory, recordAiPrompt } from '@/lib/designer/aiPromptHistory';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVariant(url = 'https://cdn.test/img.png'): UploadedImageResult {
  return { url, width: 512, height: 512 };
}

function defaultProps(overrides?: Partial<React.ComponentProps<typeof AiImageModal>>) {
  return {
    open: true,
    onClose: vi.fn(),
    onGenerate: vi.fn(),
    onPick: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AiImageModal', () => {
  beforeEach(() => {
    vi.mocked(listAiPromptHistory).mockReturnValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── Visibility ────────────────────────────────────────────────────────────

  it('renders nothing when open=false', () => {
    const { container } = render(<AiImageModal {...defaultProps({ open: false })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the dialog when open=true', () => {
    render(<AiImageModal {...defaultProps()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows "Generate AI image" heading in default mode', () => {
    render(<AiImageModal {...defaultProps()} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Generate AI image');
  });

  it('shows "Regenerate AI image" heading in regenerate mode', () => {
    render(<AiImageModal {...defaultProps({ regenerateLayerName: 'Logo layer' })} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Regenerate AI image');
  });

  // ── Close button ──────────────────────────────────────────────────────────

  it('calls onClose when Close button is clicked', () => {
    const onClose = vi.fn();
    render(<AiImageModal {...defaultProps({ onClose })} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Cancel button is clicked', () => {
    const onClose = vi.fn();
    render(<AiImageModal {...defaultProps({ onClose })} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<AiImageModal {...defaultProps({ onClose })} />);
    // backdrop has aria-hidden, select by its class substring
    const backdrop = document.querySelector('.absolute.inset-0.bg-black\\/60');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── Prompt textarea ───────────────────────────────────────────────────────

  it('renders the prompt textarea', () => {
    render(<AiImageModal {...defaultProps()} />);
    expect(screen.getByRole('textbox', { name: /describe your image/i })).toBeInTheDocument();
  });

  it('updates prompt state on input', () => {
    render(<AiImageModal {...defaultProps()} />);
    const textarea = screen.getByRole('textbox', { name: /describe your image/i });
    fireEvent.change(textarea, { target: { value: 'a smiling avocado' } });
    expect(textarea).toHaveValue('a smiling avocado');
  });

  it('shows character count', () => {
    render(<AiImageModal {...defaultProps()} />);
    const textarea = screen.getByRole('textbox', { name: /describe your image/i });
    fireEvent.change(textarea, { target: { value: 'hello' } });
    expect(screen.getByText('5/1000')).toBeInTheDocument();
  });

  // ── Example prompts ───────────────────────────────────────────────────────

  it('shows example prompts when prompt is empty', () => {
    render(<AiImageModal {...defaultProps()} />);
    expect(screen.getByText('a happy corgi wearing a chef hat')).toBeInTheDocument();
  });

  it('clicking an example prompt fills the textarea', () => {
    render(<AiImageModal {...defaultProps()} />);
    fireEvent.click(screen.getByText('a happy corgi wearing a chef hat'));
    const textarea = screen.getByRole('textbox', { name: /describe your image/i });
    expect(textarea).toHaveValue('a happy corgi wearing a chef hat');
  });

  it('hides example prompts once prompt has text', () => {
    render(<AiImageModal {...defaultProps()} />);
    const textarea = screen.getByRole('textbox', { name: /describe your image/i });
    fireEvent.change(textarea, { target: { value: 'something' } });
    expect(screen.queryByText('a happy corgi wearing a chef hat')).not.toBeInTheDocument();
  });

  // ── Style selector ────────────────────────────────────────────────────────

  it('renders all four style options', () => {
    render(<AiImageModal {...defaultProps()} />);
    expect(screen.getByRole('button', { name: /illustration/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /graphic/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /photo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /raw/i })).toBeInTheDocument();
  });

  it('clicking a style option selects it', () => {
    render(<AiImageModal {...defaultProps()} />);
    const photoBtn = screen.getByRole('button', { name: /photo/i });
    fireEvent.click(photoBtn);
    expect(photoBtn.className).toMatch(/border-primary/);
  });

  // ── Variations selector ───────────────────────────────────────────────────

  it('renders variation options in non-regenerate mode', () => {
    render(<AiImageModal {...defaultProps()} />);
    expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '4' })).toBeInTheDocument();
  });

  it('hides variation options in regenerate mode', () => {
    render(<AiImageModal {...defaultProps({ regenerateLayerName: 'Logo' })} />);
    // "2" and "4" buttons should not be present
    expect(screen.queryByRole('button', { name: '2' })).not.toBeInTheDocument();
  });

  it('clicking variation 4 updates the hint text', () => {
    render(<AiImageModal {...defaultProps()} />);
    fireEvent.click(screen.getByRole('button', { name: '4' }));
    expect(screen.getByText(/Generates 4 variants/)).toBeInTheDocument();
  });

  // ── Transparent checkbox ──────────────────────────────────────────────────

  it('renders transparent background checkbox checked by default', () => {
    render(<AiImageModal {...defaultProps()} />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();
  });

  it('toggling checkbox changes its state', () => {
    render(<AiImageModal {...defaultProps()} />);
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  // ── Generate button disabled state ────────────────────────────────────────

  it('Generate button is disabled when prompt is empty', () => {
    render(<AiImageModal {...defaultProps()} />);
    // The button includes a material-icon span so accessible name is e.g.
    // "auto_awesome Generate" — query by the visible text substring
    const genBtn = screen.getByRole('button', { name: /generate$/i });
    expect(genBtn).toBeDisabled();
  });

  it('Generate button is enabled once prompt has text', () => {
    render(<AiImageModal {...defaultProps()} />);
    const textarea = screen.getByRole('textbox', { name: /describe your image/i });
    fireEvent.change(textarea, { target: { value: 'a corgi' } });
    const genBtn = screen.getByRole('button', { name: /generate$/i });
    expect(genBtn).not.toBeDisabled();
  });

  // ── Validation error ──────────────────────────────────────────────────────

  it('shows validation error when generating with whitespace-only prompt', async () => {
    const onGenerate = vi.fn();
    render(<AiImageModal {...defaultProps({ onGenerate })} />);
    const textarea = screen.getByRole('textbox', { name: /describe your image/i });
    // Type spaces and trigger via Cmd+Enter (button is disabled for whitespace)
    fireEvent.change(textarea, { target: { value: '   ' } });
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Describe the image');
    });
    expect(onGenerate).not.toHaveBeenCalled();
  });

  // ── Successful n=1 generate → auto-pick → close ───────────────────────────

  it('auto-picks and closes on n=1 successful generate', async () => {
    const variant = makeVariant();
    const onGenerate = vi.fn().mockResolvedValue({ variants: [variant] });
    const onPick = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(<AiImageModal {...defaultProps({ onGenerate, onPick, onClose })} />);
    const textarea = screen.getByRole('textbox', { name: /describe your image/i });
    fireEvent.change(textarea, { target: { value: 'a corgi' } });

    fireEvent.click(screen.getByRole('button', { name: /generate$/i }));

    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(onPick).toHaveBeenCalledWith(variant, expect.objectContaining({ prompt: 'a corgi' }));
    expect(recordAiPrompt).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── Successful n>1 generate → picker view ────────────────────────────────

  it('shows picker view with multiple variants', async () => {
    const variants = [makeVariant('https://cdn.test/a.png'), makeVariant('https://cdn.test/b.png')];
    const onGenerate = vi.fn().mockResolvedValue({ variants });
    render(<AiImageModal {...defaultProps({ onGenerate })} />);

    const textarea = screen.getByRole('textbox', { name: /describe your image/i });
    fireEvent.change(textarea, { target: { value: 'a vintage bike' } });
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    fireEvent.click(screen.getByRole('button', { name: /generate$/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /pick variant 1/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /pick variant 2/i })).toBeInTheDocument();
  });

  it('picking a variant calls onPick and closes', async () => {
    const variants = [makeVariant('https://cdn.test/a.png'), makeVariant('https://cdn.test/b.png')];
    const onGenerate = vi.fn().mockResolvedValue({ variants });
    const onPick = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(<AiImageModal {...defaultProps({ onGenerate, onPick, onClose })} />);
    const textarea = screen.getByRole('textbox', { name: /describe your image/i });
    fireEvent.change(textarea, { target: { value: 'a vintage bike' } });
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    fireEvent.click(screen.getByRole('button', { name: /generate$/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /pick variant 1/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /pick variant 1/i }));
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── Back button from picker ───────────────────────────────────────────────

  it('Back button in picker returns to form view', async () => {
    const variants = [makeVariant('https://cdn.test/a.png'), makeVariant('https://cdn.test/b.png')];
    const onGenerate = vi.fn().mockResolvedValue({ variants });
    render(<AiImageModal {...defaultProps({ onGenerate })} />);

    const textarea = screen.getByRole('textbox', { name: /describe your image/i });
    fireEvent.change(textarea, { target: { value: 'a corgi' } });
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    fireEvent.click(screen.getByRole('button', { name: /generate$/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /pick variant 1/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /^back$/i }));
    expect(screen.getByRole('textbox', { name: /describe your image/i })).toBeInTheDocument();
  });

  // ── Generate error ────────────────────────────────────────────────────────

  it('shows error message when onGenerate rejects', async () => {
    const onGenerate = vi.fn().mockRejectedValue(new Error('quota exceeded'));
    render(<AiImageModal {...defaultProps({ onGenerate })} />);

    const textarea = screen.getByRole('textbox', { name: /describe your image/i });
    fireEvent.change(textarea, { target: { value: 'a corgi' } });
    fireEvent.click(screen.getByRole('button', { name: /generate$/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('quota exceeded'),
    );
  });

  it('shows fallback error message when non-Error is thrown', async () => {
    const onGenerate = vi.fn().mockRejectedValue('bad');
    render(<AiImageModal {...defaultProps({ onGenerate })} />);

    const textarea = screen.getByRole('textbox', { name: /describe your image/i });
    fireEvent.change(textarea, { target: { value: 'a corgi' } });
    fireEvent.click(screen.getByRole('button', { name: /generate$/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to generate image'),
    );
  });

  it('shows error when model returns empty variants array', async () => {
    const onGenerate = vi.fn().mockResolvedValue({ variants: [] });
    render(<AiImageModal {...defaultProps({ onGenerate })} />);

    const textarea = screen.getByRole('textbox', { name: /describe your image/i });
    fireEvent.change(textarea, { target: { value: 'a corgi' } });
    fireEvent.click(screen.getByRole('button', { name: /generate$/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('no images'),
    );
  });

  // ── Generating state ──────────────────────────────────────────────────────

  it('shows generating state while onGenerate is pending', async () => {
    let resolve!: (v: { variants: UploadedImageResult[] }) => void;
    const onGenerate = vi.fn(
      () =>
        new Promise<{ variants: UploadedImageResult[] }>((r) => {
          resolve = r;
        }),
    );
    render(<AiImageModal {...defaultProps({ onGenerate })} />);

    const textarea = screen.getByRole('textbox', { name: /describe your image/i });
    fireEvent.change(textarea, { target: { value: 'a corgi' } });
    fireEvent.click(screen.getByRole('button', { name: /generate$/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /generating/i })).toBeInTheDocument(),
    );

    // cleanup — resolve so the component can settle
    await act(async () => {
      resolve({ variants: [makeVariant()] });
    });
  });

  // ── Prefill ───────────────────────────────────────────────────────────────

  it('pre-fills prompt + style + transparent from prefill prop', async () => {
    render(
      <AiImageModal
        {...defaultProps({
          prefill: { prompt: 'a pine tree', style: 'photo', transparent: false },
        })}
      />,
    );

    // The prefill effect is synchronous state-set; the only timer is for focus/caret
    // positioning which we don't need to advance — just wait for the next render.
    const textarea = await screen.findByRole('textbox', { name: /describe your image/i });
    expect(textarea).toHaveValue('a pine tree');
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
  });

  // ── History ───────────────────────────────────────────────────────────────

  it('renders recent prompts from history', () => {
    vi.mocked(listAiPromptHistory).mockReturnValue([
      { prompt: 'a pine tree', style: 'illustration', transparent: true, at: '2026-01-01T00:00:00Z' },
    ]);

    render(<AiImageModal {...defaultProps()} />);
    expect(screen.getByText('a pine tree')).toBeInTheDocument();
  });

  it('clicking a history entry fills prompt + style + transparent', () => {
    vi.mocked(listAiPromptHistory).mockReturnValue([
      { prompt: 'a pine tree', style: 'photo', transparent: false, at: '2026-01-01T00:00:00Z' },
    ]);

    render(<AiImageModal {...defaultProps()} />);
    fireEvent.click(screen.getByText('a pine tree'));

    const textarea = screen.getByRole('textbox', { name: /describe your image/i });
    expect(textarea).toHaveValue('a pine tree');
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
  });

  // ── Kbd shortcut Cmd+Enter ────────────────────────────────────────────────

  it('Cmd+Enter triggers generate when prompt is non-empty', async () => {
    const onGenerate = vi.fn().mockResolvedValue({ variants: [makeVariant()] });
    const onPick = vi.fn().mockResolvedValue(undefined);

    render(<AiImageModal {...defaultProps({ onGenerate, onPick })} />);
    const textarea = screen.getByRole('textbox', { name: /describe your image/i });
    fireEvent.change(textarea, { target: { value: 'a corgi' } });
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });

    await waitFor(() => expect(onGenerate).toHaveBeenCalledTimes(1));
  });

  it('Ctrl+Enter triggers generate when prompt is non-empty', async () => {
    const onGenerate = vi.fn().mockResolvedValue({ variants: [makeVariant()] });
    const onPick = vi.fn().mockResolvedValue(undefined);

    render(<AiImageModal {...defaultProps({ onGenerate, onPick })} />);
    const textarea = screen.getByRole('textbox', { name: /describe your image/i });
    fireEvent.change(textarea, { target: { value: 'a corgi' } });
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

    await waitFor(() => expect(onGenerate).toHaveBeenCalledTimes(1));
  });

  // ── onPick error ──────────────────────────────────────────────────────────

  it('shows error when onPick rejects during multi-variant pick', async () => {
    const variants = [makeVariant('https://cdn.test/a.png'), makeVariant('https://cdn.test/b.png')];
    const onGenerate = vi.fn().mockResolvedValue({ variants });
    const onPick = vi.fn().mockRejectedValue(new Error('network timeout'));

    render(<AiImageModal {...defaultProps({ onGenerate, onPick })} />);
    const textarea = screen.getByRole('textbox', { name: /describe your image/i });
    fireEvent.change(textarea, { target: { value: 'a corgi' } });
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    fireEvent.click(screen.getByRole('button', { name: /generate$/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /pick variant 1/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /pick variant 1/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('network timeout'),
    );
  });
});
