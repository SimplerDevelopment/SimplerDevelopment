'use client';

import { useState, useEffect, useRef } from 'react';
import { formatBytes } from '@/lib/utils/bytes';

interface MediaItem {
  id: number;
  filename: string;
  url: string;
  // Smaller derivative used for grid renders. E2 perf — when present, the
  // grid <img> prefers thumbnailUrl over the full url to avoid downloading
  // multi-MB originals for h-40 tiles.
  thumbnailUrl?: string | null;
  mimeType: string;
  fileSize: number;
  width?: number | null;
  height?: number | null;
  alt?: string | null;
  caption?: string | null;
  brandingProfileId?: number | null;
  brandingProfileName?: string | null;
  version?: number;
  createdAt: string;
}

interface MediaVersionEntry {
  id: number;
  version: number;
  filename: string;
  url: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
}

interface BrandingProfileOption {
  id: number;
  name: string;
}


export default function PortalMediaPage() {
  const base = '/api/portal/media';

  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [profileFilter, setProfileFilter] = useState('');
  const [brandingProfiles, setBrandingProfiles] = useState<BrandingProfileOption[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const limit = 20;

  // Upload state
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadAlt, setUploadAlt] = useState('');
  const [uploadCaption, setUploadCaption] = useState('');
  const [uploadProfileId, setUploadProfileId] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Detail state
  const [detail, setDetail] = useState<MediaItem | null>(null);
  const [editAlt, setEditAlt] = useState('');
  const [editCaption, setEditCaption] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [savingDetail, setSavingDetail] = useState(false);

  // Versioning state
  const [versions, setVersions] = useState<MediaVersionEntry[]>([]);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (search) params.append('search', search);
    if (filter !== 'all') params.append('mimeType', filter);
    if (profileFilter) params.append('brandingProfileId', profileFilter);

    fetch(`${base}?${params}`)
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          setMedia(res.data);
          setTotal(res.pagination.total);
          if (res.brandingProfiles) setBrandingProfiles(res.brandingProfiles);
        }
      })
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() is reused by upload/delete handlers; setLoading(true) is synchronous by design and does not cause render cascades
  useEffect(() => { load(); }, [search, filter, profileFilter, offset]);

  // Upload handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) selectFile(e.dataTransfer.files[0]);
  };

  const selectFile = (file: File) => {
    setSelectedFile(file);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setPreview(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', selectedFile);
    if (uploadAlt) fd.append('alt', uploadAlt);
    if (uploadCaption) fd.append('caption', uploadCaption);
    if (uploadProfileId) fd.append('brandingProfileId', uploadProfileId);

    try {
      const res = await fetch(`${base}/upload`, { method: 'POST', body: fd });
      if (res.ok) {
        setShowUpload(false);
        setSelectedFile(null);
        setPreview(null);
        setUploadAlt('');
        setUploadCaption('');
        setUploadProfileId('');
        load();
      } else {
        const data = await res.json();
        alert(data.message || 'Upload failed');
      }
    } catch {
      alert('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // Detail handlers
  const openDetail = (item: MediaItem) => {
    setDetail(item);
    setEditAlt(item.alt || '');
    setEditCaption(item.caption || '');
    setEditMode(false);
    setVersions([]);
    setVersionsOpen(false);
  };

  const loadVersions = async (mediaId: number) => {
    const res = await fetch(`${base}/${mediaId}/versions`);
    if (!res.ok) return;
    const json = await res.json();
    if (json.success) {
      setVersions(json.data.history);
      if (detail && json.data.current) {
        setDetail({ ...detail, version: json.data.current.version });
      }
    }
  };

  const handleReplaceFile = async (file: File) => {
    if (!detail) return;
    setReplacing(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${base}/${detail.id}/replace`, { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.success) {
        alert(json.message || 'Replace failed');
        return;
      }
      setDetail({
        ...detail,
        filename: json.data.filename,
        url: json.data.url,
        fileSize: json.data.fileSize,
        version: json.data.version,
      });
      if (versionsOpen) await loadVersions(detail.id);
      load();
    } finally {
      setReplacing(false);
    }
  };

  const handleRestoreVersion = async (versionId: number) => {
    if (!detail) return;
    if (!confirm('Restore this version? The current file will be moved into history.')) return;
    const res = await fetch(`${base}/${detail.id}/versions/${versionId}/restore`, { method: 'POST' });
    if (!res.ok) {
      alert('Restore failed');
      return;
    }
    const json = await res.json();
    if (json.success) {
      setDetail({
        ...detail,
        filename: json.data.filename,
        url: json.data.url,
        fileSize: json.data.fileSize,
        mimeType: json.data.mimeType,
        version: json.data.version,
      });
      await loadVersions(detail.id);
      load();
    }
  };

  const handleSaveDetail = async () => {
    if (!detail) return;
    setSavingDetail(true);
    try {
      const res = await fetch(`${base}/${detail.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alt: editAlt, caption: editCaption }),
      });
      if (res.ok) {
        setEditMode(false);
        load();
      }
    } finally {
      setSavingDetail(false);
    }
  };

  const handleDeleteMedia = async () => {
    if (!detail || !confirm('Delete this file?')) return;
    await fetch(`${base}/${detail.id}`, { method: 'DELETE' });
    setDetail(null);
    load();
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Media Library</h1>
          <p className="text-muted-foreground text-sm mt-1">Upload and manage images, videos, and documents across all services.</p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <span className="material-icons text-base">cloud_upload</span>
          Upload
        </button>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <input
          type="text"
          placeholder="Search by filename, alt text, or caption..."
          value={search}
          onChange={e => { setSearch(e.target.value); setOffset(0); }}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <div className="flex gap-2 flex-wrap items-center">
          {['all', 'image', 'video', 'application'].map(type => (
            <button
              key={type}
              onClick={() => { setFilter(type); setOffset(0); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                filter === type
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-accent text-muted-foreground hover:text-foreground'
              }`}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
          {brandingProfiles.length > 0 && (
            <select
              value={profileFilter}
              onChange={e => { setProfileFilter(e.target.value); setOffset(0); }}
              className="ml-auto px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="">All Brands</option>
              {brandingProfiles.map(p => (
                <option key={p.id} value={String(p.id)}>{p.name}</option>
              ))}
              <option value="unassigned">Unassigned</option>
            </select>
          )}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
        </div>
      ) : media.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <span className="material-icons text-4xl text-muted-foreground/40">perm_media</span>
          <p className="text-sm text-muted-foreground mt-2">
            {search || filter !== 'all' || profileFilter ? 'No media matches your filters.' : 'No media yet. Upload your first file.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {media.map(item => (
            <div
              key={item.id}
              onClick={() => openDetail(item)}
              className="bg-card border border-border rounded-xl overflow-hidden cursor-pointer hover:shadow-lg hover:border-primary/40 transition-all group"
            >
              {item.mimeType.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element -- grid thumbnail; we prefer manual <img> + lazy over next/image to avoid layout cost
                <img
                  src={item.thumbnailUrl ?? item.url}
                  alt={item.alt || item.filename}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-40 object-cover"
                />
              ) : item.mimeType.startsWith('video/') ? (
                <div className="w-full h-40 bg-muted flex items-center justify-center">
                  <span className="material-icons text-4xl text-muted-foreground">videocam</span>
                </div>
              ) : (
                <div className="w-full h-40 bg-muted flex items-center justify-center">
                  <span className="material-icons text-4xl text-muted-foreground">description</span>
                </div>
              )}
              <div className="p-3">
                <p className="text-xs font-medium text-foreground truncate">{item.filename}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatBytes(item.fileSize)}
                  {item.width && item.height ? ` · ${item.width}x${item.height}` : ''}
                </p>
                {item.brandingProfileName && (
                  <p className="text-[10px] text-muted-foreground mt-1 truncate">
                    <span className="material-icons text-[10px] align-middle mr-0.5">palette</span>
                    {item.brandingProfileName}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div className="flex justify-center items-center gap-3">
          <button
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
            className="px-3 py-1.5 text-sm border border-border rounded-lg disabled:opacity-40 hover:bg-accent transition-colors"
          >
            Previous
          </button>
          <span className="text-xs text-muted-foreground">
            {offset + 1}–{Math.min(offset + limit, total)} of {total}
          </span>
          <button
            disabled={offset + limit >= total}
            onClick={() => setOffset(offset + limit)}
            className="px-3 py-1.5 text-sm border border-border rounded-lg disabled:opacity-40 hover:bg-accent transition-colors"
          >
            Next
          </button>
        </div>
      )}

      {/* Upload modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowUpload(false)}>
          <div className="bg-card rounded-xl shadow-2xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">Upload Media</h2>
                <button onClick={() => setShowUpload(false)} className="text-muted-foreground hover:text-foreground">
                  <span className="material-icons">close</span>
                </button>
              </div>

              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  dragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                }`}
              >
                <input ref={fileInputRef} type="file" className="hidden" onChange={e => e.target.files?.[0] && selectFile(e.target.files[0])} />
                {preview ? (
                  <img src={preview} alt="Preview" className="max-h-40 mx-auto rounded-lg" />
                ) : (
                  <>
                    <span className="material-icons text-4xl text-muted-foreground">cloud_upload</span>
                    <p className="text-sm font-medium text-foreground mt-2">
                      {selectedFile ? selectedFile.name : 'Drop files here or click to browse'}
                    </p>
                    {!selectedFile && <p className="text-xs text-muted-foreground mt-1">Images, videos, and documents</p>}
                  </>
                )}
              </div>

              {selectedFile && (
                <>
                  {brandingProfiles.length > 0 && (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">Brand</label>
                      <select
                        value={uploadProfileId}
                        onChange={e => setUploadProfileId(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      >
                        <option value="">No brand assigned</option>
                        {brandingProfiles.map(p => (
                          <option key={p.id} value={String(p.id)}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Alt Text</label>
                    <input
                      value={uploadAlt}
                      onChange={e => setUploadAlt(e.target.value)}
                      placeholder="Describe the image"
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Caption</label>
                    <textarea
                      value={uploadCaption}
                      onChange={e => setUploadCaption(e.target.value)}
                      rows={2}
                      placeholder="Optional caption"
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleUpload}
                      disabled={uploading}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      {uploading && <span className="material-icons text-base animate-spin">refresh</span>}
                      {uploading ? 'Uploading...' : 'Upload'}
                    </button>
                    <button
                      onClick={() => setShowUpload(false)}
                      className="px-4 py-2.5 text-sm font-medium text-foreground border border-border rounded-lg hover:bg-accent transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDetail(null)}>
          <div className="bg-card rounded-xl shadow-2xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">Media Details</h2>
                <button onClick={() => setDetail(null)} className="text-muted-foreground hover:text-foreground">
                  <span className="material-icons">close</span>
                </button>
              </div>

              <div className="bg-muted rounded-xl p-4 flex items-center justify-center">
                {detail.mimeType.startsWith('image/') ? (
                  <img src={detail.url} alt={detail.alt || detail.filename} className="max-h-80 rounded-lg" />
                ) : detail.mimeType.startsWith('video/') ? (
                  <video src={detail.url} controls className="max-h-80 rounded-lg" />
                ) : (
                  <span className="material-icons text-6xl text-muted-foreground">description</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <div><span className="font-medium">Filename:</span> {detail.filename}</div>
                <div><span className="font-medium">Type:</span> {detail.mimeType}</div>
                <div><span className="font-medium">Size:</span> {formatBytes(detail.fileSize)}</div>
                {detail.width && detail.height && <div><span className="font-medium">Dimensions:</span> {detail.width} x {detail.height}</div>}
                <div><span className="font-medium">Uploaded:</span> {new Date(detail.createdAt).toLocaleDateString()}</div>
                {detail.brandingProfileName && <div><span className="font-medium">Brand:</span> {detail.brandingProfileName}</div>}
              </div>

              {editMode ? (
                <div className="space-y-3 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Alt Text</label>
                    <input
                      value={editAlt}
                      onChange={e => setEditAlt(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Caption</label>
                    <textarea
                      value={editCaption}
                      onChange={e => setEditCaption(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveDetail}
                      disabled={savingDetail}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      {savingDetail ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={() => setEditMode(false)}
                      className="px-4 py-2 text-sm text-foreground border border-border rounded-lg hover:bg-accent transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1 text-sm">
                  {detail.alt && <p><span className="font-medium">Alt:</span> {detail.alt}</p>}
                  {detail.caption && <p><span className="font-medium">Caption:</span> {detail.caption}</p>}
                </div>
              )}

              <div className="flex gap-2 pt-3 border-t border-border flex-wrap">
                <input
                  ref={replaceInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleReplaceFile(f);
                    if (replaceInputRef.current) replaceInputRef.current.value = '';
                  }}
                />
                <button
                  onClick={() => copyUrl(detail.url)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <span className="material-icons text-base">content_copy</span>
                  Copy URL
                </button>
                <button
                  onClick={() => replaceInputRef.current?.click()}
                  disabled={replacing}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm text-foreground border border-border rounded-lg hover:bg-accent disabled:opacity-50 transition-colors"
                >
                  <span className="material-icons text-base">{replacing ? 'refresh' : 'upload_file'}</span>
                  {replacing ? 'Replacing…' : 'Replace File'}
                </button>
                {!editMode && (
                  <button
                    onClick={() => setEditMode(true)}
                    className="px-4 py-2 text-sm text-foreground border border-border rounded-lg hover:bg-accent transition-colors"
                  >
                    Edit Metadata
                  </button>
                )}
                <button
                  onClick={handleDeleteMedia}
                  className="ml-auto px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20 transition-colors"
                >
                  Delete
                </button>
              </div>

              <div className="pt-3 border-t border-border">
                <button
                  onClick={() => {
                    const next = !versionsOpen;
                    setVersionsOpen(next);
                    if (next) loadVersions(detail.id);
                  }}
                  className="flex items-center gap-1.5 text-sm text-foreground hover:text-primary transition-colors"
                >
                  <span className="material-icons text-base">{versionsOpen ? 'expand_less' : 'expand_more'}</span>
                  Version history{detail.version ? ` (current: v${detail.version})` : ''}
                </button>
                {versionsOpen && (
                  <div className="mt-3 space-y-2">
                    {versions.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No prior versions yet. Replace the file to start a history.</p>
                    ) : (
                      versions.map((v) => (
                        <div key={v.id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border bg-background">
                          <span className="material-icons text-base text-muted-foreground">history</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">v{v.version} · {v.filename}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatBytes(v.fileSize)} · {new Date(v.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <a
                            href={v.url}
                            target="_blank"
                            rel="noopener"
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            View
                          </a>
                          <button
                            onClick={() => handleRestoreVersion(v.id)}
                            className="text-xs px-2 py-1 rounded border border-border hover:bg-accent transition-colors"
                          >
                            Restore
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
