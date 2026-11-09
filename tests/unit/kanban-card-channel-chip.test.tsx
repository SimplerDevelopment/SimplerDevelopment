// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

let flag = true;
vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => flag }));
vi.mock('@dnd-kit/sortable', () => ({ useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, transition: undefined, isDragging: false }) }));
import { KanbanCard, type Card } from '@/components/portal/board/KanbanCard';

afterEach(cleanup);
const card: Card = {
  id: 1, columnId: 4, title: 'Fall trips are open', description: null, priority: null, dueDate: null, order: 0,
  channel: { icon: 'mail', label: 'Email' }, campaignName: 'Fall trips', scheduledFor: new Date(Date.now() + 86_400_000).toISOString(),
};

describe('PUX-176 KanbanCard channel chip', () => {
  it('studio: channel chip + campaign line above the title, send time below it', () => {
    flag = true;
    const { container } = render(<KanbanCard card={card} onOpen={() => {}} />);
    expect(container.textContent).toContain('mailEmail');
    expect(container.textContent).toContain('Fall trips');
    expect(container.textContent).toMatch(/event.*\d\d:\d\d/);
  });
  it('flag off: none of it renders even when the fields are set', () => {
    flag = false;
    const { container } = render(<KanbanCard card={card} onOpen={() => {}} />);
    expect(container.textContent).not.toContain('Email');
    expect(container.querySelector('.material-icons')?.textContent ?? '').not.toBe('mail');
  });
});
