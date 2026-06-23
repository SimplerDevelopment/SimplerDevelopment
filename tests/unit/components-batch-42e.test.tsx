// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks for heavy deps
// ---------------------------------------------------------------------------

// next/navigation -> stub router
const routerRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefresh, push: vi.fn(), replace: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------
import { BookingMenuBlockPreview } from '@/components/blocks/visual/BookingMenuBlockPreview';
import { SurveyBlockPreview } from '@/components/blocks/visual/SurveyBlockPreview';
import { BookingBlockPreview } from '@/components/blocks/visual/BookingBlockPreview';
import TicketReplyForm from '@/components/portal/TicketReplyForm';

// ---------------------------------------------------------------------------
// BookingMenuBlockPreview
// ---------------------------------------------------------------------------
describe('BookingMenuBlockPreview', () => {
  const baseBlock: any = {
    id: 'b1',
    type: 'booking-menu',
    columns: 3,
  };

  it('renders the placeholder grid count = columns * 2 (default 3 cols)', () => {
    const onChange = vi.fn();
    const { container } = render(
      <BookingMenuBlockPreview block={baseBlock} isSelected={false} onChange={onChange} />,
    );
    // Six dashed placeholder cards (3 columns * 2 rows)
    const placeholders = container.querySelectorAll('div.border-dashed');
    expect(placeholders.length).toBe(6);
  });

  it('renders a 4-column placeholder grid when columns=4', () => {
    const onChange = vi.fn();
    const block = { ...baseBlock, columns: 4 };
    const { container } = render(
      <BookingMenuBlockPreview block={block} isSelected={false} onChange={onChange} />,
    );
    const placeholders = container.querySelectorAll('div.border-dashed');
    expect(placeholders.length).toBe(8);
    // Grid wrapper picks up the 4-col class
    expect(container.querySelector('.lg\\:grid-cols-4')).toBeTruthy();
  });

  it('does not render the title inputs when not selected and no title set', () => {
    const onChange = vi.fn();
    const { container } = render(
      <BookingMenuBlockPreview block={baseBlock} isSelected={false} onChange={onChange} />,
    );
    expect(container.querySelector('input[placeholder^="Section title"]')).toBeNull();
  });

  it('renders title + description inputs when selected', () => {
    const onChange = vi.fn();
    const { container } = render(
      <BookingMenuBlockPreview block={baseBlock} isSelected={true} onChange={onChange} />,
    );
    expect(container.querySelector('input[placeholder^="Section title"]')).toBeTruthy();
    expect(container.querySelector('input[placeholder^="Description"]')).toBeTruthy();
  });

  it('renders title input when block.title is set even if not selected', () => {
    const onChange = vi.fn();
    const block = { ...baseBlock, title: 'Hello' };
    const { container } = render(
      <BookingMenuBlockPreview block={block} isSelected={false} onChange={onChange} />,
    );
    const input = container.querySelector('input[placeholder^="Section title"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe('Hello');
  });

  it('fires onChange with new title when the title input changes', () => {
    const onChange = vi.fn();
    const { container } = render(
      <BookingMenuBlockPreview block={baseBlock} isSelected={true} onChange={onChange} />,
    );
    const titleInput = container.querySelector(
      'input[placeholder^="Section title"]',
    ) as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'New Title' } });
    expect(onChange).toHaveBeenCalledWith({ title: 'New Title' });
  });

  it('stops click propagation on the title input (no parent handler fired)', () => {
    const onChange = vi.fn();
    const parentClick = vi.fn();
    const { container } = render(
      <div onClick={parentClick}>
        <BookingMenuBlockPreview block={baseBlock} isSelected={true} onChange={onChange} />
      </div>,
    );
    const titleInput = container.querySelector(
      'input[placeholder^="Section title"]',
    ) as HTMLInputElement;
    fireEvent.click(titleInput);
    expect(parentClick).not.toHaveBeenCalled();
  });

  it('shows the production-data hint footer', () => {
    const onChange = vi.fn();
    const { container } = render(
      <BookingMenuBlockPreview block={baseBlock} isSelected={false} onChange={onChange} />,
    );
    expect(container.textContent).toContain('Live booking pages load in production');
  });
});

