'use client';

import { useEffect, useState, useCallback, Suspense, useMemo } from 'react';
import { Block, BlockType } from '@/types/blocks';
import { Breakpoint } from '@/types/responsive';
import { BlockSettings } from '@/components/blocks/visual/BlockSettings';
import { useSettingsPanelSync, type SettingsPanelMessage } from '@/lib/hooks/useSettingsPanelSync';
import { useSearchParams } from 'next/navigation';
import { findBlockById, updateBlockById } from '@/lib/utils/blockHelpers';

// Block type labels (matches the ones in VisualBlockEditorEnhanced)
const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  text: 'Text',
  heading: 'Heading',
  image: 'Image',
  video: 'Video',
  quote: 'Quote',
  code: 'Code',
  button: 'Button',
  spacer: 'Spacer',
  divider: 'Divider',
  columns: 'Columns',
  tabs: 'Tabs',
  accordion: 'Accordion',
  hero: 'Hero',
  'hero-slideshow': 'Hero Slideshow',
  marquee: 'Marquee',
  'services-grid': 'Services Grid',
  cta: 'Call to Action',
  testimonial: 'Testimonial',
  stats: 'Stats',
  'blog-posts': 'Blog Posts',
  'featured-content': 'Featured Content',
  youtube: 'YouTube',
  'card-grid': 'Card Grid',
  gallery: 'Gallery',
  section: 'Section',
  'palizzi-nav': 'Palizzi Nav',
  'palizzi-hero': 'Palizzi Hero',
  'palizzi-welcome': 'Palizzi Welcome',
  'palizzi-history': 'Palizzi History',
  'palizzi-menu': 'Palizzi Menu',
  'palizzi-rules': 'Palizzi Rules',
  'palizzi-membership': 'Palizzi Membership',
  'palizzi-footer': 'Palizzi Footer',
  'product-grid': 'Product Grid',
  'featured-products': 'Featured Products',
  'product-categories': 'Product Categories',
  'shopping-cart': 'Shopping Cart',
  'store-banner': 'Store Banner',
  'product-detail': 'Product Detail',
  booking: 'Booking',
  'booking-menu': 'Booking Menu',
  survey: 'Survey',
  'survey-results': 'Survey Results',
  'social-links': 'Social Links',
  'email-header': 'Email Header',
  'email-footer': 'Email Footer',
  timeline: 'Timeline',
  'team-showcase': 'Team Showcase',
  'bento-grid': 'Bento Grid',
  'site-footer': 'Site Footer',
  'deck-next-slide': 'Next Slide',
  'deck-jump-to': 'Jump To Slide',
  'survey-input': 'Survey Input',
};

function SettingsPopupContent() {
  const searchParams = useSearchParams();
  const tabId = searchParams.get('tabId') || '';

  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [allBlocks, setAllBlocks] = useState<Block[]>([]);
  const [currentViewport, setCurrentViewport] = useState<Breakpoint>('desktop');
  const [isInitialized, setIsInitialized] = useState(false);

  // Derive selectedBlock from allBlocks and selectedBlockId (recursively search for nested blocks)
  const selectedBlock = useMemo(() => {
    return selectedBlockId ? findBlockById(allBlocks, selectedBlockId) : null;
  }, [selectedBlockId, allBlocks]);

  // Handle messages from the main window
  const handleBroadcastMessage = useCallback((message: SettingsPanelMessage) => {
    switch (message.type) {
      case 'SELECTION_CHANGED':
        setSelectedBlockId(message.payload.selectedBlockId || null);
        break;

      case 'BLOCKS_CHANGED':
        setAllBlocks(message.payload.blocks || []);
        break;

      case 'VIEWPORT_CHANGED':
        setCurrentViewport(message.payload.viewport);
        break;

      case 'BLOCK_DELETED':
        if (selectedBlockId === message.payload.blockId) {
          setSelectedBlockId(null);
        }
        break;

      case 'WINDOW_CLOSING':
        window.close();
        break;

      default:
        break;
    }
  }, [selectedBlockId]);

  // BroadcastChannel sync
  const { sendMessage, isConnected } = useSettingsPanelSync({
    isMainWindow: false,
    onMessage: handleBroadcastMessage,
    tabId,
  });

  // Signal ready and receive initial state from window.opener
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Verify origin for security
      if (event.origin !== window.location.origin) return;

      if (event.data.type === 'INITIAL_STATE' && event.data.tabId === tabId) {
        setSelectedBlockId(event.data.selectedBlockId || null);
        setAllBlocks(event.data.blocks || []);
        setCurrentViewport(event.data.currentViewport || 'desktop');
        setIsInitialized(true);
      }
    };

    window.addEventListener('message', handleMessage);

    // Signal to opener that we're ready
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(
        {
          type: 'POPUP_READY',
          tabId,
        },
        window.location.origin
      );
    }

    return () => window.removeEventListener('message', handleMessage);
  }, [tabId]);

  // Handle block updates
  const handleBlockChange = useCallback(
    (updates: Partial<Block>) => {
      if (!selectedBlockId) return;

      // Update local state optimistically (handles nested blocks)
      setAllBlocks((prev) => updateBlockById(prev, selectedBlockId, updates));

      // Send update to main window via BroadcastChannel
      sendMessage('BLOCK_UPDATED', {
        id: selectedBlockId,
        updates,
      });
    },
    [selectedBlockId, sendMessage]
  );

  // Handle dock button click
  const handleDock = useCallback(() => {
    sendMessage('DOCK_REQUESTED', null);
    window.close();
  }, [sendMessage]);

  // Check if selected block still exists in allBlocks (including nested blocks)
  useEffect(() => {
    if (selectedBlockId && allBlocks.length > 0) {
      const blockExists = findBlockById(allBlocks, selectedBlockId);
      if (!blockExists) {
        setSelectedBlockId(null);
      }
    }
  }, [allBlocks, selectedBlockId]);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-border px-4 py-3 shadow-sm z-10">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Block Settings</h1>
          <div className="flex items-center gap-3">
            {!isConnected && (
              <span className="text-xs text-yellow-600 dark:text-yellow-400">
                Connecting...
              </span>
            )}
            <button
              type="button"
              onClick={handleDock}
              className="flex items-center gap-2 px-3 py-1.5 text-sm rounded border border-border hover:bg-accent"
              title="Dock settings back to main window"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                />
              </svg>
              Dock
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {!isInitialized ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-solid border-primary border-r-transparent mb-4"></div>
              <p className="text-muted-foreground">Loading settings...</p>
            </div>
          </div>
        ) : selectedBlock ? (
          <div>
            <div className="mb-4 pb-4 border-b border-border">
              <h2 className="text-lg font-semibold">
                {BLOCK_TYPE_LABELS[selectedBlock.type] || selectedBlock.type} Settings
              </h2>
            </div>
            <BlockSettings block={selectedBlock} onChange={handleBlockChange} currentViewport={currentViewport} />
          </div>
        ) : (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="mb-4">
                <svg
                  className="w-16 h-16 mx-auto text-muted-foreground/30"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">No Block Selected</h3>
              <p className="text-muted-foreground">
                Select a block in the main editor to view its settings here.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SettingsPopupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-solid border-primary border-r-transparent mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    }>
      <SettingsPopupContent />
    </Suspense>
  );
}
