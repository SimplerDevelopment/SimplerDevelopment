'use client';

import React, { useContext, memo, useMemo, useState, useRef, useCallback } from "react";
import EditorContext from "./EditorContext";
import { ScalableMainView } from "./ScalableMainView";
import { getPresetScales } from "./utils/layerTransforms";

interface ResizableStylePreviewProps {
  style: any;
  layers?: any[];
  scale?: number;
  dimensions?: { width: number; height: number };
  onResize?: (dimensions: { width: number; height: number }) => void;
  onScaleChange?: (scale: number) => void;
  showResizeHandles?: boolean;
  showControls?: boolean;
  className?: string;
  disabled?: boolean;
}

export const ResizableStylePreview = memo(function ResizableStylePreview({
  style,
  layers,
  scale = 0.75,
  dimensions = { width: 300, height: 400 },
  onResize,
  onScaleChange,
  showResizeHandles = false,
  showControls = false,
  className = "",
  disabled = false
}: ResizableStylePreviewProps) {
  const { setStyle, setControlMode, product, quantity, setQuantity, side, layers: contextLayers } =
    useContext(EditorContext);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const layersToUse = layers || contextLayers;

  const cSide = useMemo(() => 
    style.sides.find((s: any) => s.side === side.side) || style.sides[0],
    [style.sides, side.side]
  );
  
  // Memoize sorted sizes to avoid re-sorting on every render
  const sortedSizes = useMemo(() => {
    const priority = [
      "XS", "S", "SM", "M", "L", "XL", "2XL", "3XL", 
      "4XL", "5XL", "6XL", "7XL", "8XL", "9XL"
    ];
    return style?.sizes?.sort((a: any, b: any) => {
      return (
        priority.indexOf(a.name.toUpperCase()) -
        priority.indexOf(b.name.toUpperCase())
      );
    }) || [];
  }, [style?.sizes]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!showResizeHandles || disabled) return;
    
    e.preventDefault();
    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      width: dimensions.width,
      height: dimensions.height
    });
  }, [showResizeHandles, disabled, dimensions]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !onResize) return;
    
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    
    const newWidth = Math.max(200, dragStart.width + deltaX);
    const newHeight = Math.max(250, dragStart.height + deltaY);
    
    onResize({ width: newWidth, height: newHeight });
  }, [isDragging, dragStart, onResize]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  React.useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const presetScales = getPresetScales();

  const containerStyle = useMemo(() => ({
    width: dimensions.width,
    height: dimensions.height,
    position: 'relative' as const,
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    overflow: 'hidden',
    background: 'white'
  }), [dimensions]);

  return (
    <div className={`resizable-style-preview ${className}`}>
      {/* Scale Controls */}
      {onScaleChange && (
        <div className="flex items-center gap-2 mb-2 p-2 bg-gray-50 rounded">
          <label className="text-sm font-medium">Scale:</label>
          <select
            value={scale}
            onChange={(e) => onScaleChange(parseFloat(e.target.value))}
            className="text-sm border rounded px-2 py-1"
            disabled={disabled}
          >
            {presetScales.map(preset => (
              <option key={preset.scale} value={preset.scale}>
                {preset.name} ({Math.round(preset.scale * 100)}%)
              </option>
            ))}
          </select>
          <span className="text-xs text-gray-500">
            {dimensions.width} × {dimensions.height}
          </span>
        </div>
      )}

      {/* Preview Container */}
      <div 
        ref={containerRef}
        style={containerStyle}
        className={isDragging ? 'cursor-nw-resize' : ''}
      >
        {/* Main View */}
        <div className="w-full h-full">
          <ScalableMainView
            overrideSide={cSide}
            overrideLayers={layersToUse}
            scale={scale}
            width="100%"
            height="100%"
            showControls={showControls}
            disabled={disabled}
          />
        </div>

        {/* Resize Handle */}
        {showResizeHandles && !disabled && (
          <div
            className="resize-handle"
            onMouseDown={handleMouseDown}
          />
        )}

        {/* Style Info Overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-75 text-white p-2">
          <div className="text-sm font-medium truncate">{style.name}</div>
          <div className="text-xs opacity-75">{sortedSizes.length} sizes available</div>
        </div>
      </div>

      {/* Style Selection Button */}
      <button
        onClick={() => {
          setStyle(style);
          setControlMode("welcome");
        }}
        className="mt-2 w-full px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={disabled}
      >
        Select This Style
      </button>

      {/* Size/Price Table (if not disabled) */}
      {!disabled && (
        <table className="qtyTable mt-2 w-full text-xs">
          <thead>
            <tr>
              <th className="tableCell text-left">Size</th>
              <th className="tableCell text-right">Price</th>
            </tr>
          </thead>
          <tbody>
            {sortedSizes.slice(0, 5).map((size: any, sizeIndex: number) => (
              <tr key={size.id || sizeIndex}>
                <td className="tableCell">{size.name || ""}</td>
                <td className="tableCell price text-right">
                  ${size.unitPrice.toFixed(2)}
                </td>
              </tr>
            ))}
            {sortedSizes.length > 5 && (
              <tr>
                <td className="tableCell text-center" colSpan={2}>
                  +{sortedSizes.length - 5} more sizes
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
});

// Add display name for better debugging
ResizableStylePreview.displayName = 'ResizableStylePreview';