// ---------------------------------------------------------------------------
// SurveyBlockPreview
// ---------------------------------------------------------------------------
describe('SurveyBlockPreview', () => {
  const baseBlock: any = {
    id: 's1',
    type: 'survey',
  };

  it('hides title input when not selected and no title set', () => {
    const onChange = vi.fn();
    const { container } = render(
      <SurveyBlockPreview block={baseBlock} isSelected={false} onChange={onChange} />,
    );
    expect(container.querySelector('input[placeholder^="Take Our Survey"]')).toBeNull();
  });

  it('renders title + description inputs when selected', () => {
    const onChange = vi.fn();
    const { container } = render(
      <SurveyBlockPreview block={baseBlock} isSelected={true} onChange={onChange} />,
    );
    expect(container.querySelector('input[placeholder^="Take Our Survey"]')).toBeTruthy();
    expect(container.querySelector("input[placeholder^=\"We'd love to hear\"]")).toBeTruthy();
  });

  it('renders the slug placeholder when block has no slug', () => {
    const onChange = vi.fn();
    const { container } = render(
      <SurveyBlockPreview block={baseBlock} isSelected={false} onChange={onChange} />,
    );
    expect(container.textContent).toContain('survey-form');
    expect(container.textContent).toContain('your-slug');
  });

  it('renders the live URL with the configured slug', () => {
    const onChange = vi.fn();
    const block = { ...baseBlock, slug: 'feedback-2026' };
    const { container } = render(
      <SurveyBlockPreview block={block} isSelected={false} onChange={onChange} />,
    );
    expect(container.textContent).toContain('feedback-2026');
    // The amber slug-warning should NOT appear when slug is set
    expect(container.textContent).not.toContain('Set the survey slug in the settings panel');
  });

  it('shows the amber slug warning only when selected without slug', () => {
    const onChange = vi.fn();
    const { container } = render(
      <SurveyBlockPreview block={baseBlock} isSelected={true} onChange={onChange} />,
    );
    expect(container.textContent).toContain('Set the survey slug in the settings panel');
  });

  it('renders 5 placeholder stars in the rating row', () => {
    const onChange = vi.fn();
    const { container } = render(
      <SurveyBlockPreview block={baseBlock} isSelected={false} onChange={onChange} />,
    );
    const stars = Array.from(container.querySelectorAll('span.material-icons')).filter(
      (n) => n.textContent === 'star',
    );
    expect(stars.length).toBe(5);
  });

  it('fires onChange for title and description edits', () => {
    const onChange = vi.fn();
    const { container } = render(
      <SurveyBlockPreview block={baseBlock} isSelected={true} onChange={onChange} />,
    );
    const titleInput = container.querySelector(
      'input[placeholder^="Take Our Survey"]',
    ) as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'My Survey' } });
    expect(onChange).toHaveBeenCalledWith({ title: 'My Survey' });

    const descInput = container.querySelector(
      "input[placeholder^=\"We'd love to hear\"]",
    ) as HTMLInputElement;
    fireEvent.change(descInput, { target: { value: 'Tell us!' } });
    expect(onChange).toHaveBeenCalledWith({ description: 'Tell us!' });
  });
});

