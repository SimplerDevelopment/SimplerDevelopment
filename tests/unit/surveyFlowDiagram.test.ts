import { describe, it, expect } from 'vitest';
import type { SurveyField } from '@/components/admin/SurveyBuilder';
import { extractPages, extractPagesAndEdges } from '@/lib/surveys/flow-diagram';

// ── Builders ────────────────────────────────────────────────────────────────

function makeField(partial: Partial<SurveyField> & { id: string; order: number }): SurveyField {
  return {
    type: 'text',
    label: partial.id,
    placeholder: '',
    helpText: '',
    required: false,
    options: [],
    ...partial,
  } as SurveyField;
}

function makePageBreak(id: string, order: number): SurveyField {
  return makeField({ id, order, type: 'page_break' });
}

function makeSelect(args: {
  id: string;
  order: number;
  options: string[];
  goToPage?: Record<string, number>;
}): SurveyField {
  return makeField({
    id: args.id,
    order: args.order,
    type: 'select',
    options: args.options,
    goToPage: args.goToPage,
  });
}

// ── extractPages ────────────────────────────────────────────────────────────

describe('extractPages', () => {
  it('returns a single page when there are no page breaks', () => {
    const fields = [
      makeField({ id: 'q1', order: 0 }),
      makeField({ id: 'q2', order: 1 }),
    ];
    const pages = extractPages(fields);
    expect(pages).toHaveLength(1);
    expect(pages[0].fields.map((f) => f.id)).toEqual(['q1', 'q2']);
  });

  it('splits on page_break and excludes the page_break field itself', () => {
    const fields = [
      makeField({ id: 'q1', order: 0 }),
      makePageBreak('pb1', 1),
      makeField({ id: 'q2', order: 2 }),
      makePageBreak('pb2', 3),
      makeField({ id: 'q3', order: 4 }),
    ];
    const pages = extractPages(fields);
    expect(pages).toHaveLength(3);
    expect(pages[0].fields.map((f) => f.id)).toEqual(['q1']);
    expect(pages[1].fields.map((f) => f.id)).toEqual(['q2']);
    expect(pages[2].fields.map((f) => f.id)).toEqual(['q3']);
  });

  it('sorts by order before splitting (input order independence)', () => {
    const fields = [
      makeField({ id: 'q2', order: 2 }),
      makePageBreak('pb', 1),
      makeField({ id: 'q1', order: 0 }),
    ];
    const pages = extractPages(fields);
    expect(pages).toHaveLength(2);
    expect(pages[0].fields.map((f) => f.id)).toEqual(['q1']);
    expect(pages[1].fields.map((f) => f.id)).toEqual(['q2']);
  });
});

// ── extractPagesAndEdges ────────────────────────────────────────────────────

describe('extractPagesAndEdges — single page', () => {
  it('produces 1 page, 0 edges, 0 orphans', () => {
    const fields = [makeField({ id: 'q1', order: 0 })];
    const graph = extractPagesAndEdges(fields);
    expect(graph.pages).toHaveLength(1);
    expect(graph.edges).toHaveLength(0);
    expect(graph.orphans.size).toBe(0);
  });

  it('handles a totally empty survey gracefully', () => {
    const graph = extractPagesAndEdges([]);
    expect(graph.pages).toHaveLength(1);
    expect(graph.pages[0].fields).toEqual([]);
    expect(graph.edges).toHaveLength(0);
    expect(graph.orphans.size).toBe(0);
  });
});

describe('extractPagesAndEdges — two-page survey', () => {
  it('produces 2 pages, 1 default edge, 0 orphans', () => {
    const fields = [
      makeField({ id: 'q1', order: 0 }),
      makePageBreak('pb1', 1),
      makeField({ id: 'q2', order: 2 }),
    ];
    const graph = extractPagesAndEdges(fields);
    expect(graph.pages).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toMatchObject({ kind: 'default-next', from: 0, to: 1 });
    expect(graph.orphans.size).toBe(0);
  });
});

