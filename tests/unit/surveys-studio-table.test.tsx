// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/link', () => ({ default: ({ children, href, onClick }: { children: React.ReactNode; href: string; onClick?: (e: React.MouseEvent) => void }) => <a href={href} onClick={onClick}>{children}</a> }));
import SurveysStudioTable, { crmHref } from '@/components/portal/surveys/SurveysStudioTable';

afterEach(cleanup);

describe('PUX-178 surveys table', () => {
  it('crmHref: deals and proposals link, other linkage does not', () => {
    expect(crmHref('crm_deal', 4)).toBe('/portal/crm/deals/4');
    expect(crmHref('crm_proposal', 9)).toBe('/portal/crm/proposals/9');
    expect(crmHref('email_campaign', 2)).toBeNull();
    expect(crmHref('crm_deal', null)).toBeNull();
  });
  it('rows: status, responses, last response, a real CRM link that does not open the row', () => {
    const { container } = render(<SurveysStudioTable rows={[
      { id: 1, title: 'Post-trip feedback', status: 'active', responseCount: 54, questionCount: 3, linkedType: 'crm_deal', linkedId: 7, lastResponseAt: new Date(Date.now() - 86_400_000).toISOString() },
      { id: 2, title: 'Corporate retreat qualifier', status: 'draft', responseCount: 0, questionCount: 6, linkedType: 'email_campaign', linkedId: 3, lastResponseAt: null },
    ]} />);
    expect(screen.getByRole('link', { name: /linked to a deal/ }).getAttribute('href')).toBe('/portal/crm/deals/7');
    expect(container.textContent).toContain('linked to email campaign');
    expect(container.textContent).toContain('2 surveys · 54 responses');
    fireEvent.click(screen.getByText('Corporate retreat qualifier'));
    expect(push).toHaveBeenCalledWith('/portal/surveys/2');
    expect(container.textContent).toContain('—');
  });
});
