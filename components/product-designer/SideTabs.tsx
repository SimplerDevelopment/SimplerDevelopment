// @ts-nocheck
// TODO(designer): clean up types — ported from CRA, see .planning/product-designer-integration.md
'use client';

import React, { useContext, memo, useMemo, useCallback } from "react";
import EditorContext from "./EditorContext";
import { AiOutlineZoomIn, AiOutlineZoomOut } from "react-icons/ai";
import {
  BsArrowLeftCircleFill,
  BsArrowRightCircleFill,
  BsArrowUpCircleFill,
  BsArrowDownCircleFill,
} from "react-icons/bs";

export const SideTabs = memo(function SideTabs({ setZoom, setTop, setLeft }: { setZoom: any; setTop: any; setLeft: any }) {
  const { side, style, setSide, layers, setSelectedLayer, controlMode } =
    useContext(EditorContext);

  const prettyText = useMemo(() => ({
    front: "Front",
    back: "Back",
    sleeveleft: <>(L) Sleeve</>,
    sleeveright: <>(R) Sleeve</>,
  }), []);
  
  // Memoize sorted and filtered sides
  const sortedSides = useMemo(() => {
    if (!style?.sides) return [];
    return style.sides
      .sort((a, b) => {
        const priority = ["front", "back"];
        const indexA = priority.indexOf(a.side.toLowerCase());
        const indexB = priority.indexOf(b.side.toLowerCase());
        if (indexA !== -1 && indexB !== -1) {
          return indexA - indexB;
        } else if (indexA !== -1) {
          return -1;
        } else if (indexB !== -1) {
          return 1;
        }
        return a.side.localeCompare(b.side);
      })
      .filter(
        (sideOption, index, self) =>
          index === self.findIndex((s) => s.side === sideOption.side),
      );
  }, [style?.sides]);

  return (
    <div className="fixed top-1/2 right-2 -translate-y-1/2 flex flex-col gap-2 z-50">
      <small>
        <strong>Sides:</strong>
      </small>
      {sortedSides.map((sideOption, index) => (
          <div
            key={index}
            className="w-20 h-10 bg-gray-200 flex items-center justify-center cursor-pointer"
            onClick={() => {
              setSelectedLayer(null);
              setSide(sideOption);
            }}
          >
            <small>{prettyText[sideOption.side] || sideOption.side}</small>
          </div>
        ))}

      {/* Zoom and positioning controls - always available */}
      <>
          <div className="flex gap-2">
            <div
              className="w-9 h-10 bg-gray-200 flex items-center justify-center cursor-pointer text-center"
              onMouseDown={() => {
                const interval = setInterval(() => {
                  setZoom((prevZoom) => prevZoom - 0.1);
                }, 100);
                const onMouseUp = () => {
                  clearInterval(interval);
                  window.removeEventListener("mouseup", onMouseUp);
                };
                window.addEventListener("mouseup", onMouseUp);
              }}
            >
              <AiOutlineZoomOut />
            </div>
            <div
              className="w-9 h-10 bg-gray-200 flex items-center justify-center cursor-pointer text-center"
              onMouseDown={() => {
                const interval = setInterval(() => {
                  setZoom((prevZoom) => prevZoom + 0.1);
                }, 100);
                const onMouseUp = () => {
                  clearInterval(interval);
                  window.removeEventListener("mouseup", onMouseUp);
                };
                window.addEventListener("mouseup", onMouseUp);
              }}
            >
              <AiOutlineZoomIn />
            </div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div
              className="w-6 h-6 flex items-center justify-center cursor-pointer"
              onMouseDown={() => {
                const interval = setInterval(() => {
                  setTop((prevTop) => prevTop + 5);
                }, 100);
                const onMouseUp = () => {
                  clearInterval(interval);
                  window.removeEventListener("mouseup", onMouseUp);
                };
                window.addEventListener("mouseup", onMouseUp);
              }}
            >
              <BsArrowUpCircleFill size={30} />
            </div>
            <div className="flex gap-2">
              <div
                className="w-6 h-6 flex items-center justify-center cursor-pointer"
                onMouseDown={() => {
                  const interval = setInterval(() => {
                    setLeft((prevLeft) => prevLeft + 5);
                  }, 100);
                  const onMouseUp = () => {
                    clearInterval(interval);
                    window.removeEventListener("mouseup", onMouseUp);
                  };
                  window.addEventListener("mouseup", onMouseUp);
                }}
              >
                <BsArrowLeftCircleFill size={30} />
              </div>
              <div
                className="w-6 h-6 flex items-center justify-center cursor-pointer"
                onMouseDown={() => {
                  const interval = setInterval(() => {
                    setLeft((prevLeft) => prevLeft - 5);
                  }, 100);
                  const onMouseUp = () => {
                    clearInterval(interval);
                    window.removeEventListener("mouseup", onMouseUp);
                  };
                  window.addEventListener("mouseup", onMouseUp);
                }}
              >
                <BsArrowRightCircleFill size={30} />
              </div>
            </div>
            <div
              className="w-6 h-6 flex items-center justify-center cursor-pointer"
              onMouseDown={() => {
                const interval = setInterval(() => {
                  setTop((prevTop) => prevTop - 5);
                }, 100);
                const onMouseUp = () => {
                  clearInterval(interval);
                  window.removeEventListener("mouseup", onMouseUp);
                };
                window.addEventListener("mouseup", onMouseUp);
              }}
            >
              <BsArrowDownCircleFill size={30} />
            </div>
          </div>
        </>
    </div>
  );
});

// Add display name for better debugging
SideTabs.displayName = 'SideTabs';
