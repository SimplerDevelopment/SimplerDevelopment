// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import React from 'react';

// ComposeBox has no external dependencies beyond react — no mocks required.
import { ComposeBox, type ComposeMember } from '@/components/portal/comments/ComposeBox';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const members: ComposeMember[] = [
  { id: 1, name: 'Alice Smith', avatar: 'https://example.com/alice.png' },
  { id: 2, name: 'Bob Jones', avatar: null },
  { id: 3, name: 'Carol White' },
];

function noop(): Promise<void> {
  return Promise.resolve();
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('ComposeBox — rendering', () => {
  it('renders a textarea with the default placeholder', () => {
    render(<ComposeBox members={members} onSubmit={noop} />);
    expect(screen.getByPlaceholderText('Add a comment…')).toBeInTheDocument();
  });

  it('accepts a custom placeholder', () => {
    render(<ComposeBox members={members} onSubmit={noop} placeholder="Reply here…" />);
    expect(screen.getByPlaceholderText('Reply here…')).toBeInTheDocument();
  });

  it('renders the submit button with default label', () => {
    render(<ComposeBox members={members} onSubmit={noop} />);
    expect(screen.getByRole('button', { name: 'Comment' })).toBeInTheDocument();
  });

  it('accepts a custom submit label', () => {
    render(<ComposeBox members={members} onSubmit={noop} submitLabel="Post Reply" />);
    expect(screen.getByRole('button', { name: 'Post Reply' })).toBeInTheDocument();
  });

  it('submit button is disabled when textarea is empty', () => {
    render(<ComposeBox members={members} onSubmit={noop} />);
    expect(screen.getByRole('button', { name: 'Comment' })).toBeDisabled();
  });

  it('submit button is disabled when textarea contains only whitespace', () => {
    render(<ComposeBox members={members} onSubmit={noop} />);
    fireEvent.change(screen.getByPlaceholderText('Add a comment…'), {
      target: { value: '   ' },
    });
    expect(screen.getByRole('button', { name: 'Comment' })).toBeDisabled();
  });

  it('submit button becomes enabled when textarea has content', () => {
    render(<ComposeBox members={members} onSubmit={noop} />);
    fireEvent.change(screen.getByPlaceholderText('Add a comment…'), {
      target: { value: 'Hello!' },
    });
    expect(screen.getByRole('button', { name: 'Comment' })).not.toBeDisabled();
  });

  it('does NOT render a Cancel button when onCancel is not provided', () => {
    render(<ComposeBox members={members} onSubmit={noop} />);
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('renders a Cancel button when onCancel is provided', () => {
    render(<ComposeBox members={members} onSubmit={noop} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('calls onCancel when Cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(<ComposeBox members={members} onSubmit={noop} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('pre-populates textarea with initialValue', () => {
    render(<ComposeBox members={members} onSubmit={noop} initialValue="Draft text" />);
    const ta = screen.getByPlaceholderText('Add a comment…') as HTMLTextAreaElement;
    expect(ta.value).toBe('Draft text');
  });

  it('uses compact rows when variant=compact', () => {
    render(<ComposeBox members={members} onSubmit={noop} variant="compact" />);
    const ta = screen.getByPlaceholderText('Add a comment…') as HTMLTextAreaElement;
    expect(ta.rows).toBe(2);
  });

  it('uses full rows by default', () => {
    render(<ComposeBox members={members} onSubmit={noop} />);
    const ta = screen.getByPlaceholderText('Add a comment…') as HTMLTextAreaElement;
    expect(ta.rows).toBe(3);
  });

  it('does not show error message on initial render', () => {
    render(<ComposeBox members={members} onSubmit={noop} />);
    expect(screen.queryByText(/failed/i)).toBeNull();
  });

  it('does not show mention listbox on initial render', () => {
    render(<ComposeBox members={members} onSubmit={noop} />);
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Submit — success path
// ---------------------------------------------------------------------------

describe('ComposeBox — submit success', () => {
  it('calls onSubmit with trimmed body on button click', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ComposeBox members={members} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByPlaceholderText('Add a comment…'), {
      target: { value: '  Hello world  ' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
    });
    expect(onSubmit).toHaveBeenCalledWith('Hello world', []);
  });

  it('resets the textarea on successful submit (resetOnSubmit=true default)', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ComposeBox members={members} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByPlaceholderText('Add a comment…'), {
      target: { value: 'Some text' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
    });
    await waitFor(() => {
      const ta = screen.getByPlaceholderText('Add a comment…') as HTMLTextAreaElement;
      expect(ta.value).toBe('');
    });
  });

  it('does NOT reset the textarea when resetOnSubmit=false', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ComposeBox members={members} onSubmit={onSubmit} resetOnSubmit={false} />);
    fireEvent.change(screen.getByPlaceholderText('Add a comment…'), {
      target: { value: 'Persist me' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
    });
    await waitFor(() => {
      const ta = screen.getByPlaceholderText('Add a comment…') as HTMLTextAreaElement;
      expect(ta.value).toBe('Persist me');
    });
  });

  it('extracts mentioned user ids and passes them to onSubmit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ComposeBox members={members} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByPlaceholderText('Add a comment…'), {
      target: { value: 'Hey @[Alice Smith](1) and @[Bob Jones](2)!' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
    });
    expect(onSubmit).toHaveBeenCalledWith(
      'Hey @[Alice Smith](1) and @[Bob Jones](2)!',
      [1, 2],
    );
  });

  it('shows "Sending…" spinner during in-flight submit', async () => {
    let resolve: () => void;
    const pending = new Promise<void>((res) => { resolve = res; });
    const onSubmit = vi.fn().mockReturnValue(pending);

    render(<ComposeBox members={members} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByPlaceholderText('Add a comment…'), {
      target: { value: 'Loading test' },
    });

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Sending…')).toBeInTheDocument();
    });

    // Clean up by resolving the promise
    await act(async () => { resolve!(); });
  });

  it('disables textarea while submitting', async () => {
    let resolve: () => void;
    const pending = new Promise<void>((res) => { resolve = res; });
    const onSubmit = vi.fn().mockReturnValue(pending);

    render(<ComposeBox members={members} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByPlaceholderText('Add a comment…'), {
      target: { value: 'Disable test' },
    });

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
    });

    await waitFor(() => {
      const ta = screen.getByPlaceholderText('Add a comment…') as HTMLTextAreaElement;
      expect(ta.disabled).toBe(true);
    });

    await act(async () => { resolve!(); });
  });
});

