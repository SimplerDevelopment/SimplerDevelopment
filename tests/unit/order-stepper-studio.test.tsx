// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import OrderStepper from '@/app/portal/websites/[siteId]/store/orders/[orderId]/_components/OrderStepper';

describe('OrderStepper (PUX-187)', () => {
  it('lights the current step and shows terminal statuses as a pill', () => {
    const { getByText, container } = render(<OrderStepper status="processing" />);
    expect(container.querySelector('[aria-current="step"]')?.textContent).toContain('Processing');
    expect(getByText('Placed').closest('li')?.className).toContain('bg-foreground');
    const { getByText: g2, container: c2 } = render(<OrderStepper status="cancelled" />);
    expect(g2('Cancelled')).toBeTruthy();
    expect(c2.querySelector('[aria-current="step"]')).toBeNull();
  });
});
