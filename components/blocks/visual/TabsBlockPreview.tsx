'use client';

import { TabsBlock, Block, BlockType } from '@/types/blocks';
import { useState } from 'react';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { getElementCSS } from '@/lib/utils/elementStyles';
import { VisualBlockPreview } from './VisualBlockPreview';
import { NestedBlockInserter } from './NestedBlockInserter';
import { createDefaultBlock } from '@/lib/blocks/defaults';

interface TabsBlockPreviewProps {
  block: TabsBlock;
  isSelected: boolean;
  onChange: (updates: Partial<TabsBlock>) => void;
  selectedBlockId?: string | null;
  onSelectBlock?: (id: string | null) => void;
}

export function TabsBlockPreview({ block, isSelected, onChange, selectedBlockId, onSelectBlock }: TabsBlockPreviewProps) {
  const [activeTabId, setActiveTabId] = useState(block.tabs[0]?.id);
  const [showBlockInserter, setShowBlockInserter] = useState(false);


  const addTab = () => {
    const newTab = {
      id: `tab-${Date.now()}`,
      label: 'New Tab',
      blocks: [],
    };
    onChange({
      tabs: [...block.tabs, newTab],
    });
    setActiveTabId(newTab.id);
  };

  const updateTab = (id: string, updates: Partial<typeof block.tabs[0]>) => {
    onChange({
      tabs: block.tabs.map(tab => (tab.id === id ? { ...tab, ...updates } : tab)),
    });
  };

  const removeTab = (id: string) => {
    const newTabs = block.tabs.filter(tab => tab.id !== id);
    onChange({ tabs: newTabs });
    if (activeTabId === id && newTabs.length > 0) {
      setActiveTabId(newTabs[0].id);
    }
  };

  const addBlockToTab = (tabId: string, blockType: BlockType) => {
    const newBlock = createDefaultBlock(blockType);

    onChange({
      tabs: block.tabs.map(tab =>
        tab.id === tabId
          ? { ...tab, blocks: [...tab.blocks, newBlock] }
          : tab
      ),
    });

    setShowBlockInserter(false);
  };

  const updateTabBlock = (tabId: string, blockId: string, updates: Partial<Block>) => {
    onChange({
      tabs: block.tabs.map(tab =>
        tab.id === tabId
          ? {
              ...tab,
              blocks: tab.blocks.map(b => (b.id === blockId ? { ...b, ...updates } as Block : b)),
            }
          : tab
      ),
    });
  };

  const deleteTabBlock = (tabId: string, blockId: string) => {
    onChange({
      tabs: block.tabs.map(tab =>
        tab.id === tabId
          ? { ...tab, blocks: tab.blocks.filter(b => b.id !== blockId) }
          : tab
      ),
    });
  };

  const activeTab = block.tabs.find(tab => tab.id === activeTabId);

  const responsiveClasses = block.responsive
    ? combineResponsiveClasses(
        block.responsive.paddingTop,
        block.responsive.paddingBottom,
        block.responsive.paddingLeft,
        block.responsive.paddingRight,
        block.responsive.marginTop,
        block.responsive.marginBottom,
        block.responsive.marginLeft,
        block.responsive.marginRight,
        block.responsive.visibility
      )
    : '';

  return (
    <div className={`py-8 my-8 px-6 ${responsiveClasses}`}>
      <div className="border border-border rounded-lg overflow-hidden">
        {/* Tab Headers */}
        <div className="flex border-b border-border bg-muted/30">
          {block.tabs.map((tab) => {
            const isActive = activeTabId === tab.id;
            const baseStyle = getElementCSS(block.elementStyles, 'tab');
            const activeStyle = isActive ? getElementCSS(block.elementStyles, 'activeTab') : undefined;
            return (
            <div key={tab.id} className="relative group">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTabId(tab.id);
                }}
                className={`px-4 py-3 font-medium transition-colors border-b-2 ${
                  isActive
                    ? 'border-primary text-primary bg-background'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
                style={{ ...baseStyle, ...activeStyle }}
              >
                <input
                  type="text"
                  value={tab.label}
                  onChange={(e) => {
                    e.stopPropagation();
                    updateTab(tab.id, { label: e.target.value });
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-transparent border-none focus:outline-none focus:border-b border-primary min-w-[80px]"
                  placeholder="Tab Label"
                />
              </button>

              {isSelected && block.tabs.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTab(tab.id);
                  }}
                  className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove tab"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            );
          })}

          {isSelected && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                addTab();
              }}
              className="px-4 py-3 text-muted-foreground hover:text-foreground transition-colors"
              title="Add tab"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}
        </div>

        {/* Tab Content */}
        <div
          className="p-6 bg-card min-h-[200px]"
          style={getElementCSS(block.elementStyles, 'tabPanel')}
        >
          {activeTab && activeTab.blocks.length > 0 ? (
            <div className={isSelected ? "space-y-2" : "space-y-0"}>
              {activeTab.blocks.map((tabBlock) => {
                const isNestedBlockSelected = selectedBlockId === tabBlock.id;
                return (
                  <div key={tabBlock.id} className="relative group/block">
                    <div
                      className={`${isSelected ? "rounded border bg-card overflow-hidden" : "overflow-hidden"} ${
                        isNestedBlockSelected ? 'border-primary ring-2 ring-primary ring-offset-1 ring-offset-background' : 'border-border'
                      } cursor-pointer transition-all`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onSelectBlock) {
                          onSelectBlock(tabBlock.id);
                        }
                      }}
                    >
                      <VisualBlockPreview
                        block={tabBlock}
                        isSelected={isNestedBlockSelected}
                        onChange={(updates) => updateTabBlock(activeTab.id, tabBlock.id, updates)}
                        selectedBlockId={selectedBlockId}
                        onSelectBlock={onSelectBlock}
                      />
                    </div>

                    {isSelected && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteTabBlock(activeTab.id, tabBlock.id);
                        }}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded opacity-0 group-hover/block:opacity-100 transition-opacity z-10"
                        title="Delete block"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            isSelected && (
              <div className="text-center text-muted-foreground py-8">
                <p className="mb-2">This tab is empty</p>
                <p className="text-sm">Click the button below to add blocks</p>
              </div>
            )
          )}

          {/* Add Block to Tab Button */}
          {isSelected && activeTab && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowBlockInserter(true);
              }}
              className="w-full mt-4 p-2 border border-dashed border-border rounded hover:border-primary hover:bg-primary/5 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              + Add Block
            </button>
          )}
        </div>
      </div>

      {/* Block Inserter Modal — sources full 47-block roster from registry */}
      {showBlockInserter && activeTab && (
        <NestedBlockInserter
          title="Add Block to Tab"
          onPick={(type) => addBlockToTab(activeTab.id, type)}
          onClose={() => setShowBlockInserter(false)}
          compact
        />
      )}
    </div>
  );
}

