import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NewDealModal from '@/app/portal/crm/deals/_components/NewDealModal';
import type { Pipeline, Contact, Company, DealFormState } from '@/app/portal/crm/deals/_lib/types';

const PIPELINES: Pipeline[] = [
  {
    id: 1,
    name: 'Sales Pipeline',
    stages: [
      { id: 10, name: 'Lead', color: null, probability: 10, order: 0 },
      { id: 11, name: 'Qualified', color: null, probability: 30, order: 1 },
    ],
  },
];

const CONTACTS: Contact[] = [
  { id: 100, firstName: 'Ada', lastName: 'Lovelace', companyId: 200 },
];

const COMPANIES: Company[] = [
  { id: 200, name: 'Acme Corp' },
];

const INITIAL_FORM: DealFormState = {
  title: '',
  value: '',
  contactId: '',
  companyId: '',
  pipelineId: '1',
  stageId: '10',
  priority: 'medium',
  expectedCloseDate: '',
  notes: '',
};

/**
 * Stubs the global `fetch` so the modal's "Create Deal" submit goes through
 * a deterministic happy-path response.
 */
function stubCreateDealOk() {
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === '/api/portal/crm/deals' && init?.method === 'POST') {
      return new Response(
        JSON.stringify({ success: true, data: { id: 999, title: 'X' } }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;
}

describe('NewDealModal', () => {
  beforeEach(() => {
    stubCreateDealOk();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the form with the New Deal heading', () => {
    render(
      <NewDealModal
        pipelines={PIPELINES}
        selectedPipelineId={1}
        contacts={CONTACTS}
        companies={COMPANIES}
        initialForm={INITIAL_FORM}
        onCompanyCreated={vi.fn()}
        onContactCreated={vi.fn()}
        onCreated={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'New Deal' })).toBeInTheDocument();
    expect(screen.getByText('Title *')).toBeInTheDocument();
    expect(screen.getByText('Value ($) *')).toBeInTheDocument();
  });

  it('fills the form and fires onCreated on successful submit', async () => {
    const onCreated = vi.fn();
    const user = userEvent.setup();

    render(
      <NewDealModal
        pipelines={PIPELINES}
        selectedPipelineId={1}
        contacts={CONTACTS}
        companies={COMPANIES}
        initialForm={INITIAL_FORM}
        onCompanyCreated={vi.fn()}
        onContactCreated={vi.fn()}
        onCreated={onCreated}
      />,
    );

    // The form has no htmlFor associations, so we address inputs by role +
    // nth-child. Title is the first textbox; Value is the spinbutton.
    const textboxes = screen.getAllByRole('textbox');
    const titleInput = textboxes[0];
    await user.type(titleInput, 'Big Deal');

    const valueInput = screen.getByRole('spinbutton');
    await user.type(valueInput, '5000');

    await user.click(screen.getByRole('button', { name: /Create Deal/ }));

    // The modal calls onCreated() after a successful POST.
    expect(onCreated).toHaveBeenCalledTimes(1);

    // And it sent the request with the fields it captured.
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const lastCall = fetchMock.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0] === '/api/portal/crm/deals',
    );
    expect(lastCall).toBeTruthy();
    const body = JSON.parse((lastCall![1] as RequestInit).body as string);
    expect(body.title).toBe('Big Deal');
    expect(body.value).toBe(500000); // dollars × 100
    expect(body.pipelineId).toBe(1);
    expect(body.stageId).toBe(10);
    expect(body.priority).toBe('medium');
  });

  it('surfaces an error message when the API returns success: false', async () => {
    global.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({ success: false, message: 'Something went wrong' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(
      <NewDealModal
        pipelines={PIPELINES}
        selectedPipelineId={1}
        contacts={CONTACTS}
        companies={COMPANIES}
        initialForm={INITIAL_FORM}
        onCompanyCreated={vi.fn()}
        onContactCreated={vi.fn()}
        onCreated={onCreated}
      />,
    );

    await user.type(screen.getAllByRole('textbox')[0], 'Big Deal');
    await user.type(screen.getByRole('spinbutton'), '5000');
    await user.click(screen.getByRole('button', { name: /Create Deal/ }));

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });
});
