'use client';

import React, { useContext, useMemo, useState, useRef, useCallback } from "react";
import EditorContext from "./EditorContext";

// Enhanced text segment structure
export interface TextSegment {
  id: string;
  text: string;
  color?: string; // If not provided, uses layer default color
  startIndex: number;
  endIndex: number;
}

// Enhanced text layer structure
export interface EnhancedTextLayerData {
  segments: TextSegment[];
  defaultColor: string;
  text: string; // Combined text for backward compatibility
}

interface EnhancedTextLayerProps {
  layer: any;
  side: any;
  isSelected: boolean;
  onTextChange?: (newText: string, segments: TextSegment[]) => void;
}

export const EnhancedTextLayer: React.FC<EnhancedTextLayerProps> = ({
  layer,
  side,
  isSelected,
  onTextChange
}) => {
  const {
    styleOverrides,
    selectedLayers,
    updateLayer
  } = useContext(EditorContext);

  const textRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [selection, setSelection] = useState<{
    start: number;
    end: number;
  } | null>(null);

  // Get enhanced text data or create from simple text
  const textData = useMemo((): EnhancedTextLayerData => {
    if (layer.enhancedText) {
      return layer.enhancedText;
    }
    
    // Convert simple text to enhanced format
    return {
      segments: [{
        id: `${layer.id}_segment_0`,
        text: layer.text || "",
        startIndex: 0,
        endIndex: (layer.text || "").length,
        color: undefined // Uses default layer color
      }],
      defaultColor: layer.color,
      text: layer.text || ""
    };
  }, [layer.enhancedText, layer.text, layer.color, layer.id]);

  // Get effective color for text (considering style overrides)
  const getEffectiveColor = useCallback((segmentColor?: string) => {
    const styleOverrideColor = styleOverrides[side?.id]?.[layer.id]?.color;
    if (styleOverrideColor) return styleOverrideColor;
    if (segmentColor) return segmentColor;
    return textData.defaultColor || layer.color || "#000000";
  }, [styleOverrides, side?.id, layer.id, textData.defaultColor, layer.color]);

  // Handle text selection
  const handleTextSelection = useCallback(() => {
    if (!textRef.current || !isEditing) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const textNode = textRef.current;
    
    // Calculate selection indices
    let startOffset = 0;
    let endOffset = 0;
    
    try {
      const preSelectionRange = range.cloneRange();
      preSelectionRange.selectNodeContents(textNode);
      preSelectionRange.setEnd(range.startContainer, range.startOffset);
      startOffset = preSelectionRange.toString().length;
      
      endOffset = startOffset + range.toString().length;
      
      if (startOffset !== endOffset) {
        setSelection({ start: startOffset, end: endOffset });
      } else {
        setSelection(null);
      }
    } catch (error) {
      console.warn('Error calculating text selection:', error);
      setSelection(null);
    }
  }, [isEditing]);

  // Apply color to selected text
  const applyColorToSelection = useCallback((color: string) => {
    if (!selection || selection.start === selection.end) return;

    const newSegments = [...textData.segments];
    const { start, end } = selection;
    
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
      
      // Add up to 3 new segments: before, selected, after
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
      
      // Insert new segments at the original position
      newSegments.splice(segmentIndex, 0, ...newSegmentsToAdd);
    }

    // Sort segments by start index
    newSegments.sort((a, b) => a.startIndex - b.startIndex);

    // Update layer with new segments
    const updatedTextData: EnhancedTextLayerData = {
      ...textData,
      segments: newSegments
    };

    updateLayer({
      ...layer,
      enhancedText: updatedTextData
    });

    setSelection(null);
  }, [selection, textData, layer, updateLayer]);

  // Handle text editing
  const handleTextEdit = useCallback((newText: string) => {
    // When text changes, we need to recreate segments
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

    updateLayer({
      ...layer,
      text: newText,
      enhancedText: updatedTextData
    });

    if (onTextChange) {
      onTextChange(newText, newSegments);
    }
  }, [layer, textData.defaultColor, updateLayer, onTextChange]);

  // Render text segments
  const renderText = () => {
    return textData.segments.map((segment) => (
      <span
        key={segment.id}
        style={{ color: getEffectiveColor(segment.color) }}
      >
        {segment.text}
      </span>
    ));
  };

  // Handle double-click to enter edit mode
  const handleDoubleClick = useCallback(() => {
    if (isSelected) {
      setIsEditing(true);
    }
  }, [isSelected]);

  // Handle blur to exit edit mode
  const handleBlur = useCallback(() => {
    setIsEditing(false);
    setSelection(null);
  }, []);

  // Handle content change in edit mode
  const handleContentChange = useCallback(() => {
    if (textRef.current && isEditing) {
      const newText = textRef.current.innerText || "";
      if (newText !== textData.text) {
        handleTextEdit(newText);
      }
    }
  }, [isEditing, textData.text, handleTextEdit]);

  return (
    <div
      ref={textRef}
      contentEditable={isEditing}
      suppressContentEditableWarning={true}
      onDoubleClick={handleDoubleClick}
      onBlur={handleBlur}
      onInput={handleContentChange}
      onMouseUp={handleTextSelection}
      onKeyUp={handleTextSelection}
      style={{
        outline: isEditing ? '2px solid #3B82F6' : 'none',
        padding: isEditing ? '2px' : '0',
        cursor: isSelected ? (isEditing ? 'text' : 'pointer') : 'inherit',
        userSelect: isEditing ? 'text' : 'none',
        whiteSpace: 'pre-wrap'
      }}
      className={`enhanced-text-layer ${isEditing ? 'editing' : ''}`}
    >
      {isEditing ? textData.text : renderText()}
    </div>
  );
};

// Color picker component for selected text
export const TextColorPicker: React.FC<{
  isVisible: boolean;
  onColorSelect: (color: string) => void;
  onClose: () => void;
}> = ({ isVisible, onColorSelect, onClose }) => {
  const colors = [
    '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF',
    '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080',
    '#FFC0CB', '#A52A2A', '#808080', '#000080', '#008000'
  ];

  if (!isVisible) return null;

  return (
    <div className="absolute top-full left-0 mt-2 p-2 bg-white border border-gray-300 rounded shadow-lg z-50">
      <div className="grid grid-cols-5 gap-2 mb-2">
        {colors.map((color) => (
          <button
            key={color}
            className="w-6 h-6 rounded border border-gray-300 hover:scale-110 transition-transform"
            style={{ backgroundColor: color }}
            onClick={() => onColorSelect(color)}
            title={color}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          className="w-8 h-6 rounded border-0 cursor-pointer"
          onChange={(e) => onColorSelect(e.target.value)}
          title="Custom color"
        />
        <button
          onClick={onClose}
          className="text-xs px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
        >
          Close
        </button>
      </div>
    </div>
  );
};