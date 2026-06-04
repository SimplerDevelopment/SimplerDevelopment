// @ts-nocheck
// TODO(designer): clean up types — ported from CRA, see .planning/product-designer-integration.md
'use client';

import React, { useContext, useState, useMemo } from "react";
import { EditorContext } from "./EditorContext";
import { FontSelector } from "./FontSelector";
import { TextColorPicker, TextSegment, EnhancedTextLayerData } from "./EnhancedTextLayer";

interface EnhancedTextEditorProps {
  view: string;
  layer: any;
  handleInputChange: (field: string, value: any) => void;
}

export const EnhancedTextEditor: React.FC<EnhancedTextEditorProps> = ({
  view,
  layer,
  handleInputChange
}) => {
  const { setStyleOverrides, styleOverrides, side, style } = useContext(EditorContext);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [selectedText, setSelectedText] = useState<{start: number, end: number} | null>(null);

  // Get text data with enhanced format support
  const textData = useMemo((): EnhancedTextLayerData => {
    if (layer.enhancedText) {
      return layer.enhancedText;
    }
    
    return {
      segments: [{
        id: `${layer.id}_segment_0`,
        text: layer.text || "",
        startIndex: 0,
        endIndex: (layer.text || "").length,
        color: undefined
      }],
      defaultColor: layer.color,
      text: layer.text || ""
    };
  }, [layer.enhancedText, layer.text, layer.color, layer.id]);

  // Handle individual segment color change
  const handleSegmentColorChange = (segmentId: string, color: string) => {
    const newSegments = textData.segments.map(segment => 
      segment.id === segmentId 
        ? { ...segment, color } 
        : segment
    );

    const updatedTextData: EnhancedTextLayerData = {
      ...textData,
      segments: newSegments
    };

    handleInputChange('enhancedText', updatedTextData);
  };

  // Apply color to selected text range
  const applyColorToSelection = (color: string) => {
    if (!selectedText || selectedText.start === selectedText.end) return;

    const { start, end } = selectedText;
    const newSegments = [...textData.segments];
    
    // Find segments that intersect with the selection
    const affectedSegmentIndices: number[] = [];
    for (let i = 0; i < newSegments.length; i++) {
      const segment = newSegments[i];
      if (segment.startIndex < end && segment.endIndex > start) {
        affectedSegmentIndices.push(i);
      }
    }

    // Process affected segments from right to left to avoid index issues
    for (let i = affectedSegmentIndices.length - 1; i >= 0; i--) {
      const segmentIndex = affectedSegmentIndices[i];
      const segment = newSegments[segmentIndex];
      
      const segmentStart = segment.startIndex;
      const segmentEnd = segment.endIndex;
      const selectionStart = Math.max(start, segmentStart);
      const selectionEnd = Math.min(end, segmentEnd);
      
      // Remove the original segment
      newSegments.splice(segmentIndex, 1);
      
      // Add new segments
      const newSegmentsToAdd: TextSegment[] = [];
      
      // Before selection (if exists)
      if (selectionStart > segmentStart) {
        newSegmentsToAdd.push({
          id: `${layer.id}_segment_${Date.now()}_before`,
          text: textData.text.substring(segmentStart, selectionStart),
          startIndex: segmentStart,
          endIndex: selectionStart,
          color: segment.color
        });
      }
      
      // Selected part
      newSegmentsToAdd.push({
        id: `${layer.id}_segment_${Date.now()}_selected`,
        text: textData.text.substring(selectionStart, selectionEnd),
        startIndex: selectionStart,
        endIndex: selectionEnd,
        color: color
      });
      
      // After selection (if exists)
      if (selectionEnd < segmentEnd) {
        newSegmentsToAdd.push({
          id: `${layer.id}_segment_${Date.now()}_after`,
          text: textData.text.substring(selectionEnd, segmentEnd),
          startIndex: selectionEnd,
          endIndex: segmentEnd,
          color: segment.color
        });
      }
      
      // Insert new segments
      newSegments.splice(segmentIndex, 0, ...newSegmentsToAdd);
    }

    // Sort segments by start index
    newSegments.sort((a, b) => a.startIndex - b.startIndex);

    const updatedTextData: EnhancedTextLayerData = {
      ...textData,
      segments: newSegments
    };

    handleInputChange('enhancedText', updatedTextData);
    setSelectedText(null);
    setShowColorPicker(false);
  };

  // Reset text formatting to single color
  const resetTextFormatting = () => {
    const resetSegments: TextSegment[] = [{
      id: `${layer.id}_segment_reset`,
      text: textData.text,
      startIndex: 0,
      endIndex: textData.text.length,
      color: undefined
    }];

    const updatedTextData: EnhancedTextLayerData = {
      ...textData,
      segments: resetSegments
    };

    handleInputChange('enhancedText', updatedTextData);
  };

  if (view === "styleSpecific") {
    return (
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Color</label>
        <input
          type="color"
          value={styleOverrides?.[side.id]?.[layer.id]?.color || textData.defaultColor}
          onChange={(e) => {
            const color = e.target.value;
            setStyleOverrides((prev) => {
              const newStyleOverrides = { ...prev };
              if (!newStyleOverrides[side.id]) newStyleOverrides[side.id] = {};
              if (!newStyleOverrides[side.id][layer.id])
                newStyleOverrides[side.id][layer.id] = {};
              newStyleOverrides[side.id][layer.id].color = color;
              return newStyleOverrides;
            });
          }}
          className="border border-gray-300 rounded w-full p-0"
        />
        <div className="mt-2">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={
                (styleOverrides?.[side.id]?.[layer.id]?.color ||
                  textData.defaultColor) === `#${style.htmlColor1}`
              }
              onChange={(e) => {
                const checked = e.target.checked;
                setStyleOverrides((prev) => {
                  const newOverrides = { ...prev };
                  if (!newOverrides[side.id]) newOverrides[side.id] = {};
                  if (!newOverrides[side.id][layer.id])
                    newOverrides[side.id][layer.id] = {};
                  if (checked) {
                    newOverrides[side.id][layer.id].color =
                      `#${style.htmlColor1}`;
                  } else {
                    delete newOverrides[side.id][layer.id].color;
                  }
                  return newOverrides;
                });
              }}
            />
            Match style color
          </label>
        </div>
      </div>
    );
  }

  return (
    <>
      <FontSelector text={textData.text} onChange={handleInputChange} />
      
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Text</label>
        <textarea
          value={textData.text}
          onChange={(e) => {
            const newText = e.target.value;
            // When text changes, reset to single segment
            const newSegments: TextSegment[] = [{
              id: `${layer.id}_segment_0`,
              text: newText,
              startIndex: 0,
              endIndex: newText.length,
              color: undefined
            }];

            const updatedTextData: EnhancedTextLayerData = {
              ...textData,
              text: newText,
              segments: newSegments
            };

            handleInputChange("text", newText);
            handleInputChange("enhancedText", updatedTextData);
          }}
          className="border border-gray-300 rounded w-full p-2 min-h-[80px] resize-vertical"
          placeholder="Enter your text here..."
        />
      </div>

      {/* Text Preview with Selection */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Preview & Text Selection</label>
        <div 
          className="border border-gray-200 rounded p-3 min-h-[60px] bg-gray-50 relative"
          style={{ 
            fontSize: layer.size ? `${Math.max(12, Math.min(layer.size / 4, 24))}px` : '16px',
            fontFamily: layer.font || 'Arial'
          }}
        >
          <div
            className="whitespace-pre-wrap cursor-text select-text"
            onMouseUp={(e) => {
              const selection = window.getSelection();
              if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const start = range.startOffset;
                const end = range.endOffset;
                if (start !== end) {
                  setSelectedText({ start, end });
                  setShowColorPicker(true);
                } else {
                  setSelectedText(null);
                  setShowColorPicker(false);
                }
              }
            }}
          >
            {textData.segments.map((segment) => (
              <span
                key={segment.id}
                style={{ color: segment.color || textData.defaultColor }}
              >
                {segment.text}
              </span>
            ))}
          </div>
          
          <TextColorPicker
            isVisible={showColorPicker && selectedText !== null}
            onColorSelect={applyColorToSelection}
            onClose={() => {
              setShowColorPicker(false);
              setSelectedText(null);
            }}
          />
        </div>
        
        {selectedText && (
          <div className="text-xs text-gray-600 mt-1">
            Selected: "{textData.text.substring(selectedText.start, selectedText.end)}"
          </div>
        )}
      </div>

      {/* Text Formatting Controls */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Text Formatting</label>
        <div className="space-y-2">
          {textData.segments.length > 1 && (
            <div className="text-xs bg-blue-50 p-2 rounded">
              <div className="flex items-center justify-between mb-2">
                <span>Individual segments: {textData.segments.length}</span>
                <button
                  onClick={resetTextFormatting}
                  className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                >
                  Reset Formatting
                </button>
              </div>
              <div className="space-y-1">
                {textData.segments.map((segment, index) => (
                  <div key={segment.id} className="flex items-center gap-2 text-xs">
                    <span className="flex-1 truncate">"{segment.text}"</span>
                    <input
                      type="color"
                      value={segment.color || textData.defaultColor}
                      onChange={(e) => handleSegmentColorChange(segment.id, e.target.value)}
                      className="w-6 h-6 rounded border cursor-pointer"
                      title={`Color for segment ${index + 1}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Default Color */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Default Color</label>
        <input
          type="color"
          value={textData.defaultColor}
          onChange={(e) => {
            const newColor = e.target.value;
            const updatedTextData = {
              ...textData,
              defaultColor: newColor
            };
            handleInputChange("color", newColor);
            handleInputChange("enhancedText", updatedTextData);
          }}
          className="border border-gray-300 rounded w-full p-0"
        />
        <p className="text-xs text-gray-500 mt-1">
          This color applies to text segments without individual colors
        </p>
      </div>

      {/* Regular layer controls */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Size</label>
        <input
          type="number"
          value={layer.size}
          onChange={(e) => handleInputChange("size", parseInt(e.target.value))}
          className="border border-gray-300 rounded w-full p-2 mb-2"
        />
        <input
          type="range"
          min="1"
          max="500"
          value={layer.size}
          onChange={(e) => handleInputChange("size", parseInt(e.target.value))}
          className="w-full"
        />
      </div>
      
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Rotation</label>
        <input
          type="number"
          value={layer.rotation}
          onChange={(e) =>
            handleInputChange("rotation", parseInt(e.target.value))
          }
          className="border border-gray-300 rounded w-full p-2 mb-2"
        />
        <input
          type="range"
          min="0"
          max="360"
          value={layer.rotation}
          onChange={(e) =>
            handleInputChange("rotation", parseInt(e.target.value))
          }
          className="w-full"
        />
      </div>
      
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">
          Position (X, Y)
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            value={layer.position.x}
            onChange={(e) =>
              handleInputChange("position", {
                ...layer.position,
                x: parseInt(e.target.value),
              })
            }
            className="border border-gray-300 rounded w-full p-2"
          />
          <input
            type="number"
            value={layer.position.y}
            onChange={(e) =>
              handleInputChange("position", {
                ...layer.position,
                y: parseInt(e.target.value),
              })
            }
            className="border border-gray-300 rounded w-full p-2"
          />
        </div>
      </div>
    </>
  );
};