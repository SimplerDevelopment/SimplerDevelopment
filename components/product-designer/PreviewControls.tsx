'use client';

import React, { memo } from "react";
import { getPresetScales } from "./utils/layerTransforms";

interface PreviewControlsProps {
  scale: number;
  onScaleChange: (scale: number) => void;
  dimensions: { width: number; height: number };
  onDimensionsChange: (dimensions: { width: number; height: number }) => void;
  layout?: 'grid' | 'list' | 'comparison';
  onLayoutChange?: (layout: 'grid' | 'list' | 'comparison') => void;
  showLayoutControls?: boolean;
  showDimensionControls?: boolean;
  showScaleControls?: boolean;
  className?: string;
}

export const PreviewControls = memo(function PreviewControls({
  scale,
  onScaleChange,
  dimensions,
  onDimensionsChange,
  layout = 'grid',
  onLayoutChange,
  showLayoutControls = true,
  showDimensionControls = true,
  showScaleControls = true,
  className = ""
}: PreviewControlsProps) {
  const presetScales = getPresetScales();

  const handleQuickSizeChange = (preset: 'small' | 'medium' | 'large') => {
    const sizes = {
      small: { width: 200, height: 250 },
      medium: { width: 300, height: 400 },
      large: { width: 400, height: 500 }
    };
    onDimensionsChange(sizes[preset]);
  };

  return (
    <div className={`preview-controls flex flex-wrap items-center gap-4 p-3 bg-gray-50 rounded-lg ${className}`}>
      {/* Scale Controls */}
      {showScaleControls && (
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Scale:</label>
          <select
            value={scale}
            onChange={(e) => onScaleChange(parseFloat(e.target.value))}
            className="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
          >
            {presetScales.map(preset => (
              <option key={preset.scale} value={preset.scale}>
                {preset.name} ({Math.round(preset.scale * 100)}%)
              </option>
            ))}
          </select>
          
          {/* Scale Slider */}
          <input
            type="range"
            min="0.25"
            max="2"
            step="0.25"
            value={scale}
            onChange={(e) => onScaleChange(parseFloat(e.target.value))}
            className="w-20"
          />
        </div>
      )}

      {/* Dimension Controls */}
      {showDimensionControls && (
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Size:</label>
          
          {/* Quick Size Buttons */}
          <div className="flex gap-1">
            {[
              { key: 'small', label: 'S' },
              { key: 'medium', label: 'M' },
              { key: 'large', label: 'L' }
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => handleQuickSizeChange(key as any)}
                className="px-2 py-1 text-xs border border-gray-300 rounded bg-white hover:bg-gray-50"
              >
                {label}
              </button>
            ))}
          </div>

          {/* Custom Dimensions */}
          <div className="flex gap-1 items-center">
            <input
              type="number"
              value={dimensions.width}
              onChange={(e) => onDimensionsChange({
                ...dimensions,
                width: parseInt(e.target.value) || 200
              })}
              className="w-16 text-xs border border-gray-300 rounded px-1 py-1"
              min="150"
              max="600"
              placeholder="W"
            />
            <span className="text-xs text-gray-500">×</span>
            <input
              type="number"
              value={dimensions.height}
              onChange={(e) => onDimensionsChange({
                ...dimensions,
                height: parseInt(e.target.value) || 250
              })}
              className="w-16 text-xs border border-gray-300 rounded px-1 py-1"
              min="200"
              max="700"
              placeholder="H"
            />
          </div>
        </div>
      )}

      {/* Layout Controls */}
      {showLayoutControls && onLayoutChange && (
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
                onClick={() => onLayoutChange(value as any)}
                className={`px-3 py-1 text-sm transition-colors ${
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
        </div>
      )}

      {/* Current Settings Display */}
      <div className="flex items-center gap-4 ml-auto text-xs text-gray-500">
        <span>Scale: {Math.round(scale * 100)}%</span>
        <span>Size: {dimensions.width}×{dimensions.height}</span>
        {showLayoutControls && <span>Layout: {layout}</span>}
      </div>
    </div>
  );
});

PreviewControls.displayName = 'PreviewControls';