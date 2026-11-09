// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AgencyPreview, { DEFAULT_AGENCY_COLOR } from '@/app/portal/agency/_components/AgencyPreview';

describe('AgencyPreview (PUX-196)', () => {
  it('sets --agency-primary inline from the chosen colour, falling back to the real default', () => {
    const { rerender } = render(<AgencyPreview color="#6b2d5c" name="Ridgeline" />);
    const box = screen.getByLabelText('White-label preview') as HTMLElement;
    expect(box.style.getPropertyValue('--agency-primary')).toBe('#6b2d5c');
    expect(screen.getByText('Ridgeline')).toBeTruthy();
    rerender(<AgencyPreview color={null} />);
    expect(box.style.getPropertyValue('--agency-primary')).toBe(DEFAULT_AGENCY_COLOR);
    expect(screen.getByText('Your agency')).toBeTruthy();
  });
});
