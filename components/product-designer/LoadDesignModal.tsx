'use client';

import React from "react";
import { DesignRecord } from "./DesignsPage";

interface LoadDesignModalProps {
  /** Array of saved designs available to load */
  designs: DesignRecord[];
  /** Callback invoked when a design is selected to load */
  onSelect: (design: DesignRecord) => void;
  /** Callback invoked to close the modal without loading */
  onClose: () => void;
}

const LoadDesignModal: React.FC<LoadDesignModalProps> = ({
  designs = [],
  onSelect,
  onClose,
}) => {
  const list = Array.isArray(designs) ? designs : [];
  return (
    <div
      style={{ zIndex: 1000 }}
      className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50"
    >
      <div className="bg-white dark:bg-gray-800 p-6 rounded shadow-lg max-w-md w-full">
        <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
          Load Design
        </h3>
        {list.length === 0 ? (
          <p className="text-gray-700 dark:text-gray-300">No saved designs.</p>
        ) : (
          <ul className="space-y-2 max-h-60 overflow-auto">
            {list.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between p-2 border rounded"
              >
                <span className="text-gray-900 dark:text-gray-100">
                  #{d.id} — {d.name}
                </span>
                <button
                  onClick={() => onSelect(d)}
                  className="text-blue-600 hover:underline"
                  type="button"
                >
                  Load
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded"
            type="button"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoadDesignModal;
