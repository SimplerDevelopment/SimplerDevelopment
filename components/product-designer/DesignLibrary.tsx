'use client';

import React, { useState, useEffect, useContext } from 'react';
import { DesignApi, type Design } from './utils/designApi';
import { EditorContext } from './EditorContext';
import { BsTrash, BsShare, BsCopy, BsImage } from 'react-icons/bs';

interface DesignLibraryProps {
  onClose: () => void;
  onSelectDesign: (design: Design) => void;
}

export const DesignLibrary: React.FC<DesignLibraryProps> = ({ onClose, onSelectDesign }) => {
  const [designs, setDesigns] = useState<Design[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { createNewDesign } = useContext(EditorContext);

  useEffect(() => {
    loadDesigns();
  }, []);

  const loadDesigns = async () => {
    try {
      setLoading(true);
      const userDesigns = await DesignApi.getDesigns();
      setDesigns(userDesigns);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load designs');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDesign = async (designId: number) => {
    if (!confirm('Are you sure you want to delete this design?')) return;

    try {
      await DesignApi.deleteDesign(designId);
      setDesigns(prev => prev.filter(d => d.id !== designId));
    } catch (err) {
      alert('Failed to delete design');
    }
  };

  const handleCloneDesign = async (design: Design) => {
    try {
      const clonedDesign = await DesignApi.cloneDesign(design.id, `${design.name} (Copy)`);
      setDesigns(prev => [clonedDesign, ...prev]);
    } catch (err) {
      alert('Failed to clone design');
    }
  };

  const handleShareDesign = async (design: Design) => {
    try {
      const result = await DesignApi.shareDesign(design.id, true);
      navigator.clipboard.writeText(result.shareableUrl);
      alert('Shareable link copied to clipboard!');
    } catch (err) {
      alert('Failed to generate shareable link');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-4xl w-full mx-4 max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Design Library
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => {
                createNewDesign();
                onClose();
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              New Design
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-80px)]">
          {loading && (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <p className="text-red-600 dark:text-red-400">{error}</p>
              <button
                onClick={loadDesigns}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Try Again
              </button>
            </div>
          )}

          {!loading && !error && designs.length === 0 && (
            <div className="text-center py-8">
              <BsImage className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                No designs yet
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Create your first design to get started!
              </p>
              <button
                onClick={() => {
                  createNewDesign();
                  onClose();
                }}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Create Design
              </button>
            </div>
          )}

          {!loading && !error && designs.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {designs.map((design) => (
                <div
                  key={design.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => onSelectDesign(design)}
                >
                  {/* Thumbnail */}
                  <div className="h-32 bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                    {design.thumbnailUrl ? (
                      <img
                        src={design.thumbnailUrl}
                        alt={design.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <BsImage className="w-8 h-8 text-gray-400" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">
                      {design.name}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Updated {formatDate(design.updatedAt)}
                    </p>
                    
                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCloneDesign(design);
                        }}
                        className="p-1.5 text-gray-600 hover:text-blue-600 transition-colors"
                        title="Clone design"
                      >
                        <BsCopy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleShareDesign(design);
                        }}
                        className="p-1.5 text-gray-600 hover:text-green-600 transition-colors"
                        title="Share design"
                      >
                        <BsShare className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDesign(design.id);
                        }}
                        className="p-1.5 text-gray-600 hover:text-red-600 transition-colors"
                        title="Delete design"
                      >
                        <BsTrash className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DesignLibrary;