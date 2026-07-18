// @vitest-environment node
/**
 * Unit tests for `applyTemplate` in lib/brain/template.ts. The template
 * engine renders `{{var}}` placeholders against the brain DB (tasks and
 * meetings) plus a few date helpers. We mock the drizzle chain just
 * deeply enough to return the rows each branch wants.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockState {
  taskRows: Array<{ id: number; title: string; dueDate: Date | null }>;
  meetingRows: Array<{ id: number; title: string; meetingDate: Date | null; createdAt: Date }>;
  lastTaskFilter: unknown;
  lastMeetingFilter: unknown;
}

const state: MockState = {
  taskRows: [],
  meetingRows: [],
  lastTaskFilter: null,
  lastMeetingFilter: null,
};

const TABLES = {
  brainTasks: { __table: 'brainTasks', id: 'brainTasks.id', title: 'brainTasks.title', dueDate: 'brainTasks.dueDate', clientId: 'brainTasks.clientId', status: 'brainTasks.status', createdAt: 'brainTasks.createdAt' },
  brainMeetings: { __table: 'brainMeetings', id: 'brainMeetings.id', title: 'brainMeetings.title', meetingDate: 'brainMeetings.meetingDate', createdAt: 'brainMeetings.createdAt', clientId: 'brainMeetings.clientId' },
};

vi.mock('@/lib/db/schema', () => TABLES);

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  ne: (a: unknown, b: unknown) => ({ op: 'ne', a, b }),
  gte: (a: unknown, b: unknown) => ({ op: 'gte', a, b }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

vi.mock('@/lib/db', () => {
  function buildSelectChain(table: { __table: string }) {
    const chain = {
      from: () => chain,
      where: (arg: unknown) => {
        if (table.__table === 'brainTasks') state.lastTaskFilter = arg;
        else if (table.__table === 'brainMeetings') state.lastMeetingFilter = arg;
        return chain;
      },
      orderBy: () => chain,
      limit: () => {
        if (table.__table === 'brainTasks') return Promise.resolve(state.taskRows);
        if (table.__table === 'brainMeetings') return Promise.resolve(state.meetingRows);
        return Promise.resolve([]);
      },
    };
    return chain;
  }

  return {
    db: {
      select: () => ({
        from: (table: { __table: string }) => buildSelectChain(table),
      }),
    },
  };
});

beforeEach(() => {
  state.taskRows = [];
  state.meetingRows = [];
  state.lastTaskFilter = null;
  state.lastMeetingFilter = null;
});

// A fixed date so the formatted output is deterministic. Pick a
// Wednesday so the ISO-week math has to actually run.
// 2026-04-29 (UTC) — ISO week 18 of 2026.
const TODAY = new Date(Date.UTC(2026, 3, 29));

describe('applyTemplate — date helpers', () => {
  it('renders {{today}} as a YYYY-MM-DD string', async () => {
    const { applyTemplate } = await import('@/lib/brain/template');
    const out = await applyTemplate('today is {{today}}', { today: TODAY, clientId: 1 });
    expect(out).toBe('today is 2026-04-29');
  });

  it('renders {{today.long}} as a long-form English date', async () => {
    const { applyTemplate } = await import('@/lib/brain/template');
    const out = await applyTemplate('the date is {{today.long}}.', { today: TODAY, clientId: 1 });
    expect(out).toBe('the date is April 29, 2026.');
  });

  it('renders {{week}} as an ISO-8601 week label', async () => {
    const { applyTemplate } = await import('@/lib/brain/template');
    const out = await applyTemplate('week={{week}}', { today: TODAY, clientId: 1 });
    expect(out).toBe('week=2026-W18');
  });

  it('week label uses Thursday-of-current-week to pick year (year boundary)', async () => {
    const { applyTemplate } = await import('@/lib/brain/template');
    // Jan 1, 2027 is a Friday — ISO week 53 of 2026.
    const out = await applyTemplate('w={{week}}', { today: new Date(Date.UTC(2027, 0, 1)), clientId: 1 });
    expect(out).toBe('w=2026-W53');
  });

  it('week label pads single-digit weeks', async () => {
    const { applyTemplate } = await import('@/lib/brain/template');
    // Jan 5, 2026 is a Monday — ISO week 02 of 2026.
    const out = await applyTemplate('{{week}}', { today: new Date(Date.UTC(2026, 0, 5)), clientId: 1 });
    expect(out).toBe('2026-W02');
  });

  it('long date covers month names beyond January', async () => {
    const { applyTemplate } = await import('@/lib/brain/template');
    const out = await applyTemplate('{{today.long}}', { today: new Date(Date.UTC(2026, 11, 7)), clientId: 1 });
    expect(out).toBe('December 7, 2026');
  });

  it('pads single-digit month and day in {{today}}', async () => {
    const { applyTemplate } = await import('@/lib/brain/template');
    const out = await applyTemplate('{{today}}', { today: new Date(Date.UTC(2026, 0, 3)), clientId: 1 });
    expect(out).toBe('2026-01-03');
  });
});

describe('applyTemplate — userName', () => {
  it('renders {{userName}} from context', async () => {
    const { applyTemplate } = await import('@/lib/brain/template');
    const out = await applyTemplate('hi {{userName}}', { today: TODAY, clientId: 1, userName: 'Dan' });
    expect(out).toBe('hi Dan');
  });

  it('renders {{userName}} as empty string when null', async () => {
    const { applyTemplate } = await import('@/lib/brain/template');
    const out = await applyTemplate('hi {{userName}}!', { today: TODAY, clientId: 1, userName: null });
    expect(out).toBe('hi !');
  });

  it('renders {{userName}} as empty string when undefined', async () => {
    const { applyTemplate } = await import('@/lib/brain/template');
    const out = await applyTemplate('hi {{userName}}!', { today: TODAY, clientId: 1 });
    expect(out).toBe('hi !');
  });
});

describe('applyTemplate — open_tasks', () => {
  it('renders placeholder text when there are no open tasks', async () => {
    const { applyTemplate } = await import('@/lib/brain/template');
    state.taskRows = [];
    const out = await applyTemplate('Tasks:\n{{open_tasks}}', { today: TODAY, clientId: 42 });
    expect(out).toBe('Tasks:\n_(no open tasks)_');
  });

  it('renders a bulleted list of open tasks with due dates', async () => {
    const { applyTemplate } = await import('@/lib/brain/template');
    state.taskRows = [
      { id: 1, title: 'Ship the thing', dueDate: new Date(Date.UTC(2026, 4, 1)) },
      { id: 2, title: 'Write the doc', dueDate: null },
    ];
    const out = await applyTemplate('{{open_tasks}}', { today: TODAY, clientId: 42 });
    expect(out).toBe('- Ship the thing _(due 2026-05-01)_\n- Write the doc');
  });

  it('does not query the DB when {{open_tasks}} is not referenced', async () => {
    const { applyTemplate } = await import('@/lib/brain/template');
    state.taskRows = [{ id: 1, title: 'x', dueDate: null }];
    const out = await applyTemplate('plain body', { today: TODAY, clientId: 42 });
    expect(out).toBe('plain body');
    expect(state.lastTaskFilter).toBeNull();
  });
});

describe('applyTemplate — recent_meetings', () => {
  it('renders placeholder text when there are no recent meetings', async () => {
    const { applyTemplate } = await import('@/lib/brain/template');
    state.meetingRows = [];
    const out = await applyTemplate('Meetings:\n{{recent_meetings}}', { today: TODAY, clientId: 7 });
    expect(out).toBe('Meetings:\n_(no meetings in the last 7 days)_');
  });

  it('renders meetings using meetingDate when set, otherwise createdAt', async () => {
    const { applyTemplate } = await import('@/lib/brain/template');
    state.meetingRows = [
      {
        id: 1,
        title: 'Standup',
        meetingDate: new Date(Date.UTC(2026, 3, 27)),
        createdAt: new Date(Date.UTC(2026, 3, 28)),
      },
      {
        id: 2,
        title: 'Retro',
        meetingDate: null,
        createdAt: new Date(Date.UTC(2026, 3, 25)),
      },
    ];
    const out = await applyTemplate('{{recent_meetings}}', { today: TODAY, clientId: 7 });
    expect(out).toBe('- Standup _(2026-04-27)_\n- Retro _(2026-04-25)_');
  });

  it('does not query the DB when {{recent_meetings}} is not referenced', async () => {
    const { applyTemplate } = await import('@/lib/brain/template');
    state.meetingRows = [
      { id: 1, title: 'x', meetingDate: null, createdAt: new Date() },
    ];
    const out = await applyTemplate('plain body', { today: TODAY, clientId: 7 });
    expect(out).toBe('plain body');
    expect(state.lastMeetingFilter).toBeNull();
  });
});

describe('applyTemplate — unrecognized vars and edge cases', () => {
  it('leaves unrecognized variables in place', async () => {
    const { applyTemplate } = await import('@/lib/brain/template');
    const out = await applyTemplate('keep {{unknown}} as-is', { today: TODAY, clientId: 1 });
    expect(out).toBe('keep {{unknown}} as-is');
  });

  it('handles whitespace inside delimiters', async () => {
    const { applyTemplate } = await import('@/lib/brain/template');
    const out = await applyTemplate('d={{   today   }}', { today: TODAY, clientId: 1 });
    expect(out).toBe('d=2026-04-29');
  });

  it('replaces multiple occurrences of the same variable', async () => {
    const { applyTemplate } = await import('@/lib/brain/template');
    const out = await applyTemplate('{{today}} and again {{today}}', { today: TODAY, clientId: 1 });
    expect(out).toBe('2026-04-29 and again 2026-04-29');
  });

  it('returns body unchanged when there are no variables', async () => {
    const { applyTemplate } = await import('@/lib/brain/template');
    const out = await applyTemplate('just text', { today: TODAY, clientId: 1 });
    expect(out).toBe('just text');
  });

  it('mixes recognized and unrecognized variables', async () => {
    const { applyTemplate } = await import('@/lib/brain/template');
    const out = await applyTemplate('on {{today}}, {{custom_var}} fired', { today: TODAY, clientId: 1 });
    expect(out).toBe('on 2026-04-29, {{custom_var}} fired');
  });
});
