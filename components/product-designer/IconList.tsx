'use client';

import React, { useContext, useState } from "react";
import EditorContext from "./EditorContext";

// Replaced react-window with a plain paginated grid. Caps the rendered
// icons at PAGE_SIZE * pages and offers a "Load more" button.
// TODO(designer): swap back in react-window when the icon list grows
// past a few hundred entries.
const PAGE_SIZE = 200;

export const IconList = ({ iconSets, search }: { iconSets: Record<string, any>; search: string }) => {
  const { addLayer } = useContext(EditorContext);
  const [shown, setShown] = useState(PAGE_SIZE);

  const filteredIcons = Object.keys(iconSets).filter((icon) =>
    icon.toLowerCase().includes((search || "").toLowerCase()),
  );

  const visible = filteredIcons.slice(0, shown);

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 p-2">
        {visible.map((icon) => {
          const Icon = iconSets[icon];
          if (!Icon) return null;
          return (
            <button
              key={icon}
              onClick={() =>
                addLayer({
                  type: "icon",
                  icon: Icon,
                  iconName: icon,
                  name: icon,
                  position: { x: 20, y: -300 },
                  size: 150,
                  rotation: 0,
                  color: "#000",
                  font: "Arial",
                })
              }
              className="p-4 rounded-lg flex flex-col items-center transition-transform duration-200"
              onMouseEnter={(e) =>
                (e.currentTarget.style.transform = "scale(1.05)")
              }
              onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              <Icon color="black" size={70} />
            </button>
          );
        })}
      </div>
      {shown < filteredIcons.length && (
        <div className="flex justify-center p-2">
          <button
            onClick={() => setShown((s) => s + PAGE_SIZE)}
            className="px-3 py-1 rounded border border-gray-300 text-sm hover:bg-gray-100"
          >
            Load more ({filteredIcons.length - shown} remaining)
          </button>
        </div>
      )}
    </div>
  );
};