// ---------------------------------------------------------------------------
// BookingBlockPreview
// ---------------------------------------------------------------------------
describe('BookingBlockPreview', () => {
  const baseBlock: any = {
    id: 'bk1',
    type: 'booking',
  };

  it('renders the unconfigured pill when not selected and no slug', () => {
    const onChange = vi.fn();
    const { container } = render(
      <BookingBlockPreview block={baseBlock} isSelected={false} onChange={onChange} />,
    );
    expect(container.textContent).toContain('not configured');
  });

  it('renders the configured slug in the pill when slug is set', () => {
    const onChange = vi.fn();
    const block = { ...baseBlock, slug: 'discovery-call' };
    const { container } = render(
      <BookingBlockPreview block={block} isSelected={false} onChange={onChange} />,
    );
    expect(container.textContent).toContain('discovery-call');
  });

  it('hides the pill overlay when selected', () => {
    const onChange = vi.fn();
    const { container } = render(
      <BookingBlockPreview block={baseBlock} isSelected={true} onChange={onChange} />,
    );
    expect(container.textContent).not.toContain('not configured');
  });

  it('renders default title/description text when selected and none provided', () => {
    const onChange = vi.fn();
    const { container } = render(
      <BookingBlockPreview block={baseBlock} isSelected={true} onChange={onChange} />,
    );
    expect(container.textContent).toContain('Schedule a Meeting');
    expect(container.textContent).toContain('Pick a time that works for you');
  });

  it('renders block.title/description verbatim when provided', () => {
    const onChange = vi.fn();
    const block = {
      ...baseBlock,
      title: 'Book a Demo',
      description: 'Chat with us for 30 minutes',
    };
    const { container } = render(
      <BookingBlockPreview block={block} isSelected={false} onChange={onChange} />,
    );
    expect(container.textContent).toContain('Book a Demo');
    expect(container.textContent).toContain('Chat with us for 30 minutes');
  });

  it('shows the slug-warning notice when slug is missing', () => {
    const onChange = vi.fn();
    const { container } = render(
      <BookingBlockPreview block={baseBlock} isSelected={false} onChange={onChange} />,
    );
    expect(container.textContent).toContain(
      'Set the booking page slug in the settings panel',
    );
  });

  it('hides the slug-warning notice when slug is set', () => {
    const onChange = vi.fn();
    const block = { ...baseBlock, slug: 'consult' };
    const { container } = render(
      <BookingBlockPreview block={block} isSelected={false} onChange={onChange} />,
    );
    expect(container.textContent).not.toContain(
      'Set the booking page slug in the settings panel',
    );
  });

  it('renders all 8 placeholder time slots', () => {
    const onChange = vi.fn();
    const { container } = render(
      <BookingBlockPreview block={baseBlock} isSelected={false} onChange={onChange} />,
    );
    const text = container.textContent || '';
    ['9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '2:00 PM', '2:30 PM', '3:00 PM'].forEach(
      (t) => {
        expect(text).toContain(t);
      },
    );
  });

  it('shows the production-only hint at the bottom', () => {
    const onChange = vi.fn();
    const { container } = render(
      <BookingBlockPreview block={baseBlock} isSelected={false} onChange={onChange} />,
    );
    expect(container.textContent).toContain('Preview only');
  });
});

// ---------------------------------------------------------------------------
// TicketReplyForm
// ---------------------------------------------------------------------------
describe('TicketReplyForm', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    routerRefresh.mockClear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('renders the staff heading when isStaff=true', () => {
    render(<TicketReplyForm ticketId={42} isStaff={true} />);
    expect(screen.getByText(/Reply to Client/i)).toBeTruthy();
  });

  it('renders the plain Reply heading when isStaff=false and hides internal note checkbox', () => {
    const { container } = render(<TicketReplyForm ticketId={42} isStaff={false} />);
    expect(screen.getByText(/^Reply$/)).toBeTruthy();
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
  });

  it('disables the submit button when the textarea is empty', () => {
    const { container } = render(<TicketReplyForm ticketId={42} isStaff={true} />);
    const btn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('enables the submit button once text is entered', () => {
    const { container } = render(<TicketReplyForm ticketId={42} isStaff={true} />);
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'Hello there' } });
    const btn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('does not submit if body is only whitespace', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as any;
    const { container } = render(<TicketReplyForm ticketId={5} isStaff={true} />);
    const form = container.querySelector('form') as HTMLFormElement;
    // submit a form with empty textarea — handleSubmit early-returns before fetch
    fireEvent.submit(form);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts to the messages endpoint with body+isInternal and resets on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    });
    globalThis.fetch = fetchMock as any;

    const { container } = render(<TicketReplyForm ticketId={7} isStaff={true} />);
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'My reply' } });

    const cb = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(cb);
    expect(cb.checked).toBe(true);

    const form = container.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/portal/tickets/7/messages');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ body: 'My reply', isInternal: true });

    await waitFor(() => {
      expect(ta.value).toBe('');
      expect(cb.checked).toBe(false);
      expect(routerRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it('shows an error message from the API and does not refresh the router', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: false, message: 'nope' }),
    });
    globalThis.fetch = fetchMock as any;

    const { container } = render(<TicketReplyForm ticketId={9} isStaff={false} />);
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'Hi' } });
    const form = container.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(container.textContent).toContain('nope');
    });
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it('falls back to the default error copy when the API omits a message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: false }),
    });
    globalThis.fetch = fetchMock as any;

    const { container } = render(<TicketReplyForm ticketId={11} isStaff={true} />);
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'Hi' } });
    const form = container.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(container.textContent).toContain('Failed to send reply');
    });
  });
});
