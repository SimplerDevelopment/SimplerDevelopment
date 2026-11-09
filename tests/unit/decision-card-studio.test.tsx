// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import DecisionCard, { type DecisionRow } from '@/components/brain/DecisionCard';

afterEach(cleanup);
const d: DecisionRow = {
  id: 7, title: 'Drop the Tuesday shuttle?', decision: 'Drop it for the fall season.', context: 'Runs at 30% most Tuesdays.', rationale: null, alternativesConsidered: 'Combine with Thursday.',
  status: 'proposed', reversibility: 'two_way', decisionMakerId: null, decidedAt: new Date().toISOString(), supersededByDecisionId: 12,
} as unknown as DecisionRow;

describe('DecisionCard studio row (PUX-162)', () => {
  it('links the title and the supersede, and expands the reasoning in place', () => {
    render(<DecisionCard decision={d} studio href="/portal/brain/decisions/7" />);
    expect(screen.getByRole('link', { name: 'Drop the Tuesday shuttle?' }).getAttribute('href')).toBe('/portal/brain/decisions/7');
    expect(screen.getByRole('link', { name: /superseded by #12/ }).getAttribute('href')).toBe('/portal/brain/decisions/12');
    expect(screen.getByText(/Why — context/)).toBeTruthy();
    expect(screen.getByText('Runs at 30% most Tuesdays.')).toBeTruthy();
    expect(screen.getByText('Combine with Thursday.')).toBeTruthy();
    expect(screen.queryByText('Rationale')).toBeNull(); // absent field → no row
    expect(screen.queryByRole('button')).toBeNull();     // a <div>, so the links are valid
  });
  it('legacy: a button, no links, no details', () => {
    render(<DecisionCard decision={d} onClick={() => {}} />);
    expect(screen.getByRole('button')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText(/Why — context/)).toBeNull();
  });
});
