// @ts-nocheck
// TODO(designer): clean up types — ported from CRA, see .planning/product-designer-integration.md
'use client';

import React, { useContext, memo, useMemo, useState, useCallback } from "react";
import EditorContext from "./EditorContext";
import { ResizableStylePreview } from "./ResizableStylePreview";
import { getPresetScales } from "./utils/layerTransforms";

interface MultiStylePreviewProps {
  styles?: any[];
  layers?: any[];
  scale?: number;
  previewDimensions?: { width: number; height: number };
  layout?: 'grid' | 'list' | 'comparison';
  showControls?: boolean;
  showResizeHandles?: boolean;
  maxPreviews?: number;
  className?: string;
}

export const MultiStylePreview = memo(function MultiStylePreview({
  styles,
  layers,
  scale = 0.5,
  previewDimensions = { width: 250, height: 320 },
  layout = 'grid',
  showControls = false,
  showResizeHandles = false,
  maxPreviews = 12,
  className = ""
}: MultiStylePreviewProps) {
  const { product, layers: contextLayers } = useContext(EditorContext);
  const [currentScale, setCurrentScale] = useState(scale);
  const [currentDimensions, setCurrentDimensions] = useState(previewDimensions);
  
  const stylesToUse = styles || product?.styles || [];
  const layersToUse = layers || contextLayers;
  
  const limitedStyles = useMemo(() => 
    stylesToUse.slice(0, maxPreviews),
    [stylesToUse, maxPreviews]
  );

  const presetScales = getPresetScales();

  const handleScaleChange = useCallback((newScale: number) => {
    setCurrentScale(newScale);
  }, []);

  const handleDimensionChange = useCallback((newDimensions: { width: number; height: number }) => {
    setCurrentDimensions(newDimensions);
  }, []);

  const getLayoutClass = () => {
    switch (layout) {
      case 'list':
        return 'flex gap-4 overflow-x-auto pb-4';
      case 'comparison':
        return 'flex flex-wrap gap-4 justify-center';
      case 'grid':
      default:
        return 'preview-grid';
    }
  };

  const exportPreviews = useCallback(() => {
    // Future: Implement export functionality
    console.log('Export previews functionality to be implemented');
  }, []);

  if (limitedStyles.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No styles available for preview
      </div>
    );
  }

  return (
    <div className={`multi-style-preview ${className}`}>
      {/* Controls Header */}
      <div className="mb-4 p-4 bg-gray-50 rounded-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h3 className="font-semibold text-gray-900">
              Design Preview ({limitedStyles.length} styles)
            </h3>
            
            {/* Scale Control */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Scale:</label>
              <select
                value={currentScale}
                onChange={(e) => handleScaleChange(parseFloat(e.target.value))}
                className="text-sm border border-gray-300 rounded px-2 py-1"
              >
                {presetScales.map(preset => (
                  <option key={preset.scale} value={preset.scale}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Dimensions Control */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Size:</label>
              <div className="flex gap-1">
                <input
                  type="number"
                  value={currentDimensions.width}
                  onChange={(e) => handleDimensionChange({
                    ...currentDimensions,
                    width: parseInt(e.target.value) || 250
                  })}
                  className="w-16 text-xs border border-gray-300 rounded px-1 py-1"
                  min="150"
                  max="500"
                />
                <span className="text-xs text-gray-500">×</span>
                <input
                  type="number"
                  value={currentDimensions.height}
                  onChange={(e) => handleDimensionChange({
                    ...currentDimensions,
                    height: parseInt(e.target.value) || 320
                  })}
                  className="w-16 text-xs border border-gray-300 rounded px-1 py-1"
                  min="200"
                  max="600"
                />
              </div>
            </div>
          </div>

          {/* Layout Controls */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Layout:</label>
            <div className="flex border border-gray-300 rounded overflow-hidden">
              {[
                { value: 'grid', label: '⊞', title: 'Grid View' },
                { value: 'list', label: '☰', title: 'List View' },
                { value: 'comparison', label: '⚏', title: 'Comparison View' }
              ].map(({ value, label, title }) => (
                <button
                  key={value}
                  onClick={() => {}} // Layout switching to be implemented
                  className={`px-3 py-1 text-sm ${
                    layout === value 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                  title={title}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Export Button */}
            <button
              onClick={exportPreviews}
              className="px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600 transition-colors"
            >
              Export
            </button>
          </div>
        </div>

        {/* Layer Info */}
        {layersToUse.length > 0 && (
          <div className="mt-2 text-sm text-gray-600">
            Design has {layersToUse.length} layer{layersToUse.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Preview Grid/List */}
      <div className={getLayoutClass()}>
        {limitedStyles.map((style, index) => (
          <div 
            key={style.id} 
            className={`preview-item ${layout === 'list' ? 'flex-shrink-0' : ''}`}
          >
            <ResizableStylePreview
              style={style}
              layers={layersToUse}
              scale={currentScale}
              dimensions={currentDimensions}
              onResize={handleDimensionChange}
              onScaleChange={handleScaleChange}
              showResizeHandles={showResizeHandles && index === 0} // Only first item gets resize handles
              showControls={showControls}
              className="w-full"
              disabled={false}
            />
          </div>
        ))}
      </div>

      {/* Summary Footer */}
      {stylesToUse.length > maxPreviews && (
        <div className="mt-4 p-3 bg-gray-100 rounded text-center text-sm text-gray-600">
          Showing {maxPreviews} of {stylesToUse.length} available styles
          <button 
            className="ml-2 text-blue-600 hover:text-blue-800 underline"
            onClick={() => {}} // Implement show more functionality
          >
            Show All
          </button>
        </div>
      )}
    </div>
  );
});

// Add display name for better debugging
MultiStylePreview.displayName = 'MultiStylePreview';