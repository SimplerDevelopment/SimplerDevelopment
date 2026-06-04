// @ts-nocheck
// TODO(designer): clean up types — ported from CRA, see .planning/product-designer-integration.md
'use client';

import React, { useContext } from "react";
import EditorContext from "./EditorContext";

export const Colors = () => {
  const { product, setStyle, style, side } = useContext(EditorContext);
  if (!product?.styles) return null;
  return (
    <div className="h-full overflow-y-auto">
      <div className="grid grid-cols-2 gap-0">
        {product?.styles.map((style) => {
          const sidePhoto =
            style?.sides?.find((side) => side.side === side.side)
              ?.imageFilePath || null;
          return (
            <button
              onClick={() => setStyle(style)}
              key={style.id}
              className="p-2 bg flex flex-col items-center justify-center text-center rounded hover:bg-gray-300"
            >
              <div className="mb-1">
                <img
                  src={sidePhoto}
                  alt={style?.name}
                  className="h-auto object-cover"
                />
              </div>
            </button>
          );
        })}
      </div>
      <hr />
    </div>
  );
};
