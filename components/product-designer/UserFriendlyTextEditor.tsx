// @ts-nocheck
// TODO(designer): clean up types — ported from CRA, see .planning/product-designer-integration.md
'use client';

import React, { useContext, useState, useMemo, useCallback } from "react";
import { EditorContext } from "./EditorContext";
import { FontSelector } from "./FontSelector";
import { TextSegment, EnhancedTextLayerData } from "./SimpleEnhancedTextLayer";
import "./UserFriendlyTextEditor.css";

interface UserFriendlyTextEditorProps {
  view: string;
  layer: any;
  handleInputChange: (field: string, value: any) => void;
}

export const UserFriendlyTextEditor: React.FC<UserFriendlyTextEditorProps> = ({
  view,
  layer,
  handleInputChange
}) => {
  const { setStyleOverrides, styleOverrides, side, style } = useContext(EditorContext);
  const [selectedColor, setSelectedColor] = useState("#000000");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedWordIndices, setSelectedWordIndices] = useState<number[]>([]);

  // Quick color palette
  const quickColors = [
    "#000000", "#FFFFFF", "#FF0000", "#00FF00", "#0000FF", 
    "#FFFF00", "#FF00FF", "#00FFFF", "#FFA500", "#800080",
    "#FFC0CB", "#A52A2A", "#808080", "#000080", "#008000"
  ];

  // Get enhanced text data
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
      defaultColor: layer.color || "#000000",
      text: layer.text || ""
    };
  }, [layer.enhancedText, layer.text, layer.color, layer.id]);

  // Split text into words for easy selection
  const words = useMemo(() => {
    const text = textData.text;
    const wordPattern = /(\S+|\s+)/g;
    const matches = Array.from(text.matchAll(wordPattern));
    
    return matches.map((match, index) => {
      const word = match[0];
      const startIndex = match.index!;
      const endIndex = startIndex + word.length;
      
      // Find the segment that contains this word
      const containingSegment = textData.segments.find(segment => 
        segment.startIndex <= startIndex && segment.endIndex >= endIndex
      );
      
      return {
        index,
        text: word,
        startIndex,
        endIndex,
        color: containingSegment?.color || textData.defaultColor,
        isSpace: /^\s+$/.test(word)
      };
    });
  }, [textData]);

  // Apply color to selected words
  const applyColorToWords = useCallback((color: string) => {
    if (selectedWordIndices.length === 0) return;

    const newSegments: TextSegment[] = [];
    let currentIndex = 0;

    words.forEach((word, wordIndex) => {
      const shouldChangeColor = selectedWordIndices.includes(wordIndex);
      const wordColor = shouldChangeColor ? color : word.color;

      // Add segment for this word
      newSegments.push({
        id: `${layer.id}_word_${wordIndex}_${Date.now()}`,
        text: word.text,
        startIndex: word.startIndex,
        endIndex: word.endIndex,
        color: wordColor === textData.defaultColor ? undefined : wordColor
      });
    });

    const updatedTextData: EnhancedTextLayerData = {
      ...textData,
      segments: newSegments
    };

    handleInputChange('enhancedText', updatedTextData);
    setSelectedWordIndices([]);
  }, [selectedWordIndices, words, textData, layer.id, handleInputChange]);

  // Toggle word selection
  const toggleWordSelection = useCallback((wordIndex: number) => {
    setSelectedWordIndices(prev => 
      prev.includes(wordIndex) 
        ? prev.filter(i => i !== wordIndex)
        : [...prev, wordIndex]
    );
  }, []);

  // Clear all colors (reset to single color)
  const resetAllColors = useCallback(() => {
    const resetSegments: TextSegment[] = [{
      id: `${layer.id}_reset_${Date.now()}`,
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
    setSelectedWordIndices([]);
  }, [textData, layer.id, handleInputChange]);

  // Handle text change
  const handleTextChange = useCallback((newText: string) => {
    const newSegments: TextSegment[] = [{
      id: `${layer.id}_segment_0`,
      text: newText,
      startIndex: 0,
      endIndex: newText.length,
      color: undefined
    }];

    const updatedTextData: EnhancedTextLayerData = {
      segments: newSegments,
      defaultColor: textData.defaultColor,
      text: newText
    };

    handleInputChange("text", newText);
    handleInputChange("enhancedText", updatedTextData);
    setSelectedWordIndices([]);
  }, [layer.id, textData.defaultColor, handleInputChange]);

  if (view === "styleSpecific") {
    return (
      <div className="space-y-4">
        {/* Style-specific color override */}
        <div className="bg-blue-50 p-4 rounded-lg">
          <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
            <span className="text-blue-600">🎨</span>
            Style-Specific Colors
          </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-2">Override Color</label>
              <div className="flex items-center gap-2">
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
                  className="w-12 h-8 border border-gray-300 rounded cursor-pointer"
                />
                <span className="text-sm text-gray-600">
                  {styleOverrides?.[side.id]?.[layer.id]?.color || textData.defaultColor}
                </span>
              </div>
            </div>
            
            <div>
              <label className="flex items-center gap-2 text-sm">
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
                        newOverrides[side.id][layer.id].color = `#${style.htmlColor1}`;
                      } else {
                        delete newOverrides[side.id][layer.id].color;
                      }
                      return newOverrides;
                    });
                  }}
                  className="rounded"
                />
                <span>Match product style color</span>
                <div 
                  className="w-4 h-4 rounded border border-gray-300"
                  style={{ backgroundColor: `#${style.htmlColor1}` }}
                />
              </label>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 user-friendly-text-editor">
      {/* Font Selector */}
      <FontSelector text={textData.text} onChange={handleInputChange} />
      
      {/* Text Input */}
      <div>
        <label className="block text-sm font-semibold mb-2 flex items-center gap-2">
          <span>✏️</span> Your Text
        </label>
        <textarea
          value={textData.text}
          onChange={(e) => handleTextChange(e.target.value)}
          className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          rows={3}
          placeholder="Type your text here..."
        />
      </div>

      {/* Color Tools */}
      {textData.text && (
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-semibold flex items-center gap-2">
              <span>🎨</span> Color Tools
            </label>
            <button
              onClick={resetAllColors}
              className="text-xs px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-gray-700"
            >
              Reset Colors
            </button>
          </div>
          
          {/* Quick Color Palette */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-2">Quick Colors</label>
            <div className="grid grid-cols-8 gap-1 mb-2 color-palette-grid flex-wrap">
              {quickColors.map((color) => (
                <button
                  key={color}
                  onClick={() => {
                    setSelectedColor(color);
                    if (selectedWordIndices.length > 0) {
                      applyColorToWords(color);
                    }
                  }}
                  className={`w-8 h-8 rounded border-2 color-palette-button ${
                    selectedColor === color ? 'selected border-blue-500' : 'border-gray-300'
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={selectedColor}
                onChange={(e) => {
                  setSelectedColor(e.target.value);
                  if (selectedWordIndices.length > 0) {
                    applyColorToWords(e.target.value);
                  }
                }}
                className="w-8 h-8 border border-gray-300 rounded cursor-pointer"
              />
              <span className="text-xs text-gray-600">Custom color</span>
            </div>
          </div>

          {/* Word Selection */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">
              Select words to color (click to select, then choose a color above)
            </label>
            <div className="bg-white p-3 rounded border min-h-[60px] flex flex-wrap gap-1 items-start word-selection-area">
              {words.map((word, index) => (
                <button
                  key={index}
                  onClick={() => !word.isSpace && toggleWordSelection(index)}
                  disabled={word.isSpace}
                  className={`
                    word-button text-sm
                    ${word.isSpace 
                      ? 'disabled cursor-default' 
                      : `cursor-pointer border px-1 ${
                          selectedWordIndices.includes(index) 
                            ? 'selected' 
                            : 'border-transparent'
                        }`
                    }
                  `}
                  style={{ 
                    color: word.color,
                    fontFamily: layer.font || 'Arial',
                    whiteSpace: 'pre'
                  }}
                >
                  {word.text}
                </button>
              ))}
            </div>
            {selectedWordIndices.length > 0 && (
              <div className="mt-2 selection-status">
                {selectedWordIndices.length} word{selectedWordIndices.length !== 1 ? 's' : ''} selected. 
                Choose a color above to apply it.
              </div>
            )}
          </div>

          {/* Apply Color Button */}
          {selectedWordIndices.length > 0 && (
            <button
              onClick={() => applyColorToWords(selectedColor)}
              className="w-full mt-3 apply-color-button"
            >
              Apply {selectedColor} to {selectedWordIndices.length} selected word{selectedWordIndices.length !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      )}

      {/* Text Preview */}
      {textData.text && (
        <div>
          <label className="block text-sm font-semibold mb-2 flex items-center gap-2">
            <span>👁️</span> Preview
          </label>
          <div 
            className="bg-white border border-gray-200 rounded-lg p-4 min-h-[60px]"
            style={{ 
              fontSize: Math.max(16, Math.min(layer.size / 3, 32)),
              fontFamily: layer.font || 'Arial'
            }}
          >
            {words.map((word, index) => (
              <span
                key={index}
                style={{ color: word.color }}
                className="whitespace-pre"
              >
                {word.text}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Basic Controls */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Size</label>
          <input
            type="range"
            min="10"
            max="200"
            value={layer.size || 60}
            onChange={(e) => handleInputChange("size", parseInt(e.target.value))}
            className="w-full"
          />
          <div className="text-xs text-gray-500 text-center mt-1">{layer.size || 60}px</div>
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Default Color</label>
          <div className="flex items-center gap-2">
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
              className="w-full h-8 border border-gray-300 rounded cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Advanced Controls Toggle */}
      <div className="border-t pt-4">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800"
        >
          <span>{showAdvanced ? '🔽' : '▶️'}</span>
          Advanced Options
        </button>
        
        {showAdvanced && (
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Rotation</label>
              <input
                type="range"
                min="0"
                max="360"
                value={layer.rotation || 0}
                onChange={(e) => handleInputChange("rotation", parseInt(e.target.value))}
                className="w-full"
              />
              <div className="text-xs text-gray-500 text-center mt-1">{layer.rotation || 0}°</div>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Position</label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">X</label>
                  <input
                    type="number"
                    value={layer.position?.x || 0}
                    onChange={(e) =>
                      handleInputChange("position", {
                        ...layer.position,
                        x: parseInt(e.target.value),
                      })
                    }
                    className="w-full p-1 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Y</label>
                  <input
                    type="number"
                    value={layer.position?.y || 0}
                    onChange={(e) =>
                      handleInputChange("position", {
                        ...layer.position,
                        y: parseInt(e.target.value),
                      })
                    }
                    className="w-full p-1 border border-gray-300 rounded text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Multi-color info */}
            {textData.segments.length > 1 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                <div className="text-sm font-medium text-yellow-800 mb-1">
                  🌈 Multi-Color Text Active
                </div>
                <div className="text-xs text-yellow-700">
                  This text has {textData.segments.length} different colored segments.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};