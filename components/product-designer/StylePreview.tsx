// @ts-nocheck
// TODO(designer): clean up types — ported from CRA, see .planning/product-designer-integration.md
'use client';

import React, { useContext, memo, useMemo } from "react";
import EditorContext from "./EditorContext";
import { ScalableMainView } from "./ScalableMainView";

export const StylePreview = memo(function StylePreview({ style, index }: { style: any; index: any }) {
  const { setStyle, setControlMode, product, quantity, setQuantity, side } =
    useContext(EditorContext);
  const cSide = useMemo(() => 
    style.sides.find((s) => s.side === side.side) || style.sides[0],
    [style.sides, side.side]
  );
  
  // Memoize sorted sizes to avoid re-sorting on every render
  const sortedSizes = useMemo(() => {
    const priority = [
      "XS", "S", "SM", "M", "L", "XL", "2XL", "3XL", 
      "4XL", "5XL", "6XL", "7XL", "8XL", "9XL"
    ];
    return style?.sizes?.sort((a, b) => {
      return (
        priority.indexOf(a.name.toUpperCase()) -
        priority.indexOf(b.name.toUpperCase())
      );
    }) || [];
  }, [style?.sizes]);
  return (
    <div key={style.id} className="stylePreview">
      <div>
        <button
          className="cursor-pointer"
          onClick={() => {
            setStyle(product.styles[index]);
            setControlMode("welcome");
          }}
        >
          <ScalableMainView 
            key={index} 
            overrideSide={cSide}
            scale={0.75}
            width="100%"
            height="100%"
            showControls={false}
            disabled={true}
          />
        </button>
      </div>

      <table className="qtyTable">
        <thead>
          <tr>
            <th>Size</th>
            <th>Unit Price</th>
          </tr>
        </thead>
        <tbody>
          {sortedSizes.map((size, sizeIndex) => {
              const total = (quantity?.[size?.id]?.value || 0) * size.unitPrice;
              return (
                <tr key={size.id || sizeIndex}>
                  <td className="tableCell">{size.name || ""}</td>
                  <td className="tableCell price">
                    ${size.unitPrice.toFixed(2)}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
});

// Add display name for better debugging
StylePreview.displayName = 'StylePreview';
