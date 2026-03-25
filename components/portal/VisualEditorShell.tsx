'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useVisualEditorParent } from '@/lib/visual-editor/useVisualEditorParent';
import { DynamicPropertyPanel } from './DynamicPropertyPanel';
import type { Block, BlockType } from '@/types/blocks';
import type { ComponentManifestEntry } from '@/types/visual-editor';

// Built-in block types for the picker
const BUILT_IN_BLOCK_TYPES: Array<{ type: BlockType; label: string; icon: string; category: string; description: string }> = [
  { type: 'heading', label: 'Heading', icon: 'title', category: 'Basic', description: 'Add a title or heading' },
  { type: 'text', label: 'Paragraph', icon: 'notes', category: 'Basic', description: 'Start with plain text' },
  { type: 'button', label: 'Button', icon: 'smart_button', category: 'Basic', description: 'Call-to-action button' },
  { type: 'quote', label: 'Quote', icon: 'format_quote', category: 'Basic', description: 'Add a quotation' },
  { type: 'image', label: 'Image', icon: 'image', category: 'Media', description: 'Insert an image' },
  { type: 'youtube', label: 'YouTube', icon: 'play_circle', category: 'Media', description: 'Embed YouTube video' },
  { type: 'video', label: 'Video', icon: 'videocam', category: 'Media', description: 'Embed a video file' },
  { type: 'gallery', label: 'Gallery', icon: 'photo_library', category: 'Media', description: 'Image gallery' },
  { type: 'code', label: 'Code', icon: 'code', category: 'Media', description: 'Code snippet' },
  { type: 'spacer', label: 'Spacer', icon: 'height', category: 'Layout', description: 'Add vertical space' },
  { type: 'divider', label: 'Divider', icon: 'horizontal_rule', category: 'Layout', description: 'Horizontal line' },
  { type: 'columns', label: 'Columns', icon: 'view_column', category: 'Layout', description: 'Multi-column layout' },
  { type: 'section', label: 'Section', icon: 'crop_free', category: 'Layout', description: 'Container wrapper' },
  { type: 'hero', label: 'Hero', icon: 'view_carousel', category: 'Components', description: 'Hero section with CTA' },
  { type: 'cta', label: 'Call to Action', icon: 'campaign', category: 'Components', description: 'CTA section' },
  { type: 'card-grid', label: 'Card Grid', icon: 'grid_view', category: 'Components', description: 'Grid of cards' },
  { type: 'stats', label: 'Statistics', icon: 'bar_chart', category: 'Components', description: 'Stats display' },
  { type: 'testimonial', label: 'Testimonial', icon: 'rate_review', category: 'Components', description: 'Customer quote' },
];

interface VisualEditorShellProps {
  blocks: Block[];
  selectedBlockId: string | null;
  iframeSrc: string;
  onBlocksChange: (blocks: Block[]) => void;
  onSelectBlock: (blockId: string | null) => void;
  onAddBlock: (type: string, afterBlockId?: string) => void;
  onDeleteBlock: (blockId: string) => void;
  onUpdateBlock: (blockId: string, updates: Partial<Block>) => void;
}

