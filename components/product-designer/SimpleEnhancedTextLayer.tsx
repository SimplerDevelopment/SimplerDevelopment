'use client';

import React, { useContext, useMemo } from "react";
import EditorContext from "./EditorContext";
import type { LayerData, ProductSideData } from "./designerTypes";

// Simplified text segment interface
export interface TextSegment {
  id: string;
  text: string;
  color?: string;
  startIndex: number;
  endIndex: number;
}

// Enhanced text layer data interface
export interface EnhancedTextLayerData {
  segments: TextSegment[];
  defaultColor: string;
  text: string;
}

interface SimpleEnhancedTextLayerProps {
  layer: LayerData;
  side: ProductSideData | null;
  isSelected?: boolean;
}

export const SimpleEnhancedTextLayer: React.FC<SimpleEnhancedTextLayerProps> = ({
  layer,
  side,
  isSelected = false
}) => {
  const { styleOverrides } = useContext(EditorContext);

  // Get enhanced text data or create from simple text
  const textData = useMemo((): EnhancedTextLayerData => {
    if (layer.enhancedText) {
      return layer.enhancedText;
    }
    
    // Convert simple text to enhanced format for backward compatibility
    return {
      segments: [{
        id: `${layer.id}_segment_0`,
        text: layer.text || "",
        startIndex: 0,
        endIndex: (layer.text || "").length,
        color: undefined // Uses default layer color
      }],
      defaultColor: layer.color || "#000000",
      text: layer.text || ""
    };
  }, [layer.enhancedText, layer.text, layer.color, layer.id]);

  // Get effective color for text (considering style overrides)
  const getEffectiveColor = (segmentColor?: string) => {
    // Priority: Style Override > Segment Color > Default Color > Fallback
    const styleOverrideColor = styleOverrides[side?.id]?.[layer.id]?.color;
    if (styleOverrideColor) return styleOverrideColor;
    if (segmentColor) return segmentColor;
    return textData.defaultColor || "#000000";
  };

  // If no text, return empty
  if (!textData.text) {
    return <span style={{ color: getEffectiveColor() }}></span>;
  }

  // Render text segments with their individual colors
  return (
    <span className={`enhanced-text-layer ${isSelected ? 'selected' : ''}`}>
      {textData.segments.map((segment) => (
        <span
          key={segment.id}
          style={{ color: getEffectiveColor(segment.color) }}
        >
          {segment.text}
        </span>
      ))}
    </span>
  );
};