describe('extractPagesAndEdges — goToPage on a 3-page survey', () => {
  it('a partial goToPage produces a goto edge AND the default-next edge', () => {
    // Page 0: select with goToPage[A] = 2 (only one option mapped).
    // Page 1: a text question.
    // Page 2: a final text question.
    const fields = [
      makeSelect({ id: 'q1', order: 0, options: ['A', 'B'], goToPage: { A: 2 } }),
      makePageBreak('pb1', 1),
      makeField({ id: 'q2', order: 2 }),
      makePageBreak('pb2', 3),
      makeField({ id: 'q3', order: 4 }),
    ];
    const graph = extractPagesAndEdges(fields);
    expect(graph.pages).toHaveLength(3);

    // Edges: default(0→1), default(1→2), goto(0→2 via 'A').
    const kinds = graph.edges.map((e) => `${e.kind}:${e.from}->${e.to}`).sort();
    expect(kinds).toEqual(['default-next:0->1', 'default-next:1->2', 'goto:0->2'].sort());

    const goto = graph.edges.find((e) => e.kind === 'goto');
    expect(goto?.optionLabel).toBe('A');
    expect(goto?.fieldId).toBe('q1');

    expect(graph.orphans.size).toBe(0);
  });

  it('a goToPage pointing to page 2 leaves page 1 reachable via default-next (no orphans)', () => {
    const fields = [
      makeSelect({ id: 'q1', order: 0, options: ['A', 'B'], goToPage: { A: 2 } }),
      makePageBreak('pb1', 1),
      makeField({ id: 'q2', order: 2 }),
      makePageBreak('pb2', 3),
      makeField({ id: 'q3', order: 4 }),
    ];
    const graph = extractPagesAndEdges(fields);
    // Page 1 reachable via default-next from page 0.
    expect(graph.orphans.has(1)).toBe(false);
    expect(graph.orphans.has(2)).toBe(false);
    expect(graph.orphans.size).toBe(0);
  });

  it('orphans page 1 when page 0\'s only field has goToPage covering EVERY option (default-next suppressed)', () => {
    // Page 0: select with every option pointing to page 2 → default-next is
    // suppressed → page 1 has no incoming edge → page 1 is orphaned.
    const fields = [
      makeSelect({
        id: 'q1',
        order: 0,
        options: ['A', 'B'],
        goToPage: { A: 2, B: 2 },
      }),
      makePageBreak('pb1', 1),
      makeField({ id: 'q2', order: 2 }),
      makePageBreak('pb2', 3),
      makeField({ id: 'q3', order: 4 }),
    ];
    const graph = extractPagesAndEdges(fields);

    // No default-next from page 0; default-next from page 1 still exists.
    const kinds = graph.edges.map((e) => `${e.kind}:${e.from}->${e.to}`).sort();
    expect(kinds).toContain('default-next:1->2');
    expect(kinds).not.toContain('default-next:0->1');
    // Two goto edges (one per option) both to page 2.
    expect(graph.edges.filter((e) => e.kind === 'goto')).toHaveLength(2);

    expect(graph.orphans.has(1)).toBe(true);
    expect(graph.orphans.has(2)).toBe(false);
  });
});

describe('extractPagesAndEdges — defensive behavior', () => {
  it('ignores goToPage entries that point outside the page index range', () => {
    const fields = [
      makeSelect({ id: 'q1', order: 0, options: ['A'], goToPage: { A: 99 } }),
      makePageBreak('pb', 1),
      makeField({ id: 'q2', order: 2 }),
    ];
    const graph = extractPagesAndEdges(fields);
    expect(graph.edges.filter((e) => e.kind === 'goto')).toHaveLength(0);
    // default-next 0→1 still present.
    expect(graph.edges).toEqual([
      expect.objectContaining({ kind: 'default-next', from: 0, to: 1 }),
    ]);
  });

  it('does not suppress default-next when a select has only a partial goToPage map', () => {
    // Single brancher, but only one of two options mapped — user could pick B
    // and fall through to page 1.
    const fields = [
      makeSelect({ id: 'q1', order: 0, options: ['A', 'B'], goToPage: { A: 2 } }),
      makePageBreak('pb1', 1),
      makeField({ id: 'q2', order: 2 }),
      makePageBreak('pb2', 3),
      makeField({ id: 'q3', order: 4 }),
    ];
    const graph = extractPagesAndEdges(fields);
    const defaults = graph.edges.filter((e) => e.kind === 'default-next');
    expect(defaults.some((e) => e.from === 0 && e.to === 1)).toBe(true);
  });

  it('treats a select with goToPage among multiple input fields as NOT suppressing default-next', () => {
    // Two input fields on page 0 — even if the select covers all its options,
    // we shouldn't assume the user can't reach page 1.
    const fields = [
      makeField({ id: 'q0', order: 0 }),
      makeSelect({
        id: 'q1',
        order: 1,
        options: ['A', 'B'],
        goToPage: { A: 2, B: 2 },
      }),
      makePageBreak('pb1', 2),
      makeField({ id: 'q2', order: 3 }),
      makePageBreak('pb2', 4),
      makeField({ id: 'q3', order: 5 }),
    ];
    const graph = extractPagesAndEdges(fields);
    const defaults = graph.edges.filter((e) => e.kind === 'default-next');
    expect(defaults.some((e) => e.from === 0 && e.to === 1)).toBe(true);
    expect(graph.orphans.size).toBe(0);
  });
});
