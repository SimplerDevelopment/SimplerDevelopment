/**
 * PUX-084 — NotifyDeliveryFields (survey notification recipients + digest cadence).
 *
 * The toggle logic is the part worth pinning: checking a person appends their id
 * and unchecking removes only theirs. Also covers the omitted-props path, because
 * this component is rendered inside SurveySettings, and an undefined team list
 * previously crashed the entire settings form rather than degrading.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NotifyDeliveryFields from '@/app/portal/surveys/[id]/_components/NotifyDeliveryFields';

const MEMBERS = [
  { userId: 11, name: 'Sam Rivera', email: 'sam@example.com' },
  { userId: 12, name: null, email: 'alex@example.com' },
];

function renderFields(overrides: Record<string, unknown> = {}) {
  const setEditNotifyUserIds = vi.fn();
  const setEditDigest = vi.fn();
  render(
    <NotifyDeliveryFields
      editDigest="off"
      setEditDigest={setEditDigest}
      editNotifyUserIds={[]}
      setEditNotifyUserIds={setEditNotifyUserIds}
      teamMembers={MEMBERS}
      {...overrides}
    />,
  );
  return { setEditNotifyUserIds, setEditDigest };
}

describe('NotifyDeliveryFields @surveys', () => {
  it('lists every team member, falling back to email when there is no name', () => {
    renderFields();
    expect(screen.getByText('Sam Rivera')).toBeTruthy();
    expect(screen.getByText('alex@example.com')).toBeTruthy();
  });

  it('appends a member id when their box is checked', () => {
    const { setEditNotifyUserIds } = renderFields({ editNotifyUserIds: [11] });
    // Second checkbox is Alex (12); Sam (11) is already selected.
    const boxes = screen.getAllByRole('checkbox');
    fireEvent.click(boxes[1]!);
    expect(setEditNotifyUserIds).toHaveBeenCalledWith([11, 12]);
  });

  it('removes only the unchecked member, leaving the rest selected', () => {
    const { setEditNotifyUserIds } = renderFields({ editNotifyUserIds: [11, 12] });
    const boxes = screen.getAllByRole('checkbox');
    fireEvent.click(boxes[0]!);
    expect(setEditNotifyUserIds).toHaveBeenCalledWith([12]);
  });

  it('degrades instead of crashing when the team list is omitted', () => {
    // Regression guard: an undefined teamMembers used to throw on `.length`,
    // taking the whole SurveySettings form down with it.
    expect(() =>
      render(<NotifyDeliveryFields editDigest="off" setEditDigest={vi.fn()} />),
    ).not.toThrow();
  });

  it('still renders the digest cadence options', () => {
    renderFields();
    expect(screen.getByText('Daily digest')).toBeTruthy();
    expect(screen.getByText('Weekly digest')).toBeTruthy();
  });
});
