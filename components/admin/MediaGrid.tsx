'use client';

import { useState } from 'react';
import { formatBytes } from '@/lib/utils/bytes';
import MediaDetailModal from './MediaDetailModal';

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

interface MediaGridProps {
  media: MediaItem[];
  onUpdate: () => void;
}

export default function MediaGrid({ media, onUpdate }: MediaGridProps) {
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);

  const renderThumbnail = (item: MediaItem) => {
    if (item.mimeType.startsWith('image/')) {
      return (
        <img
          src={item.url}
          alt={item.alt || item.filename}
          className="w-full h-48 object-cover"
        />
      );
    } else if (item.mimeType.startsWith('video/')) {
      return (
        <video src={item.url} className="w-full h-48 object-cover" />
      );
    } else {
      return (
        <div className="w-full h-48 flex items-center justify-center bg-muted">
          <span className="material-icons text-6xl text-muted-foreground">description</span>
        </div>
      );
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {media.map((item) => (
          <div
            key={item.id}
            onClick={() => setSelectedMedia(item)}
            className="bg-card border border-border rounded-lg shadow overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
          >
            {renderThumbnail(item)}
            <div className="p-3">
              <p className="text-sm font-medium text-foreground truncate">
                {item.filename}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {formatBytes(item.fileSize)}
              </p>
              {item.width && item.height && (
                <p className="text-xs text-muted-foreground">
                  {item.width} × {item.height}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {media.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No media found. Upload some files to get started!
        </div>
      )}

      {selectedMedia && (
        <MediaDetailModal
          media={selectedMedia}
          onClose={() => setSelectedMedia(null)}
          onUpdate={onUpdate}
        />
      )}
    </>
  );
}
