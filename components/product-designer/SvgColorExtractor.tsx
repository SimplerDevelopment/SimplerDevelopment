// @ts-nocheck
// TODO(designer): clean up types — ported from CRA, see .planning/product-designer-integration.md
'use client';

import React, { useState, useEffect, useContext } from "react";
import EditorContext from "./EditorContext";

interface SvgColorExtractorProps {
  layer: any;
}

export const SvgColorExtractor: React.FC<SvgColorExtractorProps> = ({
  layer,
}) => {
  const [init, setInit] = useState(false);
  const [colors, setColors] = useState<string[]>([]);
  const [originalColors, setOriginalColors] = useState<string[]>([]);
  const { setStyleOverrides, styleOverrides, side } = useContext(EditorContext);

  useEffect(() => {
    if (!layer?.url) return;
    if (init) return;
    const fetchAndExtractColors = async () => {
      try {
        const response = await fetch(layer.url, { mode: "cors" });
        if (!response.ok) {
          throw new Error(`Failed to fetch SVG: ${response.statusText}`);
        }
        const blob = await response.blob();
        const svgText = await blob.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgText, "image/svg+xml");
        const colorSet = new Set<string>();

        const walk = (element: Element) => {
          for (let attr of Array.from(element.attributes)) {
            if (
              attr.name === "fill" ||
              attr.name === "stroke" ||
              attr.name === "stop-color" ||
              attr.name.includes("color")
            ) {
              if (attr.value && attr.value !== "none") colorSet.add(attr.value);
            }

            // Parse inline CSS styles
            if (attr.name === "style") {
              const styles = attr.value.split(";");
              styles.forEach((style) => {
                const [prop, val] = style.split(":").map((s) => s.trim());
                if (
                  prop === "fill" ||
                  prop === "stroke" ||
                  prop === "stop-color" ||
                  prop.includes("color")
                ) {
                  if (val && val !== "none") colorSet.add(val);
                }
              });
            }
          }

          Array.from(element.children).forEach(walk);
        };

        const svgElement = doc.querySelector("svg");
        if (svgElement) walk(svgElement);

        const extractedColors = Array.from(colorSet);
        setColors(extractedColors);
        if (!init) {
          setOriginalColors(extractedColors);
          setInit(true);
        }
      } catch (error) {
        console.error("Failed to fetch or parse SVG:", error);
      }
    };

    fetchAndExtractColors();
  }, [layer]);

  React.useEffect(() => {
    const replacements = {};
    colors.forEach((color, idx) => {
      if (originalColors[idx] !== color) {
        replacements[originalColors[idx]] = color;
      }
    });

    setStyleOverrides((prev) => {
      const newStyleOverrides = { ...prev };
      if (!newStyleOverrides[side.id]) {
        newStyleOverrides[side.id] = {};
      }
      if (!newStyleOverrides[side.id][layer.id]) {
        newStyleOverrides[side.id][layer.id] = {};
      }
      newStyleOverrides[side.id][layer.id].colors = replacements;
      return newStyleOverrides;
    });
  }, [colors, layer]);

  return (
    <div>
      <h3>Extracted Colors:</h3>
      {colors.map((color, idx) => (
        <input
          key={idx}
          type="color"
          value={color}
          className="w-6 h-6 border-none mr-1 cursor-pointer bg-transparent p-0"
          onChange={(e) => {
            const newColor = e.target.value;
            const newColors = [...colors];
            newColors[idx] = newColor;
            setColors(newColors);
          }}
        />
      ))}
    </div>
  );
};