export function VisualEditorShell({
  blocks,
  selectedBlockId: selectedBlockIdProp,
  iframeSrc,
  onBlocksChange,
  onSelectBlock,
  onAddBlock,
  onDeleteBlock,
  onUpdateBlock,
}: VisualEditorShellProps) {
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [internalSelectedBlockId, setInternalSelectedBlockId] = useState<string | null>(null);
  const selectedBlockId = selectedBlockIdProp ?? internalSelectedBlockId;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCategory, setPickerCategory] = useState<string | null>(null);

  const handleBlockClicked = useCallback(
    (blockId: string) => {
      setInternalSelectedBlockId(blockId);
      onSelectBlock(blockId);
    },
    [onSelectBlock],
  );

  const handleBlockHovered = useCallback(() => {}, []);

  const {
    iframeRef,
    iframeReady,
    customComponents,
    sendBlocksUpdate,
    sendSelectBlock,
    handleIframeLoad,
  } = useVisualEditorParent({
    blocks,
    selectedBlockId,
    onBlockClicked: handleBlockClicked,
    onBlockHovered: handleBlockHovered,
  });

  // Sync blocks to iframe when they change
  useEffect(() => {
    sendBlocksUpdate(blocks);
  }, [blocks, sendBlocksUpdate]);

  // Sync selection to iframe
  useEffect(() => {
    sendSelectBlock(selectedBlockId);
  }, [selectedBlockId, sendSelectBlock]);

  // All available block types (built-in + custom)
  const allBlockTypes = useMemo(() => {
    const custom = customComponents.map((c) => ({
      type: c.type as BlockType,
      label: c.label,
      icon: c.icon,
      category: c.category,
      description: c.description,
    }));
    return [...BUILT_IN_BLOCK_TYPES, ...custom];
  }, [customComponents]);

  // Categories for the picker
  const categories = useMemo(() => {
    const cats = new Set(allBlockTypes.map((b) => b.category));
    return Array.from(cats);
  }, [allBlockTypes]);

  // Selected block data
  const selectedBlock = selectedBlockId ? blocks.find((b) => b.id === selectedBlockId) : null;

  // Find custom component manifest for selected block (if custom)
  const selectedCustomManifest = selectedBlock
    ? customComponents.find((c) => c.type === selectedBlock.type)
    : null;

  // Viewport widths
  const viewportWidth = { desktop: '100%', tablet: '768px', mobile: '375px' }[viewport];

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Left Panel — Block Picker */}
      <div className="w-64 flex-shrink-0 border-r border-gray-200 bg-gray-50 overflow-y-auto">
        <div className="p-3">
          <button
            type="button"
            onClick={() => setPickerOpen(!pickerOpen)}
            className="w-full flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <span className="material-icons text-base">add</span>
            Add Block
          </button>
        </div>

        {pickerOpen && (
          <div className="px-3 pb-3">
            {/* Category tabs */}
            <div className="flex flex-wrap gap-1 mb-3">
              {categories.map((cat) => (
                <button
                  type="button"
                  key={cat}
                  onClick={() => setPickerCategory(pickerCategory === cat ? null : cat)}
                  className={`px-2 py-1 text-xs rounded ${
                    pickerCategory === cat
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Block type grid */}
            <div className="grid grid-cols-2 gap-1.5">
              {allBlockTypes
                .filter((b) => !pickerCategory || b.category === pickerCategory)
                .map((blockType) => (
                  <button
                    type="button"
                    key={blockType.type}
                    onClick={() => {
                      onAddBlock(blockType.type);
                      setPickerOpen(false);
                    }}
                    className="flex flex-col items-center gap-1 rounded-md border border-gray-200 bg-white p-2 text-center hover:border-blue-300 hover:bg-blue-50"
                  >
                    <span className="material-icons text-lg text-gray-600">{blockType.icon}</span>
                    <span className="text-xs text-gray-700">{blockType.label}</span>
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* Layers panel — block list */}
        <div className="border-t border-gray-200 p-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Layers</h3>
          <div className="space-y-0.5">
            {blocks.map((block) => (
              <button
                type="button"
                key={block.id}
                onClick={() => { setInternalSelectedBlockId(block.id); onSelectBlock(block.id); }}
                className={`w-full flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
                  selectedBlockId === block.id
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span className="text-xs text-gray-400 font-mono">{block.type}</span>
                <span className="truncate">
                  {'content' in block && typeof block.content === 'string'
                    ? block.content.substring(0, 30)
                    : 'title' in block && typeof block.title === 'string'
                      ? block.title.substring(0, 30)
                      : block.type}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Center — iframe */}
      <div className="flex-1 flex flex-col bg-gray-100">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
          <div className="flex items-center gap-2">
            {(['desktop', 'tablet', 'mobile'] as const).map((vp) => (
              <button
                type="button"
                key={vp}
                onClick={() => setViewport(vp)}
                className={`rounded p-1.5 ${
                  viewport === vp ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                <span className="material-icons text-lg">
                  {vp === 'desktop' ? 'computer' : vp === 'tablet' ? 'tablet' : 'phone_iphone'}
                </span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-400">
            {iframeReady ? (
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                Connected
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
                Connecting...
              </span>
            )}
          </div>
        </div>

        {/* iframe container */}
        <div className="flex-1 flex items-start justify-center overflow-auto p-4">
          <div
            className="bg-white shadow-lg rounded-lg overflow-hidden transition-all"
            style={{ width: viewportWidth, maxWidth: '100%', height: '100%' }}
          >
            <iframe
              ref={iframeRef}
              src={iframeSrc}
              onLoad={handleIframeLoad}
              className="w-full h-full border-0"
              title="Visual Editor"
            />
          </div>
        </div>
      </div>

      {/* Right Panel — Property Editor */}
      <div className="w-72 flex-shrink-0 border-l border-gray-200 bg-white overflow-y-auto">
        {selectedBlock ? (
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">
                {selectedBlock.type.charAt(0).toUpperCase() + selectedBlock.type.slice(1)} Settings
              </h3>
              <button
                type="button"
                onClick={() => onDeleteBlock(selectedBlock.id)}
                className="text-xs text-red-500 hover:text-red-700"
              >
                <span className="material-icons text-base">delete</span>
              </button>
            </div>

            {selectedCustomManifest ? (
              // Custom component — use DynamicPropertyPanel
              <DynamicPropertyPanel
                inputs={selectedCustomManifest.inputs}
                values={selectedBlock as unknown as Record<string, unknown>}
                onChange={(name, value) =>
                  onUpdateBlock(selectedBlock.id, { [name]: value } as Partial<Block>)
                }
              />
            ) : (
              // Built-in block — render common properties
              <BuiltInBlockProperties
                block={selectedBlock}
                onUpdate={(updates) => onUpdateBlock(selectedBlock.id, updates)}
              />
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 text-gray-400">
            <span className="material-icons text-3xl mb-2">touch_app</span>
            <p className="text-sm">Click a block in the preview to edit its properties</p>
          </div>
        )}
      </div>
    </div>
  );
}

function BuiltInBlockProperties({
  block,
  onUpdate,
}: {
  block: Block;
  onUpdate: (updates: Partial<Block>) => void;
}) {
  // Common editable fields based on block type
  const fields: Array<{ name: string; label: string; type: 'text' | 'textarea' | 'select'; options?: string[] }> = [];

  if ('content' in block) fields.push({ name: 'content', label: 'Content', type: block.type === 'text' ? 'textarea' : 'text' });
  if ('title' in block) fields.push({ name: 'title', label: 'Title', type: 'text' });
  if ('subtitle' in block) fields.push({ name: 'subtitle', label: 'Subtitle', type: 'text' });
  if ('description' in block) fields.push({ name: 'description', label: 'Description', type: 'textarea' });
  if ('url' in block) fields.push({ name: 'url', label: 'URL', type: 'text' });
  if ('alt' in block) fields.push({ name: 'alt', label: 'Alt Text', type: 'text' });
  if ('text' in block && block.type === 'button') fields.push({ name: 'text', label: 'Button Text', type: 'text' });
  if ('level' in block) fields.push({ name: 'level', label: 'Level', type: 'select', options: ['1', '2', '3', '4', '5', '6'] });
  if ('alignment' in block) fields.push({ name: 'alignment', label: 'Alignment', type: 'select', options: ['left', 'center', 'right'] });

  return (
    <div className="space-y-4">
      {fields.map((field) => (
        <label key={field.name} className="block">
          <span className="text-sm font-medium text-gray-700">{field.label}</span>
          {field.type === 'textarea' ? (
            <textarea
              value={((block as unknown as Record<string, unknown>)[field.name] as string) || ''}
              onChange={(e) => onUpdate({ [field.name]: e.target.value } as Partial<Block>)}
              rows={3}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          ) : field.type === 'select' ? (
            <select
              value={String((block as unknown as Record<string, unknown>)[field.name] || '')}
              onChange={(e) => {
                const val = field.name === 'level' ? Number(e.target.value) : e.target.value;
                onUpdate({ [field.name]: val } as Partial<Block>);
              }}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              {field.options?.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={((block as unknown as Record<string, unknown>)[field.name] as string) || ''}
              onChange={(e) => onUpdate({ [field.name]: e.target.value } as Partial<Block>)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          )}
        </label>
      ))}
    </div>
  );
}
