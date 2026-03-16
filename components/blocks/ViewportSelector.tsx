'use client';

import { Breakpoint, BREAKPOINTS } from '@/types/responsive';
import { useBlockEditor } from '@/contexts/BlockEditorContext';

interface ViewportSelectorProps {
  currentViewport?: Breakpoint;
  onViewportChange?: (viewport: Breakpoint) => void;
  useContext?: boolean;
}

export function ViewportSelector({
  currentViewport: propViewport,
  onViewportChange: propOnChange,
  useContext = true
}: ViewportSelectorProps = {}) {
  const viewports: Breakpoint[] = ['mobile', 'tablet', 'desktop'];

  // Try to use context if available and allowed
  let currentViewport: Breakpoint;
  let onViewportChange: (viewport: Breakpoint) => void;

  if (useContext) {
    try {
      const context = useBlockEditor();
      currentViewport = context.currentViewport;
      onViewportChange = context.setCurrentViewport;
    } catch (e) {
      // Context not available, fall back to props
      currentViewport = propViewport || 'desktop';
      onViewportChange = propOnChange || (() => {});
    }
  } else {
    currentViewport = propViewport || 'desktop';
    onViewportChange = propOnChange || (() => {});
  }

  return (
    <div className="flex items-center gap-1 bg-muted/30 rounded-lg p-1">
      {viewports.map((viewport) => {
        const config = BREAKPOINTS[viewport];
        const isActive = currentViewport === viewport;

        return (
          <button
            key={viewport}
            type="button"
            onClick={() => onViewportChange(viewport)}
            className={`flex items-center justify-center px-3 py-1.5 rounded text-sm font-medium transition-all ${
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background'
            }`}
            title={`${config.label} (${config.min}px - ${config.max === 9999 ? '+' : config.max + 'px'})`}
          >
            <span className="text-base">{config.icon}</span>
          </button>
        );
      })}
    </div>
  );
}
