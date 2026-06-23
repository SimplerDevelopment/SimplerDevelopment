'use client';

import { useState, useEffect } from 'react';
import { formatBytes } from '@/lib/utils/bytes';

interface ProjectFile {
  id: number;
  originalName: string;
  mimeType: string;
  fileSize: number;
  url: string;
  commentId: number | null;
  userId: number | null;
  userName: string | null;
  cardId: number;
  cardTitle: string;
  createdAt: string;
}

function FileCard({ file }: { file: ProjectFile }) {
  const isImage = file.mimeType.startsWith('image/');
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/40 transition-colors">
      <a href={file.url} target="_blank" rel="noopener noreferrer" className="block">
        {isImage ? (
          <img src={file.url} alt={file.originalName} className="w-full h-32 object-cover bg-muted" />
        ) : (
          <div className="w-full h-32 flex items-center justify-center bg-muted">
            <span className="material-icons text-4xl text-muted-foreground">
              {file.mimeType === 'application/pdf' ? 'picture_as_pdf' : 'insert_drive_file'}
            </span>
          </div>
        )}
      </a>
      <div className="p-2.5 space-y-1">
        <p className="text-xs font-medium text-foreground truncate" title={file.originalName}>
          {file.originalName}
        </p>
        <p className="text-xs text-muted-foreground">{formatBytes(file.fileSize)}</p>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="material-icons text-xs">sticky_note_2</span>
          <span className="truncate" title={file.cardTitle}>{file.cardTitle}</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="material-icons text-xs">person</span>
          <span>{file.userName ?? 'Unknown'}</span>
          {file.commentId && (
            <span className="ml-auto bg-muted px-1.5 py-0.5 rounded text-xs">comment</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProjectFilesTab({ projectId }: { projectId: number }) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetch(`/api/portal/projects/${projectId}/files`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.success) setFiles(data.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  const filtered = query
    ? files.filter(f =>
        f.originalName.toLowerCase().includes(query.toLowerCase()) ||
        f.cardTitle?.toLowerCase().includes(query.toLowerCase()) ||
        (f.userName ?? '').toLowerCase().includes(query.toLowerCase()),
      )
    : files;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="material-icons text-4xl text-muted-foreground animate-spin">refresh</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-base">search</span>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by filename, card, or uploader…"
          className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <span className="material-icons text-5xl text-muted-foreground">folder_open</span>
          <h3 className="mt-4 font-semibold text-foreground">
            {query ? 'No files match your search' : 'No files yet'}
          </h3>
          {!query && (
            <p className="mt-2 text-sm text-muted-foreground">
              Files attached to cards will appear here.
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{filtered.length} file{filtered.length !== 1 ? 's' : ''}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filtered.map(file => <FileCard key={file.id} file={file} />)}
          </div>
        </>
      )}
    </div>
  );
}
