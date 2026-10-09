// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { siteAddress, siteStatus } from '@/lib/sites/site-status';
import SiteCard from '@/components/portal/websites/SiteCard';

afterEach(cleanup);

describe('PUX-182 site cards', () => {
  it('status: the same four deployment states, pending reads as Draft; address prefers the subdomain', () => {
    expect(siteStatus('active').label).toBe('Live');
    expect(siteStatus('provisioning').label).toBe('Setting up');
    expect(siteStatus('failed').label).toBe('Failed');
    expect(siteStatus('pending').label).toBe('Draft');
    expect(siteAddress({ subdomain: 'ridgeline', domain: 'ridgelineoutfitters.com' })).toBe('ridgeline.simplerdevelopment.com');
    expect(siteAddress({ subdomain: null, domain: 'ridgelineoutfitters.com' })).toBe('ridgelineoutfitters.com');
    expect(siteAddress({ subdomain: null, domain: null })).toBeNull();
  });
  it('card: pill, pages + updated, Open / Edit pages links', () => {
    render(<SiteCard site={{ id: 3, name: 'Ridgeline Outfitters', subdomain: null, domain: 'ridgelineoutfitters.com', deploymentStatus: 'active', updatedAt: new Date().toISOString(), pageCount: 14 }} />);
    expect(screen.getByText('Live')).toBeTruthy();
    expect(screen.getByText(/14 pages · updated/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open' }).getAttribute('href')).toBe('/portal/websites/3');
    expect(screen.getByRole('link', { name: 'Edit pages' }).getAttribute('href')).toBe('/portal/websites/3/entries');
  });
  it('a pending microsite reads as Draft with its pages not published yet', () => {
    render(<SiteCard site={{ id: 4, name: 'Fall campaign', subdomain: 'fall', domain: null, deploymentStatus: 'pending', updatedAt: null, pageCount: 3 }} />);
    expect(screen.getByText('Draft')).toBeTruthy();
    expect(screen.getByText('3 pages not published yet')).toBeTruthy();
  });
});
