// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SeoSnippetPreview from '@/app/portal/websites/[siteId]/store/products/[productId]/_components/SeoSnippetPreview';

describe('SeoSnippetPreview (PUX-210)', () => {
  it('draws the result from the SEO fields, falling back to the name', () => {
    render(<SeoSnippetPreview title="" description="" name="Trail Mug" slug="trail-mug" host="ridgeline.co" />);
    expect(screen.getByText('Trail Mug')).toBeTruthy();
    expect(screen.getByText(/Add a meta description/)).toBeTruthy();
    expect(screen.getByText('ridgeline.co › products › trail-mug')).toBeTruthy();
  });
});
