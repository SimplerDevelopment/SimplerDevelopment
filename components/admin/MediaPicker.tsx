'use client';

import { useState, useEffect } from 'react';
import MediaUploadModal from './MediaUploadModal';

interface MediaItem {
  id: number;
  filename: string;
  url: string;
  mimeType: string;
  alt?: string | null;
}

interface MediaPickerProps {
  value?: string;
  onChange: (url: string) => void;
  mimeTypeFilter?: string;
  label?: string;
  required?: boolean;
  apiEndpoint?: string;
}

export default function MediaPicker({
  value,
  onChange,
  mimeTypeFilter = 'image',
  label = 'Select Media',
  required = false,
  apiEndpoint = '/api/media',
}: MediaPickerProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (showPicker) {
      fetchMedia();
    }
  }, [showPicker, search]);

  const fetchMedia = async () => {
    setLoading(true);
    const params = new URLSearchParams({
      limit: '50',
      mimeType: mimeTypeFilter,
    });
    if (search) params.append('search', search);

    const response = await fetch(`${apiEndpoint}?${params}`);
    const data = await response.json();

    if (data.success) {
      setMedia(data.data);
    }
    setLoading(false);
  };

  const handleSelect = (url: string) => {
    onChange(url);
    setShowPicker(false);
  };

  const handleUploadComplete = () => {
    setShowUpload(false);
    fetchMedia();
  };

  return (
    <div>
      <label className="block text-sm font-medium text-foreground">
        {label} {required && '*'}
      </label>

      {value ? (
        <div className="mt-2 relative">
          {mimeTypeFilter === 'image' && (
            <img
              src={value}
              alt="Selected"
              className="max-w-xs rounded-md border border-border"
            />
          )}
          {mimeTypeFilter !== 'image' && (
            <div className="p-4 bg-muted rounded-md border border-border">
              <p className="text-sm text-foreground truncate">{value}</p>
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Change
            </button>
            <button
              type="button"
              onClick={() => onChange('')}
              className="px-3 py-1 text-sm bg-card border border-border rounded-md hover:bg-accent"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowPicker(true)}
          className="mt-1 block w-full rounded-md border-2 border-dashed border-border px-6 py-8 text-center hover:border-primary/50"
        >
          <span className="text-sm text-muted-foreground">Click to select media</span>
        </button>
      )}

      {/* Picker Modal */}
      {showPicker && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-5xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 space-y-4 bg-white dark:bg-gray-900">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-foreground">
                  Select Media
                </h2>
                <button
                  onClick={() => setShowPicker(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <span className="material-icons">close</span>
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-foreground"
                />
                <button
                  onClick={() => setShowUpload(true)}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                >
                  Upload New
                </button>
              </div>

              {loading ? (
                <div className="text-center py-12">Loading...</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 max-h-96 overflow-y-auto">
                  {media.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleSelect(item.url)}
                      className="cursor-pointer rounded-lg border border-border overflow-hidden hover:border-primary hover:shadow-lg transition-all bg-white dark:bg-gray-800"
                    >
                      {item.mimeType.startsWith('image/') ? (
                        <img
                          src={item.url}
                          alt={item.alt || item.filename}
                          className="w-full h-32 object-cover"
                        />
                      ) : (
                        <div className="w-full h-32 flex items-center justify-center bg-gray-100 dark:bg-gray-700">
                          <span className="material-icons text-4xl text-muted-foreground">description</span>
                        </div>
                      )}
                      <div className="p-2 bg-white dark:bg-gray-800">
                        <p className="text-xs truncate">{item.filename}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {media.length === 0 && !loading && (
                <div className="text-center py-12 text-muted-foreground">
                  No media found. Upload some files to get started!
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showUpload && (
        <MediaUploadModal
          onClose={() => setShowUpload(false)}
          onComplete={handleUploadComplete}
        />
      )}
    </div>
  );
}
