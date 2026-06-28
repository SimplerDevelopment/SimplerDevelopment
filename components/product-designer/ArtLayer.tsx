'use client';

import React, { useContext, useEffect, useState } from "react";
import EditorContext from "./EditorContext";
import type { LayerData } from "./designerTypes";

export const ArtLayer = ({ layer }: { layer: LayerData }) => {
  const { styleOverrides, side } = useContext(EditorContext);
  const [svgContent, setSvgContent] = useState<string | null>(null);

  const overrideEntry = styleOverrides[side?.id]?.[layer?.id] as
    | { colors?: Record<string, string> }
    | undefined;
  const colors = overrideEntry?.colors;

  useEffect(() => {
    void (async () => {
      await Promise.resolve(); // Yield to avoid synchronous setState in effect
      if (!colors) {
        setSvgContent(null);
        return;
      }
      try {
        const res = await fetch(layer.url as string);
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
    })();
  }, [layer.url, colors, layer.width]);

  if (!overrideEntry) {
    return <img src={layer.url as string} alt="Layer" draggable={false} />;
  }

  if (!svgContent) return null;

  return (
    <>
      <div
        dangerouslySetInnerHTML={{ __html: svgContent }}
        draggable={false}
      />
    </>
  );
};
