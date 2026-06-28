'use client';

import React, { useContext } from "react";
import { EditorContext } from "./EditorContext";
import type { LayerData } from "./designerTypes";

const prettyText: Record<string, React.ReactNode> = {
  front: "Front",
  back: "Back",
  sleeveleft: <>(L) Sleeve</>,
  sleeveright: <>(R) Sleeve</>,
};
export const Tabs = ({ sides, setCurrentSide, currentSide, layers }: {
  sides: string[];
  setCurrentSide: (side: string) => void;
  currentSide: string;
  layers: LayerData[];
}) => {
  const { setSide, style } = useContext(EditorContext);
  const sortedSides = [
    ...["front", "back"].filter((side) => sides.includes(side)),
    ...sides.filter((side) => side !== "front" && side !== "back").sort(),
  ];

  return (
    <div className="flex space-x-1 mb-4">
      {sortedSides.map((side: string) => {
        const sideLayerCount = layers.filter(
          (layer) => layer.side === side,
        ).length;
        return (
          <button
            key={side}
            onClick={() => {
              setCurrentSide(side);
              const nSide = style.sides.find((s) => s.side === side);
              if (nSide) {
                setSide(nSide);
              }
            }}
            className={`py-2 px-2 rounded ${
              currentSide === side
                ? "bg-blue-500 text-white"
                : "bg-gray-200 text-black"
            }`}
          >
            {prettyText[side]}{" "}
            {sideLayerCount > 0 && (
              <span className="text-xs bg-gray-300 rounded-full px-1 ml-1">
                ( {sideLayerCount} )
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