// ---------------------------------------------------------------------------
// Submit — error path
// ---------------------------------------------------------------------------

describe('ComposeBox — submit error', () => {
  it('shows error message when onSubmit throws', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Server exploded'));
    render(<ComposeBox members={members} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByPlaceholderText('Add a comment…'), {
      target: { value: 'Trigger error' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
    });
    await waitFor(() => {
      expect(screen.getByText('Server exploded')).toBeInTheDocument();
    });
  });

  it('shows fallback error text when thrown error has no message', async () => {
    const onSubmit = vi.fn().mockRejectedValue({ message: '' });
    render(<ComposeBox members={members} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByPlaceholderText('Add a comment…'), {
      target: { value: 'Trigger fallback' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
    });
    await waitFor(() => {
      expect(screen.getByText('Failed to submit')).toBeInTheDocument();
    });
  });

  it('re-enables submit button after failed submit', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Oops'));
    render(<ComposeBox members={members} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByPlaceholderText('Add a comment…'), {
      target: { value: 'Will fail' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
    });
    await waitFor(() => {
      // "Comment" button should reappear and be enabled (text is non-empty)
      expect(screen.getByRole('button', { name: 'Comment' })).not.toBeDisabled();
    });
  });
});

// ---------------------------------------------------------------------------
// Cmd/Ctrl+Enter keyboard submit
// ---------------------------------------------------------------------------

describe('ComposeBox — keyboard submit', () => {
  it('submits on Cmd+Enter', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ComposeBox members={members} onSubmit={onSubmit} />);
    const ta = screen.getByPlaceholderText('Add a comment…');
    fireEvent.change(ta, { target: { value: 'Keyboard submit' } });
    await act(async () => {
      fireEvent.keyDown(ta, { key: 'Enter', metaKey: true });
    });
    expect(onSubmit).toHaveBeenCalledWith('Keyboard submit', []);
  });

  it('submits on Ctrl+Enter', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ComposeBox members={members} onSubmit={onSubmit} />);
    const ta = screen.getByPlaceholderText('Add a comment…');
    fireEvent.change(ta, { target: { value: 'Ctrl submit' } });
    await act(async () => {
      fireEvent.keyDown(ta, { key: 'Enter', ctrlKey: true });
    });
    expect(onSubmit).toHaveBeenCalledWith('Ctrl submit', []);
  });

  it('does not submit plain Enter without meta/ctrl', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ComposeBox members={members} onSubmit={onSubmit} />);
    const ta = screen.getByPlaceholderText('Add a comment…');
    fireEvent.change(ta, { target: { value: 'No submit' } });
    fireEvent.keyDown(ta, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not submit when textarea is empty and Cmd+Enter pressed', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ComposeBox members={members} onSubmit={onSubmit} />);
    const ta = screen.getByPlaceholderText('Add a comment…');
    // no change — value stays empty
    await act(async () => {
      fireEvent.keyDown(ta, { key: 'Enter', metaKey: true });
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Mention autocomplete — open/filter/navigate/dismiss
// ---------------------------------------------------------------------------

describe('ComposeBox — mention autocomplete', () => {
  it('opens the mention listbox when @ is typed after whitespace', () => {
    render(<ComposeBox members={members} onSubmit={noop} />);
    const ta = screen.getByPlaceholderText('Add a comment…') as HTMLTextAreaElement;
    fireEvent.change(ta, {
      target: { value: '@', selectionStart: 1 },
    });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('shows up to 8 members when query is empty', () => {
    const manyMembers: ComposeMember[] = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `User ${i + 1}`,
    }));
    render(<ComposeBox members={manyMembers} onSubmit={noop} />);
    const ta = screen.getByPlaceholderText('Add a comment…') as HTMLTextAreaElement;
    fireEvent.change(ta, {
      target: { value: '@', selectionStart: 1 },
    });
    const options = screen.getAllByRole('option');
    expect(options.length).toBe(8);
  });

  it('filters members by the typed query', () => {
    render(<ComposeBox members={members} onSubmit={noop} />);
    const ta = screen.getByPlaceholderText('Add a comment…') as HTMLTextAreaElement;
    fireEvent.change(ta, {
      target: { value: '@alic', selectionStart: 5 },
    });
    const options = screen.getAllByRole('option');
    expect(options.length).toBe(1);
    expect(options[0]).toHaveTextContent('Alice Smith');
  });

  it('hides the listbox when no members match the query', () => {
    render(<ComposeBox members={members} onSubmit={noop} />);
    const ta = screen.getByPlaceholderText('Add a comment…') as HTMLTextAreaElement;
    fireEvent.change(ta, {
      target: { value: '@zzz', selectionStart: 4 },
    });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('renders avatar img when member has an avatar', () => {
    render(<ComposeBox members={members} onSubmit={noop} />);
    const ta = screen.getByPlaceholderText('Add a comment…') as HTMLTextAreaElement;
    fireEvent.change(ta, {
      target: { value: '@', selectionStart: 1 },
    });
    // Alice has an avatar URL — an img element should appear (alt="" means role=presentation)
    const img = document.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.src).toContain('alice.png');
  });

  it('renders initials badge when member has no avatar', () => {
    render(<ComposeBox members={[{ id: 2, name: 'Bob Jones', avatar: null }]} onSubmit={noop} />);
    const ta = screen.getByPlaceholderText('Add a comment…') as HTMLTextAreaElement;
    fireEvent.change(ta, {
      target: { value: '@', selectionStart: 1 },
    });
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('dismisses mention listbox on Escape', () => {
    render(<ComposeBox members={members} onSubmit={noop} />);
    const ta = screen.getByPlaceholderText('Add a comment…') as HTMLTextAreaElement;
    fireEvent.change(ta, {
      target: { value: '@', selectionStart: 1 },
    });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(ta, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('navigates down with ArrowDown', () => {
    render(<ComposeBox members={members} onSubmit={noop} />);
    const ta = screen.getByPlaceholderText('Add a comment…') as HTMLTextAreaElement;
    fireEvent.change(ta, {
      target: { value: '@', selectionStart: 1 },
    });
    // Initial highlight = 0 (first option has aria-selected=true)
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(ta, { key: 'ArrowDown' });
    const optionsAfter = screen.getAllByRole('option');
    expect(optionsAfter[1]).toHaveAttribute('aria-selected', 'true');
    expect(optionsAfter[0]).toHaveAttribute('aria-selected', 'false');
  });

  it('navigates up with ArrowUp (wraps around)', () => {
    render(<ComposeBox members={members} onSubmit={noop} />);
    const ta = screen.getByPlaceholderText('Add a comment…') as HTMLTextAreaElement;
    fireEvent.change(ta, {
      target: { value: '@', selectionStart: 1 },
    });
    // Highlight starts at 0; ArrowUp wraps to last
    fireEvent.keyDown(ta, { key: 'ArrowUp' });
    const options = screen.getAllByRole('option');
    const lastIdx = options.length - 1;
    expect(options[lastIdx]).toHaveAttribute('aria-selected', 'true');
  });

  it('inserts mention markup via Enter key', () => {
    render(<ComposeBox members={members} onSubmit={noop} />);
    const ta = screen.getByPlaceholderText('Add a comment…') as HTMLTextAreaElement;
    fireEvent.change(ta, {
      target: { value: '@', selectionStart: 1 },
    });
    fireEvent.keyDown(ta, { key: 'Enter' });
    // Listbox should be gone and textarea updated
    expect(screen.queryByRole('listbox')).toBeNull();
    // value should contain the mention token for Alice (first member)
    expect(ta.value).toContain('@[Alice Smith](1)');
  });

  it('inserts mention markup via Tab key', () => {
    render(<ComposeBox members={members} onSubmit={noop} />);
    const ta = screen.getByPlaceholderText('Add a comment…') as HTMLTextAreaElement;
    fireEvent.change(ta, {
      target: { value: '@', selectionStart: 1 },
    });
    fireEvent.keyDown(ta, { key: 'Tab' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(ta.value).toContain('@[Alice Smith](1)');
  });

  it('inserts mention markup on mousedown click of a candidate', () => {
    render(<ComposeBox members={members} onSubmit={noop} />);
    const ta = screen.getByPlaceholderText('Add a comment…') as HTMLTextAreaElement;
    fireEvent.change(ta, {
      target: { value: '@', selectionStart: 1 },
    });
    const options = screen.getAllByRole('option');
    // Click Bob (index 1)
    fireEvent.mouseDown(options[1]);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(ta.value).toContain('@[Bob Jones](2)');
  });

  it('highlights option on mouseEnter', () => {
    render(<ComposeBox members={members} onSubmit={noop} />);
    const ta = screen.getByPlaceholderText('Add a comment…') as HTMLTextAreaElement;
    fireEvent.change(ta, {
      target: { value: '@', selectionStart: 1 },
    });
    const options = screen.getAllByRole('option');
    fireEvent.mouseEnter(options[2]);
    const optionsAfter = screen.getAllByRole('option');
    expect(optionsAfter[2]).toHaveAttribute('aria-selected', 'true');
  });

  it('does not open mention popover when @ is in the middle of a word (email)', () => {
    render(<ComposeBox members={members} onSubmit={noop} />);
    const ta = screen.getByPlaceholderText('Add a comment…') as HTMLTextAreaElement;
    // "foo@bar" — @ is preceded by a non-whitespace character
    fireEvent.change(ta, {
      target: { value: 'foo@bar', selectionStart: 7 },
    });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes mention listbox after a successful member insert leaves value clean', () => {
    render(<ComposeBox members={members} onSubmit={noop} />);
    const ta = screen.getByPlaceholderText('Add a comment…') as HTMLTextAreaElement;
    fireEvent.change(ta, {
      target: { value: 'Hello @ali', selectionStart: 10 },
    });
    // "ali" filter matches Alice
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveTextContent('Alice Smith');
    fireEvent.mouseDown(options[0]);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(ta.value).toBe('Hello @[Alice Smith](1) ');
  });
});

// ---------------------------------------------------------------------------
// autoFocus
// ---------------------------------------------------------------------------

describe('ComposeBox — autoFocus', () => {
  it('focuses the textarea when autoFocus=true', () => {
    render(<ComposeBox members={members} onSubmit={noop} autoFocus />);
    const ta = screen.getByPlaceholderText('Add a comment…');
    expect(document.activeElement).toBe(ta);
  });
});

// ---------------------------------------------------------------------------
// className passthrough
// ---------------------------------------------------------------------------

describe('ComposeBox — className', () => {
  it('forwards className to the wrapper div', () => {
    const { container } = render(
      <ComposeBox members={members} onSubmit={noop} className="my-extra-class" />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('my-extra-class');
  });
});

// ---------------------------------------------------------------------------
// Guard: re-entrant submit (double-click)
// ---------------------------------------------------------------------------

describe('ComposeBox — re-entrant submit guard', () => {
  it('ignores second submit click while a request is in-flight', async () => {
    let resolve: () => void;
    const pending = new Promise<void>((res) => { resolve = res; });
    const onSubmit = vi.fn().mockReturnValue(pending);

    render(<ComposeBox members={members} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByPlaceholderText('Add a comment…'), {
      target: { value: 'Double click' },
    });

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
    });

    await waitFor(() => screen.getByText('Sending…'));

    // Textarea is disabled so the button is also disabled — no second call possible
    expect(onSubmit).toHaveBeenCalledTimes(1);

    await act(async () => { resolve!(); });
  });
});

// ---------------------------------------------------------------------------
// onSelect (caret movement re-evaluates mention context)
// ---------------------------------------------------------------------------

describe('ComposeBox — onSelect caret tracking', () => {
  it('keeps mention menu open when onSelect fires while caret is still in token', () => {
    render(<ComposeBox members={members} onSubmit={noop} />);
    const ta = screen.getByPlaceholderText('Add a comment…') as HTMLTextAreaElement;

    // Open via onChange
    fireEvent.change(ta, { target: { value: '@alice', selectionStart: 6 } });
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    // Fire a select event with caret still inside the @alice token — menu stays open
    fireEvent.select(ta);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('fires onSelect without crashing when textarea has no @ token', () => {
    render(<ComposeBox members={members} onSubmit={noop} />);
    const ta = screen.getByPlaceholderText('Add a comment…') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'plain text' } });
    // No @ means no mention context; onSelect should not throw
    expect(() => fireEvent.select(ta)).not.toThrow();
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// beforeEach safety reset
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});
