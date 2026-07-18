'use client';

import React from "react";

export interface DesignRecord {
  id: number;
  catalog_id: number;
  name?: string | null;
  layers: any;
  style_overrides: any;
  created_at: string;
  updated_at?: string;
}

interface DesignsPageProps {
  designs: DesignRecord[];
  onEdit: (design: DesignRecord) => void;
  /** Optional callback to clone an existing design into a new one */
  onClone?: (design: DesignRecord) => void;
  /** Optional callback to close the designs page and return to editor */
  onClose?: () => void;
}

export const DesignsPage: React.FC<DesignsPageProps> = ({
  designs = [],
  onEdit,
  onClone,
  onClose,
}) => {
  const list = Array.isArray(designs) ? designs : [];
  
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Your Designs</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded transition-colors"
            type="button"
          >
            Back to Editor
          </button>
        )}
      </div>
      {list.length === 0 ? (
        <p>No designs found.</p>
      ) : (
        <div className="space-y-4">
          {list.map((d) => (
            <div
              key={d.id}
              className="border rounded-lg p-4 bg-white dark:bg-gray-800 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    {d.name || `Design #${d.id}`}
                  </h3>
                  <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    <p>Created: {formatDate(d.created_at)}</p>
                    {d.updated_at && d.updated_at !== d.created_at && (
                      <p>Updated: {formatDate(d.updated_at)}</p>
                    )}
                    <p>Catalog ID: {d.catalog_id}</p>
                  </div>
                </div>
                <div className="flex space-x-2 ml-4">
                  <button
                    onClick={() => onEdit(d)}
                    className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition-colors"
                    type="button"
                  >
                    Edit
                  </button>
                  {onClone && (
                    <button
                      onClick={() => onClone(d)}
                      className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition-colors"
                      type="button"
                    >
                      Clone
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
