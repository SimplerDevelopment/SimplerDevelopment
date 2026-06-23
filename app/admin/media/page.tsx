'use client';

import { useState, useEffect } from 'react';
import MediaGrid from '@/components/admin/MediaGrid';
import MediaUploadModal from '@/components/admin/MediaUploadModal';

interface MediaItem {
  id: number;
  filename: string;
  url: string;
  mimeType: string;
  fileSize: number;
  width?: number | null;
  height?: number | null;
  alt?: string | null;
  caption?: string | null;
  createdAt: string;
}

export default function MediaLibraryPage() {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const limit = 20;

  useEffect(() => {
    fetchMedia();
  }, [search, filter, offset]);

  const fetchMedia = async () => {
    setLoading(true);
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    });

    if (search) params.append('search', search);
    if (filter !== 'all') params.append('mimeType', filter);

    const response = await fetch(`/api/media?${params}`);
    const data = await response.json();

    if (data.success) {
      setMedia(data.data);
      setTotal(data.pagination.total);
    }
    setLoading(false);
  };

  const handleUploadComplete = () => {
    setShowUpload(false);
    fetchMedia();
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-foreground">Media Library</h1>
          <button
            onClick={() => setShowUpload(true)}
            className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90"
          >
            Upload Media
          </button>
        </div>

        {/* Filters */}
        <div className="bg-card border border-border p-4 rounded-lg shadow space-y-4">
          <input
            type="text"
            placeholder="Search by filename, alt text, or caption..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
            className="block w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
          />

          <div className="flex gap-2">
            {['all', 'image', 'video', 'application'].map((type) => (
              <button
                key={type}
                onClick={() => {
                  setFilter(type);
                  setOffset(0);
                }}
                className={`px-4 py-2 text-sm rounded-md ${
                  filter === type
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground hover:bg-muted/80'
                }`}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Media Grid */}
        {loading ? (
          <div className="text-center py-12">Loading...</div>
        ) : (
          <MediaGrid media={media} onUpdate={fetchMedia} />
        )}

        {/* Pagination */}
        {total > limit && (
          <div className="flex justify-center gap-2">
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
              className="px-4 py-2 text-sm border border-border rounded-md disabled:opacity-50 hover:bg-accent"
            >
              Previous
            </button>
            <span className="px-4 py-2 text-sm">
              {offset + 1} - {Math.min(offset + limit, total)} of {total}
            </span>
            <button
              disabled={offset + limit >= total}
              onClick={() => setOffset(offset + limit)}
              className="px-4 py-2 text-sm border border-border rounded-md disabled:opacity-50 hover:bg-accent"
            >
              Next
            </button>
          </div>
        )}

        {showUpload && (
          <MediaUploadModal
            onClose={() => setShowUpload(false)}
            onComplete={handleUploadComplete}
          />
        )}
      </div>
    </main>
  );
}
