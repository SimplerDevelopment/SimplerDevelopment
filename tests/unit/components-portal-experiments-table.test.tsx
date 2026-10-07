// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import ExperimentsTable, { type ExperimentRow } from '@/components/portal/ExperimentsTable';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const experiment: ExperimentRow = {
  id: 1, name: 'Landing test', status: 'running', goalMetric: 'conversion',
  startedAt: '2026-06-01T00:30:00.000Z', endedAt: null, createdAt: '2026-05-31T23:00:00.000Z',
  targetType: 'post', targetId: 2, targetTitle: 'Landing', targetEditHref: '/portal/websites/1/posts/2/edit', targetSubLabel: null,
};

afterEach(() => vi.restoreAllMocks());

describe('ExperimentsTable', () => {
  it('hydrates a UTC date across different locales/timezones and then displays the browser date', async () => {
    const format = vi.spyOn(Date.prototype, 'toLocaleDateString').mockImplementation(function (this: Date) {
      return new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC' }).format(this);
    });
    const html = renderToString(<ExperimentsTable experiments={[experiment]} />);
    expect(html).toContain('2026-06-01</time>');
    expect(format).not.toHaveBeenCalled();
    format.mockImplementation(function (this: Date) {
      return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles' }).format(this);
    });
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    const onRecoverableError = vi.fn();
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, <ExperimentsTable experiments={[experiment]} />, { onRecoverableError });
      });
      expect(container.querySelector('time')?.textContent).toBe('5/31/2026');
      expect(container.querySelector('time')?.dateTime).toBe(experiment.startedAt);
      expect(onRecoverableError).not.toHaveBeenCalled();
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  });

  it('preserves the missing start date and filter interactions', () => {
    const { container } = render(<ExperimentsTable experiments={[{ ...experiment, startedAt: null }]} />);
    expect(container.querySelector('tbody')?.textContent).toContain('—');
    expect(container.querySelector('time')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Draft/ }));
    expect(screen.getByText('No experiments match these filters')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Reset filters/ }));
    expect(screen.getByText('Landing test')).toBeTruthy();
  });
});
