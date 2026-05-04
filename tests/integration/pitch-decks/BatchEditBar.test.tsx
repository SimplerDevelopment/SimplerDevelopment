/** Integration tests for the extracted BatchEditBar component. */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BatchEditBar } from '@/app/portal/tools/pitch-decks/[id]/_components/BatchEditBar';

describe('BatchEditBar', () => {
  it('renders selected count and Select all link', { timeout: 30_000 }, () => {
    render(
      <BatchEditBar
        selectedCount={2}
        totalSlides={5}
        prompt=""
        generating={false}
        onPromptChange={() => {}}
        onSelectAll={() => {}}
        onClear={() => {}}
        onSubmit={(e) => e.preventDefault()}
      />
    );
    expect(screen.getByText(/2 slides/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Select all/ })).toBeTruthy();
  });

  it('flips Select all → Deselect all when count equals total', () => {
    render(
      <BatchEditBar
        selectedCount={5}
        totalSlides={5}
        prompt=""
        generating={false}
        onPromptChange={() => {}}
        onSelectAll={() => {}}
        onClear={() => {}}
        onSubmit={(e) => e.preventDefault()}
      />
    );
    expect(screen.getByRole('button', { name: /Deselect all/ })).toBeTruthy();
  });

  it('fires onPromptChange when typing', () => {
    const onPromptChange = vi.fn();
    render(
      <BatchEditBar
        selectedCount={2}
        totalSlides={5}
        prompt=""
        generating={false}
        onPromptChange={onPromptChange}
        onSelectAll={() => {}}
        onClear={() => {}}
        onSubmit={() => {}}
      />
    );
    fireEvent.change(screen.getByPlaceholderText(/Apply to selected slides/), { target: { value: 'punchier' } });
    expect(onPromptChange).toHaveBeenCalledWith('punchier');
  });

  it('disables submit when prompt is empty', () => {
    render(
      <BatchEditBar
        selectedCount={2}
        totalSlides={5}
        prompt=""
        generating={false}
        onPromptChange={() => {}}
        onSelectAll={() => {}}
        onClear={() => {}}
        onSubmit={() => {}}
      />
    );
    const submit = screen.getByRole('button', { name: /Edit 2 Slides/ }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('fires onClear when Cancel is clicked', () => {
    const onClear = vi.fn();
    render(
      <BatchEditBar
        selectedCount={2}
        totalSlides={5}
        prompt=""
        generating={false}
        onPromptChange={() => {}}
        onSelectAll={() => {}}
        onClear={onClear}
        onSubmit={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClear).toHaveBeenCalled();
  });
});
