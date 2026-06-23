'use client';

import { DndContext, pointerWithin, type DragEndEvent, type DragOverEvent, type DragStartEvent } from '@dnd-kit/core';
import { SortableContext, type SortingStrategy } from '@dnd-kit/sortable';
import BrandingProfileSelector from '@/components/portal/BrandingProfileSelector';
import type { Block, BlockType } from '@/types/blocks';
import type { ComponentManifestEntry } from '@/types/visual-editor';
import { LayerItem } from './LayersPanel';

type BlockTypeMeta = { type: BlockType | string; label: string; icon: string; category: string; description: string };

/**
 * Left side panel — collapsible chrome that hosts the layers tree and the
 * add-block picker.
 *
 * The panel is purely a renderer; selection state, drag-drop sensors, the
 * branding profile selection, and the picker click/drag handlers are owned
 * by the parent shell. Empty-state messaging routes back into the picker
 * via `setLeftTab` so the user has a one-click path to their first block.
 */
export function LeftPanel({
  leftCollapsed,
  setLeftCollapsed,
  leftTab,
  setLeftTab,
  brandingProfileId,
  onBrandingProfileChange,
  pickerSearch,
  setPickerSearch,
  pickerCategory,
  setPickerCategory,
  categories,
  allBlockTypes,
  customComponents,
  blocks,
  onAddBlock,
  onBlocksChange,
  iframeOriginatedRef,
  setExternalDragType,
  sendExternalDragStart,
  sendExternalDragCancel,
  setTemplateLibraryOpen,
  selectedBlockId,
  selectedBlockIds,
  selectBlock,
  onDeleteBlock,
  handleUpdateBlock,
  setSelectedBlockIds,
  setInternalSelectedBlockId,
  setContextMenu,
  draggedBlockId,
  layerOverId,
  sensors,
  allBlockIds,
  noMovementStrategy,
  handleDragStart,
  handleLayerDragOver,
  handleDragEnd,
}: {
  leftCollapsed: boolean;
  setLeftCollapsed: (v: boolean | ((prev: boolean) => boolean)) => void;
  leftTab: 'layers' | 'add';
  setLeftTab: (v: 'layers' | 'add') => void;
  brandingProfileId?: number | null;
  onBrandingProfileChange?: (profileId: number | null) => void;
  pickerSearch: string;
  setPickerSearch: (v: string) => void;
  pickerCategory: string | null;
  setPickerCategory: (v: string | null | ((prev: string | null) => string | null)) => void;
  categories: string[];
  allBlockTypes: BlockTypeMeta[];
  customComponents: ComponentManifestEntry[];
  blocks: Block[];
  onAddBlock: (type: string, afterBlockId?: string) => void;
  onBlocksChange: (blocks: Block[]) => void;
  iframeOriginatedRef: React.MutableRefObject<boolean>;
  setExternalDragType: (v: string | null) => void;
  sendExternalDragStart: (type: string) => void;
  sendExternalDragCancel: () => void;
  setTemplateLibraryOpen: (v: boolean) => void;
  selectedBlockId: string | null;
  selectedBlockIds: string[];
  selectBlock: (id: string, modifiers?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) => void;
  onDeleteBlock: (id: string) => void;
  handleUpdateBlock: (id: string, updates: Partial<Block>) => void;
  setSelectedBlockIds: React.Dispatch<React.SetStateAction<string[]>>;
  setInternalSelectedBlockId: (id: string | null) => void;
  setContextMenu: (v: { x: number; y: number } | null) => void;
  draggedBlockId: string | null;
  layerOverId: string | null;
  sensors: ReturnType<typeof import('@dnd-kit/core').useSensors>;
  allBlockIds: string[];
  noMovementStrategy: SortingStrategy;
  handleDragStart: (event: DragStartEvent) => void;
  handleLayerDragOver: (event: DragOverEvent) => void;
  handleDragEnd: (event: DragEndEvent) => void;
}) {
  const filteredBlockTypes = allBlockTypes
    .filter((b) => !pickerCategory || b.category === pickerCategory)
    .filter((b) => !pickerSearch || b.label.toLowerCase().includes(pickerSearch.toLowerCase()) || b.type.toLowerCase().includes(pickerSearch.toLowerCase()) || b.description.toLowerCase().includes(pickerSearch.toLowerCase()));

  return (
    <div className={`flex-shrink-0 transition-all duration-200 ${
      leftCollapsed
        ? 'w-0 relative'
        // Below md the expanded panel is a fixed overlay (doesn't squeeze the
        // iframe to negative width on phones); at md+ it stays inline as before.
        : 'fixed inset-y-0 left-0 z-30 w-60 md:relative md:inset-y-auto'
    }`}>
      {/* Collapse/expand toggle – vertically centered on panel edge */}
      <button
        onClick={() => setLeftCollapsed((v) => !v)}
        className="absolute top-1/2 -translate-y-1/2 -right-3.5 z-30 w-7 h-10 flex items-center justify-center rounded-r-md bg-muted border border-l-0 border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shadow-sm"
        title={leftCollapsed ? 'Expand panel' : 'Collapse panel'}
      >
        <span className="material-icons text-sm">{leftCollapsed ? 'chevron_right' : 'chevron_left'}</span>
      </button>
      <div className="h-full border-r border-border bg-muted flex flex-col overflow-hidden">
        {!leftCollapsed && (
          <>
            {/* Tab bar */}
            <div className="flex border-b border-border shrink-0">
              <button
                type="button"
                onClick={() => setLeftTab('layers')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                  leftTab === 'layers' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="material-icons text-sm">layers</span>
                Layers
              </button>
              <button
                type="button"
                onClick={() => setLeftTab('add')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                  leftTab === 'add' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="material-icons text-sm">add_circle_outline</span>
                Add Block
              </button>
            </div>

            {/* Branding profile selector */}
            {onBrandingProfileChange && (
              <div className="px-3 py-2 border-b border-border shrink-0">
                <BrandingProfileSelector
                  value={brandingProfileId ?? null}
                  onChange={onBrandingProfileChange}
                  label="Brand Profile"
                />
              </div>
            )}

            {/* Add Block tab */}
            {leftTab === 'add' && (
              <div className="flex flex-col flex-1 min-h-0">
                <div className="px-3 pt-3 pb-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setTemplateLibraryOpen(true)}
                    className="w-full flex items-center justify-center gap-1.5 rounded border border-border bg-primary/5 hover:bg-primary/10 text-primary px-2 py-2 mb-2 text-xs font-medium transition-colors"
                    title="Insert a saved template"
                  >
                    <span className="material-icons text-sm">bookmark</span>
                    Browse Templates
                  </button>
                  <div className="flex items-center gap-1.5 rounded border border-border bg-background px-2 py-1.5 mb-2">
                    <span className="material-icons text-sm text-muted-foreground">search</span>
                    <input
                      type="text"
                      value={pickerSearch}
                      onChange={(e) => setPickerSearch(e.target.value)}
                      placeholder="Search blocks..."
                      className="flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
                    />
                    {pickerSearch && (
                      <button type="button" onClick={() => setPickerSearch('')} className="text-muted-foreground hover:text-foreground">
                        <span className="material-icons text-sm">close</span>
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {categories.map((cat) => (
                      <button type="button" key={cat} onClick={() => setPickerCategory(pickerCategory === cat ? null : cat)}
                        className={`px-2 py-0.5 text-xs rounded ${pickerCategory === cat ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground hover:bg-accent'}`}
                      >{cat}</button>
                    ))}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-3 pb-3">
                  <div className="grid grid-cols-2 gap-1">
                    {filteredBlockTypes.map((bt) => (
                      <button type="button" key={bt.type}
                        onClick={() => {
                          // For custom components, create block with defaultProps from manifest
                          const manifest = customComponents.find((c) => c.type === bt.type);
                          if (manifest?.defaultProps) {
                            const newBlock = {
                              id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                              type: bt.type,
                              order: blocks.length,
                              ...manifest.defaultProps,
                            } as Block;
                            iframeOriginatedRef.current = true;
                            onBlocksChange([...blocks, newBlock]);
                          } else {
                            onAddBlock(bt.type);
                          }
                          setLeftTab('layers');
                          setPickerSearch('');
                        }}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', bt.type);
                          e.dataTransfer.effectAllowed = 'copy';
                          setExternalDragType(bt.type);
                          sendExternalDragStart(bt.type);
                        }}
                        onDragEnd={() => {
                          setExternalDragType(null);
                          sendExternalDragCancel();
                        }}
                        className="flex flex-col items-center gap-0.5 rounded border border-border bg-card p-1.5 text-center hover:border-primary/30 hover:bg-primary/5 cursor-grab active:cursor-grabbing"
                      >
                        <span className="material-icons text-base text-muted-foreground">{bt.icon}</span>
                        <span className="text-[10px] text-foreground leading-tight">{bt.label}</span>
                      </button>
                    ))}
                  </div>
                  {filteredBlockTypes.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">No blocks found</p>
                  )}
                </div>
              </div>
            )}

            {/* Layers tab */}
            {leftTab === 'layers' && (
              <div className="flex-1 overflow-y-auto">
                <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragOver={handleLayerDragOver} onDragEnd={handleDragEnd}>
                  <SortableContext items={allBlockIds} strategy={noMovementStrategy}>
                    <div className="px-1 py-2">
                      {blocks.map((block, i) => (
                        <LayerItem
                          key={block.id ?? `layer-${i}-${block.type}`}
                          block={block}
                          depth={0}
                          selectedBlockId={selectedBlockId}
                          selectedBlockIds={selectedBlockIds}
                          onSelect={selectBlock}
                          onDelete={onDeleteBlock}
                          onUpdate={handleUpdateBlock}
                          onContextMenu={(id, x, y) => {
                            setSelectedBlockIds((prev) => prev.includes(id) ? prev : [id]);
                            setInternalSelectedBlockId(id);
                            setContextMenu({ x, y });
                          }}
                          showDropIndicator={!!draggedBlockId && layerOverId === block.id && draggedBlockId !== block.id}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
                {blocks.length === 0 && (
                  <div className="px-3 py-8 text-center">
                    <span className="material-icons text-2xl text-muted-foreground/50 mb-2 block">layers_clear</span>
                    <p className="text-xs text-muted-foreground">No blocks yet</p>
                    <button type="button" onClick={() => setLeftTab('add')} className="text-xs text-primary hover:text-primary/80 mt-1">
                      Add your first block
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
