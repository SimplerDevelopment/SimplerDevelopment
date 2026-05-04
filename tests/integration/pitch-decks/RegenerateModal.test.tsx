/** Integration tests for the extracted RegenerateModal component. */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RegenerateModal } from '@/app/portal/tools/pitch-decks/[id]/_components/RegenerateModal';

describe('RegenerateModal', () => {
  it('renders heading and prompt textarea', () => {
    render(
      <RegenerateModal
        prompt=""
        regenerating={false}
        error=""
        onPromptChange={() => {}}
        onClose={() => {}}
        onSubmit={(e) => e.preventDefault()}
      />
    );
    expect(screen.getByRole('heading', { name: /Regenerate All Slides/ })).toBeTruthy();
    expect(screen.getByPlaceholderText(/Describe what the new deck should focus on/)).toBeTruthy();
  });

  it('disables submit when prompt is empty', () => {
    render(
      <RegenerateModal
        prompt=""
        regenerating={false}
        error=""
        onPromptChange={() => {}}
        onClose={() => {}}
        onSubmit={() => {}}
      />
    );
    const submit = screen.getByRole('button', { name: /Regenerate Deck/ }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('shows loading spinner when regenerating', () => {
    render(
      <RegenerateModal
        prompt="Make it punchier"
        regenerating={true}
        error=""
        onPromptChange={() => {}}
        onClose={() => {}}
        onSubmit={() => {}}
      />
    );
    expect(screen.getByText(/Generating/)).toBeTruthy();
  });

  it('fires onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <RegenerateModal
        prompt=""
        regenerating={false}
        error=""
        onPromptChange={() => {}}
        onClose={onClose}
        onSubmit={() => {}}
      />
    );
    // The close button is the icon-only button in the header.
    const closeButton = screen.getAllByRole('button')[0];
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalled();
  });

  it('fires onPromptChange when the textarea is typed into', () => {
    const onPromptChange = vi.fn();
    render(
      <RegenerateModal
        prompt=""
        regenerating={false}
        error=""
        onPromptChange={onPromptChange}
        onClose={() => {}}
        onSubmit={() => {}}
      />
    );
    fireEvent.change(screen.getByPlaceholderText(/Describe what the new deck/), { target: { value: 'New prompt' } });
    expect(onPromptChange).toHaveBeenCalledWith('New prompt');
  });
});
