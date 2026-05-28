// @vitest-environment node
/**
 * Unit tests for lib/brain/embedding-extractors.ts.
 *
 * Each extractor pulls one (or two) rows via drizzle and returns an
 * ExtractedContent shape. We mock @/lib/db with a queue: every call to
 * `db.select(...).from(table).where(...).limit(1)` consumes the next row
 * from a per-table queue. That lets tests model multi-table reads (e.g.
 * relationship -> company, contact -> company) by enqueuing rows in order.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- table stand-ins ----
const TABLES = {
  brainNotes: { __table: 'brainNotes', id: 'brainNotes.id', clientId: 'brainNotes.clientId', title: 'brainNotes.title', body: 'brainNotes.body', tags: 'brainNotes.tags' },
  brainMeetings: { __table: 'brainMeetings', id: 'brainMeetings.id', clientId: 'brainMeetings.clientId', title: 'brainMeetings.title', aiSummary: 'brainMeetings.aiSummary', humanSummary: 'brainMeetings.humanSummary', transcript: 'brainMeetings.transcript' },
  brainTasks: { __table: 'brainTasks', id: 'brainTasks.id', clientId: 'brainTasks.clientId', title: 'brainTasks.title', description: 'brainTasks.description', status: 'brainTasks.status', priority: 'brainTasks.priority' },
  brainRelationshipOverlays: { __table: 'brainRelationshipOverlays', id: 'brainRelationshipOverlays.id', clientId: 'brainRelationshipOverlays.clientId', relationshipType: 'brainRelationshipOverlays.relationshipType', summary: 'brainRelationshipOverlays.summary', currentPriorities: 'brainRelationshipOverlays.currentPriorities', openLoops: 'brainRelationshipOverlays.openLoops', companyId: 'brainRelationshipOverlays.companyId', dealId: 'brainRelationshipOverlays.dealId' },
  crmCompanies: { __table: 'crmCompanies', id: 'crmCompanies.id', clientId: 'crmCompanies.clientId', name: 'crmCompanies.name', domain: 'crmCompanies.domain', industry: 'crmCompanies.industry', size: 'crmCompanies.size', description: 'crmCompanies.description', notes: 'crmCompanies.notes', address: 'crmCompanies.address' },
  crmContacts: { __table: 'crmContacts', id: 'crmContacts.id', clientId: 'crmContacts.clientId', firstName: 'crmContacts.firstName', lastName: 'crmContacts.lastName', email: 'crmContacts.email', title: 'crmContacts.title', department: 'crmContacts.department', seniority: 'crmContacts.seniority', notes: 'crmContacts.notes', companyId: 'crmContacts.companyId' },
  crmDeals: { __table: 'crmDeals', id: 'crmDeals.id', clientId: 'crmDeals.clientId', title: 'crmDeals.title', notes: 'crmDeals.notes', status: 'crmDeals.status', priority: 'crmDeals.priority', value: 'crmDeals.value', currency: 'crmDeals.currency', companyId: 'crmDeals.companyId', contactId: 'crmDeals.contactId' },
  posts: { __table: 'posts', id: 'posts.id', title: 'posts.title', excerpt: 'posts.excerpt', content: 'posts.content', websiteId: 'posts.websiteId' },
  clientWebsites: { __table: 'clientWebsites', id: 'clientWebsites.id', clientId: 'clientWebsites.clientId' },
};

vi.mock('@/lib/db/schema', () => TABLES);

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
}));

// Queues keyed by table.__table — each .limit(1) call shifts the next row.
const queues: Record<string, Array<Record<string, unknown> | undefined>> = {};

function enqueue(tableKey: string, row: Record<string, unknown> | undefined) {
  if (!queues[tableKey]) queues[tableKey] = [];
  queues[tableKey].push(row);
}

vi.mock('@/lib/db', () => {
  function buildSelectChain(table: { __table: string }) {
    const chain = {
      from: () => chain,
      where: () => chain,
      limit: () => {
        const q = queues[table.__table] ?? [];
        const row = q.shift();
        return Promise.resolve(row === undefined ? [] : [row]);
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
  for (const k of Object.keys(queues)) delete queues[k];
});

describe('extractContentForEntity — notes', () => {
  it('returns found:false when row is missing', async () => {
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'note', 999);
    expect(out).toEqual({ text: '', found: false });
  });

  it('joins title, tags, and body with double newlines', async () => {
    enqueue('brainNotes', { title: 'Hello', body: 'World body', tags: ['a', 'b'] });
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'note', 1);
    expect(out.found).toBe(true);
    expect(out.text).toBe('Hello\n\nTags: a, b\n\nWorld body');
  });

  it('omits empty tags and missing fields', async () => {
    enqueue('brainNotes', { title: 'OnlyTitle', body: null, tags: null });
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'note', 1);
    expect(out).toEqual({ text: 'OnlyTitle', found: true });
  });

  it('handles empty-array tags as missing', async () => {
    enqueue('brainNotes', { title: 'T', body: 'B', tags: [] });
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'note', 1);
    expect(out.text).toBe('T\n\nB');
  });
});

describe('extractContentForEntity — meetings', () => {
  it('returns found:false when row is missing', async () => {
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'meeting', 99);
    expect(out).toEqual({ text: '', found: false });
  });

  it('prefers human summary over AI summary and transcript', async () => {
    enqueue('brainMeetings', { title: 'Standup', humanSummary: 'HUM', aiSummary: 'AI', transcript: 'TR' });
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'meeting', 1);
    expect(out.text).toBe('Standup\n\nHUM');
  });

  it('falls back to AI summary when human is missing', async () => {
    enqueue('brainMeetings', { title: 'Standup', humanSummary: null, aiSummary: 'AI', transcript: 'TR' });
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'meeting', 1);
    expect(out.text).toBe('Standup\n\nAI');
  });

  it('falls back to transcript when both summaries missing', async () => {
    enqueue('brainMeetings', { title: 'Standup', humanSummary: null, aiSummary: null, transcript: 'TR' });
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'meeting', 1);
    expect(out.text).toBe('Standup\n\nTR');
  });

  it('returns only title when no body fields exist', async () => {
    enqueue('brainMeetings', { title: 'JustTitle', humanSummary: null, aiSummary: null, transcript: null });
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'meeting', 1);
    expect(out.text).toBe('JustTitle');
  });
});

describe('extractContentForEntity — relationships', () => {
  it('returns found:false when row is missing', async () => {
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'relationship', 1);
    expect(out).toEqual({ text: '', found: false });
  });

  it('anchors on company name when companyId is set', async () => {
    enqueue('brainRelationshipOverlays', {
      relationshipType: 'partner', summary: 'sumX', currentPriorities: 'pX', openLoops: 'oX',
      companyId: 42, dealId: null,
    });
    enqueue('crmCompanies', { name: 'Acme Corp' });
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'relationship', 1);
    expect(out.found).toBe(true);
    expect(out.text).toBe(
      'Relationship: Acme Corp (partner)\n\nSummary: sumX\n\nPriorities: pX\n\nOpen loops: oX',
    );
  });

  it('falls back to deal title when companyId is null and dealId set', async () => {
    enqueue('brainRelationshipOverlays', {
      relationshipType: 'vendor', summary: null, currentPriorities: null, openLoops: null,
      companyId: null, dealId: 7,
    });
    enqueue('crmDeals', { title: 'Big Deal' });
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'relationship', 1);
    expect(out.text).toBe('Relationship: Big Deal (vendor)');
  });

  it('emits unanchored line when neither company nor deal is linked', async () => {
    enqueue('brainRelationshipOverlays', {
      relationshipType: 'investor', summary: 's', currentPriorities: null, openLoops: null,
      companyId: null, dealId: null,
    });
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'relationship', 1);
    expect(out.text).toBe('Relationship: investor\n\nSummary: s');
  });

  it('handles missing linked company gracefully', async () => {
    enqueue('brainRelationshipOverlays', {
      relationshipType: 'partner', summary: null, currentPriorities: null, openLoops: null,
      companyId: 99, dealId: null,
    });
    // No company row enqueued — lookup returns []
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'relationship', 1);
    expect(out.text).toBe('Relationship: partner');
  });
});

describe('extractContentForEntity — tasks', () => {
  it('returns found:false when row is missing', async () => {
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'task', 1);
    expect(out).toEqual({ text: '', found: false });
  });

  it('includes title, status/priority line, and description', async () => {
    enqueue('brainTasks', { title: 'Do the thing', description: 'long desc', status: 'open', priority: 'high' });
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'task', 1);
    expect(out.text).toBe('Do the thing\n\nStatus: open · Priority: high\n\nlong desc');
  });

  it('omits description when null', async () => {
    enqueue('brainTasks', { title: 'T', description: null, status: 'done', priority: 'low' });
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'task', 1);
    expect(out.text).toBe('T\n\nStatus: done · Priority: low');
  });
});

describe('extractContentForEntity — companies', () => {
  it('returns found:false when missing', async () => {
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'company', 1);
    expect(out).toEqual({ text: '', found: false });
  });

  it('joins name, meta line, address, description, notes', async () => {
    enqueue('crmCompanies', {
      name: 'Acme', domain: 'acme.com', industry: 'tech', size: 200,
      description: 'desc', notes: 'notes', address: '123 Main St',
    });
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'company', 1);
    expect(out.text).toBe('Acme\n\nacme.com · tech · 200 employees\n\n123 Main St\n\ndesc\n\nnotes');
  });

  it('handles all-null meta fields', async () => {
    enqueue('crmCompanies', {
      name: 'Acme', domain: null, industry: null, size: null,
      description: null, notes: null, address: null,
    });
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'company', 1);
    // meta line resolves to '' which is filtered out by length check
    expect(out.text).toBe('Acme');
  });
});

describe('extractContentForEntity — contacts', () => {
  it('returns found:false when missing', async () => {
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'contact', 1);
    expect(out).toEqual({ text: '', found: false });
  });

  it('renders full name, role at company, email, notes (newline-joined)', async () => {
    enqueue('crmContacts', {
      firstName: 'Jane', lastName: 'Doe', email: 'j@e.com',
      title: 'VP', department: 'Eng', seniority: 'Director',
      notes: 'n', companyId: 5,
    });
    enqueue('crmCompanies', { name: 'Acme' });
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'contact', 1);
    expect(out.text).toBe('Jane Doe\nVP · Eng · Director at Acme\nj@e.com\nn');
  });

  it('uses "Contact at <company>" when role is empty but company known', async () => {
    enqueue('crmContacts', {
      firstName: 'Jane', lastName: null, email: null,
      title: null, department: null, seniority: null,
      notes: null, companyId: 5,
    });
    enqueue('crmCompanies', { name: 'Acme' });
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'contact', 1);
    expect(out.text).toBe('Jane\nContact at Acme');
  });

  it('emits just the role string when no company linked', async () => {
    enqueue('crmContacts', {
      firstName: 'Jane', lastName: 'Doe', email: null,
      title: 'CTO', department: null, seniority: null,
      notes: null, companyId: null,
    });
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'contact', 1);
    expect(out.text).toBe('Jane Doe\nCTO');
  });

  it('gracefully handles companyId pointing to missing company', async () => {
    enqueue('crmContacts', {
      firstName: 'Jane', lastName: 'Doe', email: null,
      title: 'CTO', department: null, seniority: null,
      notes: null, companyId: 999,
    });
    // No company enqueued
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'contact', 1);
    // companyName falls back to '' -> branch uses bare role string
    expect(out.text).toBe('Jane Doe\nCTO');
  });
});

describe('extractContentForEntity — deals', () => {
  it('returns found:false when missing', async () => {
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'deal', 1);
    expect(out).toEqual({ text: '', found: false });
  });

  it('renders title, full meta with formatted currency, notes', async () => {
    enqueue('crmDeals', {
      title: 'Big Co Renewal', notes: 'deal notes',
      status: 'open', priority: 'high',
      value: 1234500, currency: 'USD',
      companyId: 5, contactId: 7,
    });
    enqueue('crmCompanies', { name: 'Acme' });
    enqueue('crmContacts', { firstName: 'Jane', lastName: 'Doe' });
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'deal', 1);
    // 1234500 cents -> $12,345.00
    expect(out.text).toContain('Big Co Renewal');
    expect(out.text).toContain('Status: open');
    expect(out.text).toContain('Priority: high');
    expect(out.text).toContain('Value: $12,345.00');
    expect(out.text).toContain('Company: Acme');
    expect(out.text).toContain('Contact: Jane Doe');
    expect(out.text).toContain('deal notes');
  });

  it('omits value when null and defaults currency to USD when missing', async () => {
    enqueue('crmDeals', {
      title: 'NoValue', notes: null,
      status: 'open', priority: null,
      value: null, currency: null,
      companyId: null, contactId: null,
    });
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'deal', 1);
    expect(out.text).toBe('NoValue\n\nStatus: open');
  });

  it('uses provided currency when value present', async () => {
    enqueue('crmDeals', {
      title: 'Euro', notes: null,
      status: null, priority: null,
      value: 100000, currency: 'EUR',
      companyId: null, contactId: null,
    });
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'deal', 1);
    // 100000 cents -> 1,000.00 EUR — locale formatting varies but value must appear
    expect(out.text).toMatch(/Euro/);
    expect(out.text).toMatch(/Value: .*1,000\.00/);
  });

  it('renders just the title when all meta is null', async () => {
    enqueue('crmDeals', {
      title: 'BareDeal', notes: null,
      status: null, priority: null,
      value: null, currency: null,
      companyId: null, contactId: null,
    });
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'deal', 1);
    expect(out.text).toBe('BareDeal');
  });

  it('handles companyId pointing to missing company and contactId to missing contact', async () => {
    enqueue('crmDeals', {
      title: 'D', notes: null,
      status: 'open', priority: null,
      value: null, currency: null,
      companyId: 99, contactId: 88,
    });
    // No company / contact enqueued
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'deal', 1);
    expect(out.text).toBe('D\n\nStatus: open');
  });

  it('omits contact line when both firstName and lastName are null', async () => {
    enqueue('crmDeals', {
      title: 'D', notes: null,
      status: null, priority: null,
      value: null, currency: null,
      companyId: null, contactId: 7,
    });
    enqueue('crmContacts', { firstName: null, lastName: null });
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'deal', 1);
    // contactName = '' so "Contact: " line is filtered out
    expect(out.text).toBe('D');
  });
});

describe('extractContentForEntity — posts', () => {
  it('returns found:false when post missing', async () => {
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'post', 1);
    expect(out).toEqual({ text: '', found: false });
  });

  it('returns found:false when websiteId is null (agency-level post)', async () => {
    enqueue('posts', { id: 1, title: 'T', excerpt: null, content: null, websiteId: null });
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'post', 1);
    expect(out).toEqual({ text: '', found: false });
  });

  it('returns found:false when website not found', async () => {
    enqueue('posts', { id: 1, title: 'T', excerpt: null, content: null, websiteId: 5 });
    // No website row enqueued
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'post', 1);
    expect(out).toEqual({ text: '', found: false });
  });

  it('returns found:false when website belongs to a different client', async () => {
    enqueue('posts', { id: 1, title: 'T', excerpt: null, content: null, websiteId: 5 });
    enqueue('clientWebsites', { clientId: 999 });
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'post', 1);
    expect(out).toEqual({ text: '', found: false });
  });

  it('treats non-JSON content as plain text', async () => {
    enqueue('posts', { id: 1, title: 'Hello', excerpt: 'ex', content: 'just plain prose here', websiteId: 5 });
    enqueue('clientWebsites', { clientId: 1 });
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'post', 1);
    expect(out.text).toBe('Hello\n\nex\n\njust plain prose here');
    expect(out.found).toBe(true);
  });

  it('walks block JSON, filtering URLs/hex/short strings and SKIP_KEYS', async () => {
    const blocks = {
      blocks: [
        {
          type: 'heading',
          text: 'A meaningful headline',
          // skipped: SKIP_KEYS.has('href') / .has('src') / .has('color') / .has('value') / .has('size')
          href: 'should be ignored even if long enough',
          src: '/img.png',
          color: '#fff',
          size: 'large',
          value: 'this would be content but key is in SKIP_KEYS',
          // skipped: nested url-like, hex, short
          subtitle: 'http://example.com/page',
          accent: '#abcdef',
          tag: 'hi',
          body: 'Another long body of real content right here.',
        },
      ],
    };
    enqueue('posts', { id: 1, title: 'Pt', excerpt: null, content: JSON.stringify(blocks), websiteId: 5 });
    enqueue('clientWebsites', { clientId: 1 });
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'post', 1);
    expect(out.found).toBe(true);
    expect(out.text).toContain('Pt');
    expect(out.text).toContain('A meaningful headline');
    expect(out.text).toContain('Another long body of real content right here.');
    expect(out.text).not.toContain('should be ignored');
    expect(out.text).not.toContain('/img.png');
    expect(out.text).not.toContain('#fff');
    expect(out.text).not.toContain('#abcdef');
    expect(out.text).not.toContain('http://example.com/page');
    expect(out.text).not.toContain('large');
    expect(out.text).not.toContain('hi');
    expect(out.text).not.toContain('this would be content but key is in SKIP_KEYS');
  });

  it('falls back to raw content when JSON parse fails', async () => {
    // Starts with { but is not valid JSON
    enqueue('posts', { id: 1, title: 'X', excerpt: null, content: '{not valid json', websiteId: 5 });
    enqueue('clientWebsites', { clientId: 1 });
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'post', 1);
    expect(out.text).toBe('X\n\n{not valid json');
  });

  it('handles null content gracefully', async () => {
    enqueue('posts', { id: 1, title: 'OnlyTitle', excerpt: null, content: null, websiteId: 5 });
    enqueue('clientWebsites', { clientId: 1 });
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'post', 1);
    expect(out.text).toBe('OnlyTitle');
  });

  it('skips short strings (<4 chars) and recurses through arrays', async () => {
    const blocks = [
      { caption: 'no' }, // too short
      { caption: 'yes long enough text' },
      [{ nested: 'deeper string content here' }],
    ];
    enqueue('posts', { id: 1, title: 'A', excerpt: null, content: JSON.stringify(blocks), websiteId: 5 });
    enqueue('clientWebsites', { clientId: 1 });
    const { extractContentForEntity } = await import('@/lib/brain/embedding-extractors');
    const out = await extractContentForEntity(1, 'post', 1);
    expect(out.text).toContain('yes long enough text');
    expect(out.text).toContain('deeper string content here');
    expect(out.text).not.toMatch(/(^|\n)no(\n|$)/);
  });
});
