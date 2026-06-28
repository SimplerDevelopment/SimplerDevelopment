// @ts-nocheck
// TODO(designer): clean up types — ported from CRA, see .planning/product-designer-integration.md
'use client';

import React, { useContext, useEffect, useState } from "react";
import EditorContext from "./EditorContext";

export const ArtLayer = ({ layer, key }) => {
  const { styleOverrides, side } = useContext(EditorContext);
  if (!styleOverrides[side?.id] || !styleOverrides[side?.id]?.[layer?.id]) {
    return <img src={layer.url} alt="Layer" draggable={false} />;
  }
  const { colors } = styleOverrides[side?.id][layer?.id];

  const [svgContent, setSvgContent] = useState<string | null>(null);

  useEffect(() => {
    const fetchAndReplaceSVG = async () => {
      try {
        const res = await fetch(layer.url);
        let svgText = await res.text();

        // Inject width into the <svg> tag
        svgText = svgText.replace(
          /<svg([^>]*)>/,
          `<svg$1 width="${layer.width}">`,
        );

        // Replace each color in the SVG with the mapped color
        for (const [original, replacement] of Object.entries(colors)) {
          // Match colors in attributes or CSS (case-insensitive)
          const escapedOriginal = original.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&",
          );
          const colorRegex = new RegExp(escapedOriginal, "gi");
          svgText = svgText.replace(colorRegex, replacement as string);
        }

        setSvgContent(svgText);
      } catch (err) {
        console.error("Failed to load or modify SVG:", err);
      }
    };

    fetchAndReplaceSVG();
  }, [layer.url, colors, layer.width]);

  if (!svgContent) return null;

  return (
    <>
      <div
        key={key}
        dangerouslySetInnerHTML={{ __html: svgContent }}
        draggable={false}
      />
    </>
  );
};
