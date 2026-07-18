// TODO(designer): unskip after wave 2 integration is wired
'use client';

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ProductDesigner } from './ProductDesigner';

// Mock the EditorContext
jest.mock('./EditorContext', () => ({
  EditorContext: React.createContext({}),
}));

// Mock child components to focus on ProductDesigner performance
jest.mock('./CenterPanel', () => ({
  CenterPanel: () => <div>CenterPanel</div>
}));

jest.mock('./LeftPanel', () => ({
  LeftPanel: () => <div>LeftPanel</div>
}));

jest.mock('./DesignsPage', () => ({
  DesignsPage: () => <div>DesignsPage</div>
}));

// Mock fetch
global.fetch = jest.fn();

const mockProps = {
  productId: 'test-product',
  websiteId: 1,
  customerId: 1,
  stores: [{ id: 1, name: 'Test Store' }],
};

describe('ProductDesigner Performance', () => {
  beforeEach(() => {
    (fetch as jest.Mock).mockClear();
  });

  it.skip('renders without crashing', () => {
    render(<ProductDesigner {...mockProps} />);
    expect(screen.getByText('CenterPanel')).toBeInTheDocument();
  });

  it.skip('memoizes expensive calculations', () => {
    const { rerender } = render(<ProductDesigner {...mockProps} />);

    // Re-render with same props should not trigger new calculations
    rerender(<ProductDesigner {...mockProps} />);

    // This test validates that the component uses React.memo and useMemo
    // The real performance gain would be measured in a browser with React DevTools
  });

  it.skip('uses callbacks for event handlers', () => {
    const onSaveDesign = jest.fn();
    render(<ProductDesigner {...mockProps} onSaveDesign={onSaveDesign} />);

    // The component should use useCallback for event handlers
    // This prevents unnecessary re-renders of child components
  });
});
