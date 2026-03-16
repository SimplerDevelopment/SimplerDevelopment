'use client';

import { useState } from 'react';

interface ResponsiveHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ResponsiveHelpModal({ isOpen, onClose }: ResponsiveHelpModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200] p-4"
      onClick={onClose}
    >
      <div
        className="bg-background border border-border rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-background border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-foreground">Responsive Design Guide</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-md transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-6">
          {/* Overview */}
          <section>
            <h3 className="text-lg font-semibold text-foreground mb-3">Overview</h3>
            <p className="text-muted-foreground mb-3">
              The responsive design system allows you to customize how your content appears on different
              devices. Configure settings for mobile, tablet, and desktop breakpoints to create an optimal
              experience for all screen sizes.
            </p>
          </section>

          {/* Breakpoints */}
          <section>
            <h3 className="text-lg font-semibold text-foreground mb-3">Breakpoints</h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-10 h-10 bg-primary/10 text-primary rounded text-xl">
                  📱
                </div>
                <div className="flex-1">
                  <div className="font-medium text-foreground">Mobile</div>
                  <div className="text-sm text-muted-foreground">320px - 767px</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Phones and small devices
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-10 h-10 bg-primary/10 text-primary rounded text-xl">
                  📱
                </div>
                <div className="flex-1">
                  <div className="font-medium text-foreground">Tablet</div>
                  <div className="text-sm text-muted-foreground">768px - 1023px</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Tablets and medium-sized devices
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-10 h-10 bg-primary/10 text-primary rounded text-xl">
                  💻
                </div>
                <div className="flex-1">
                  <div className="font-medium text-foreground">Desktop</div>
                  <div className="text-sm text-muted-foreground">1024px and above</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Laptops, desktops, and large screens
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Features */}
          <section>
            <h3 className="text-lg font-semibold text-foreground mb-3">Responsive Features</h3>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-foreground mb-2">Viewport Preview</h4>
                <p className="text-sm text-muted-foreground">
                  Switch between device views in the toolbar to see how your content looks at different
                  screen sizes. The preview frame scales to match the selected device width.
                </p>
              </div>
              <div>
                <h4 className="font-medium text-foreground mb-2">Spacing Controls</h4>
                <p className="text-sm text-muted-foreground">
                  Adjust padding and margin for each breakpoint in the Responsive Settings panel.
                  Configure top, bottom, left, and right spacing independently.
                </p>
              </div>
              <div>
                <h4 className="font-medium text-foreground mb-2">Visibility Toggles</h4>
                <p className="text-sm text-muted-foreground">
                  Hide or show blocks on specific devices. For example, hide a large hero image on
                  mobile to improve page speed.
                </p>
              </div>
              <div>
                <h4 className="font-medium text-foreground mb-2">Typography Scaling</h4>
                <p className="text-sm text-muted-foreground">
                  Override font sizes per breakpoint for text, heading, and quote blocks to ensure
                  optimal readability on all devices.
                </p>
              </div>
              <div>
                <h4 className="font-medium text-foreground mb-2">Column Stacking</h4>
                <p className="text-sm text-muted-foreground">
                  Configure how columns behave on different devices. Enable "Stack on Mobile" to
                  display columns vertically on phones for better mobile experience.
                </p>
              </div>
            </div>
          </section>

          {/* How to Use */}
          <section>
            <h3 className="text-lg font-semibold text-foreground mb-3">How to Use</h3>
            <ol className="space-y-3 text-sm text-muted-foreground list-decimal list-inside">
              <li>
                Select a block in the editor to open the settings panel on the right
              </li>
              <li>
                Scroll to the "Responsive Settings" section at the bottom of the panel
              </li>
              <li>
                Click on the breakpoint tabs (Mobile, Tablet, Desktop) to switch between devices
              </li>
              <li>
                Configure settings like padding, margin, visibility, or font size for that breakpoint
              </li>
              <li>
                Use the viewport selector in the toolbar to preview your changes
              </li>
              <li>
                Blocks with responsive settings will show a blue "Responsive" badge
              </li>
            </ol>
          </section>

          {/* Tips */}
          <section className="bg-primary/5 border border-primary/20 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-foreground mb-3">💡 Pro Tips</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <strong className="text-foreground">Start with mobile:</strong> Design for mobile
                first, then enhance for larger screens.
              </li>
              <li>
                <strong className="text-foreground">Test thoroughly:</strong> Preview your content
                at all breakpoints to ensure it looks good everywhere.
              </li>
              <li>
                <strong className="text-foreground">Use column stacking:</strong> Enable "Stack on
                Mobile" for columns to create mobile-friendly layouts automatically.
              </li>
              <li>
                <strong className="text-foreground">Optimize spacing:</strong> Reduce padding on
                mobile to fit more content on smaller screens.
              </li>
              <li>
                <strong className="text-foreground">Hide when necessary:</strong> Hide decorative or
                non-essential blocks on mobile to improve performance.
              </li>
            </ul>
          </section>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-background border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors"
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}

export function ResponsiveHelpButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
        title="Responsive Design Help"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>
      <ResponsiveHelpModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
