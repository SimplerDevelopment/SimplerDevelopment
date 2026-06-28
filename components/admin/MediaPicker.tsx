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

interface PaginationMeta {
  limit: number;
  offset: number;
  total: number;
}

interface MediaPickerProps {
  value?: string;
  onChange: (url: string) => void;
  mimeTypeFilter?: string;
  label?: string;
  required?: boolean;
  apiEndpoint?: string;
}

const PAGE_SIZE = 24;

export default function MediaPicker({
  value,
  onChange,
  mimeTypeFilter = 'image',
  label = 'Select Media',
  required = false,
  // Default to the auth+client-scoped portal endpoint. The bare /api/media
  // route used to be unauth'd and unscoped (cross-tenant leak). Site-scoped
  // callers can override with /api/portal/cms/websites/<id>/media.
  apiEndpoint = '/api/portal/media',
}: MediaPickerProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);

  const fetchMedia = async () => {
    setLoading(true);
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
      mimeType: mimeTypeFilter,
    });
    if (search) params.append('search', search);

    const response = await fetch(`${apiEndpoint}?${params}`);
    const data = await response.json();

    if (data.success) {
      setMedia(data.data);
      const pagination = data.pagination as PaginationMeta | undefined;
      setTotal(pagination?.total ?? data.data.length);
    } else {
      setMedia([]);
      setTotal(0);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (showPicker) queueMicrotask(() => { void fetchMedia(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPicker, search, offset]);

  // Reset to first page when the search term changes.
  useEffect(() => {
    if (showPicker) queueMicrotask(() => setOffset(0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);


  const handleSelect = (url: string) => {
    onChange(url);
    setShowPicker(false);
  };

  const handleUploadComplete = () => {
    setShowUpload(false);
    setOffset(0);
    fetchMedia();
  };

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;

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
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowPicker(false)}
        >
          <div
            className="bg-card rounded-lg shadow-xl max-w-5xl w-full mx-4 max-h-[90vh] overflow-y-auto border border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-foreground">Select Media</h2>
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
                  className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <button
                  onClick={() => setShowUpload(true)}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                >
                  Upload New
                </button>
              </div>

              {loading ? (
                <div className="text-center py-12 text-muted-foreground">Loading…</div>
              ) : media.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No media found. Upload some files to get started!
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 max-h-[60vh] overflow-y-auto">
                  {media.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => handleSelect(item.url)}
                      className="cursor-pointer rounded-lg border border-border bg-card overflow-hidden hover:border-primary hover:shadow-lg transition-all text-left"
                    >
                      {item.mimeType.startsWith('image/') ? (
                        <img
                          src={item.url}
                          alt={item.alt || item.filename}
                          className="w-full h-32 object-cover"
                        />
                      ) : (
                        <div className="w-full h-32 flex items-center justify-center bg-muted">
                          <span className="material-icons text-4xl text-muted-foreground">description</span>
                        </div>
                      )}
                      <div className="p-2">
                        <p className="text-xs text-foreground truncate">{item.filename}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {total > PAGE_SIZE && (
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
                  <span className="text-xs text-muted-foreground">
                    {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!canPrev}
                      onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                      className="px-3 py-1.5 text-sm border border-border rounded-md text-foreground bg-card disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent transition-colors"
                    >
                      Previous
                    </button>
                    <span className="px-3 py-1.5 text-sm text-muted-foreground">
                      Page {page} / {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={!canNext}
                      onClick={() => setOffset(offset + PAGE_SIZE)}
                      className="px-3 py-1.5 text-sm border border-border rounded-md text-foreground bg-card disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent transition-colors"
                    >
                      Next
                    </button>
                  </div>
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
          apiEndpoint={apiEndpoint ? `${apiEndpoint.replace(/\/$/, '')}/upload` : undefined}
        />
      )}
    </div>
  );
}
