// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import ProductsStudioTable from '@/components/portal/store/ProductsStudioTable';

const rows = [
  { id: 1, name: 'Trail Mug', sku: 'MUG-01', status: 'active', price: 1800, compareAtPrice: null, quantity: 4, trackInventory: true, images: [{ url: 'https://x/mug.jpg' }] },
  { id: 2, name: 'Sticker', sku: null, status: 'draft', price: 300, compareAtPrice: 500, quantity: 0, trackInventory: false, images: [] },
];

describe('ProductsStudioTable (PUX-186)', () => {
  it('renders thumbnail, SKU, stock pill and status; row click opens', () => {
    const onOpen = vi.fn();
    const { getByText, container } = render(
      <ProductsStudioTable rows={rows} lowStockThreshold={5} selected={new Set()} onToggle={() => {}} onToggleAll={() => {}} onOpen={onOpen} footer="2 products" />,
    );
    expect(container.querySelector('img[src="https://x/mug.jpg"]')).toBeTruthy();
    expect(getByText('MUG-01')).toBeTruthy();
    expect(getByText('4 left').className).toContain('portal-warn');
    expect(getByText('Not tracked')).toBeTruthy();
    expect(getByText('$18.00')).toBeTruthy();
    expect(getByText('draft')).toBeTruthy();
    fireEvent.click(getByText('Trail Mug'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });
});
