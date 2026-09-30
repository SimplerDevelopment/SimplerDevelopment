'use client';

import { useState, useEffect, useRef } from 'react';
import { formatBytes } from '@/lib/utils/bytes';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost, pInput, pSelect, sBtn } from '@/components/portal/portal-ui';
import { useFeatureFlag } from '@/components/portal/FeatureFlagsProvider';
import MediaFilterColumn from '@/components/portal/media/MediaFilterColumn';
import MediaUsedOn from '@/components/portal/media/MediaUsedOn';
import { MediaDetail } from '@/components/portal/media/MediaDetail';
import { MediaUploadDialog } from '@/components/portal/media/MediaUploadDialog';
import type { MediaItem, MediaVersionEntry, BrandingProfileOption } from '@/components/portal/media/types';

// PUX-188: the tile class as a const so the flag-off className string stays byte-identical.
const TILE = "bg-card border border-border rounded-2xl overflow-hidden cursor-pointer hover:shadow-lg hover:border-primary/40 transition-all group";

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
  const studio = useFeatureFlag('portal-redesign');
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

  const detailProps = { onClose: () => setDetail(null), editMode, setEditMode, editAlt, setEditAlt, editCaption, setEditCaption, savingDetail, handleSaveDetail, copyUrl, replaceInputRef, replacing, handleReplaceFile, handleDeleteMedia, versionsOpen, setVersionsOpen, versions, loadVersions, handleRestoreVersion };

  const gridAndPaging = (
    <>
      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
        </div>
      ) : media.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-12 text-center">
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
              className={studio && detail?.id === item.id ? `${TILE} ring-2 ring-primary` : TILE}
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
            className={`${pBtnGhost} text-sm px-3 py-1.5`}
          >
            Previous
          </button>
          <span className="text-xs text-muted-foreground">
            {offset + 1}–{Math.min(offset + limit, total)} of {total}
          </span>
          <button
            disabled={offset + limit >= total}
            onClick={() => setOffset(offset + limit)}
            className={`${pBtnGhost} text-sm px-3 py-1.5`}
          >
            Next
          </button>
        </div>
      )}

    </>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <PortalPageHeader
        eyebrow="Media"
        title="Media Library"
        subtitle="Upload and manage images, videos, and documents across all services."
        actions={
          <button
            onClick={() => setShowUpload(true)}
            className={studio ? sBtn : pBtnPrimary}
          >
            <span className="material-icons text-base">cloud_upload</span>
            Upload
          </button>
        }
      />

      {studio ? (
        <div className={`grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)] ${detail ? 'xl:grid-cols-[200px_minmax(0,1fr)_320px]' : ''}`}>
          <MediaFilterColumn
            search={search} setSearch={(v) => { setSearch(v); setOffset(0); }}
            filter={filter} setFilter={(v) => { setFilter(v); setOffset(0); }}
            profileFilter={profileFilter} setProfileFilter={(v) => { setProfileFilter(v); setOffset(0); }}
            brandingProfiles={brandingProfiles} total={total}
          />
          <div className="space-y-6">{gridAndPaging}</div>
          {detail && <MediaDetail detail={detail} variant="panel" extra={<MediaUsedOn key={detail.id} mediaId={detail.id} />} {...detailProps} />}
        </div>
      ) : (
        <>
      {/* Filters */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <input
          type="text"
          placeholder="Search by filename, alt text, or caption..."
          value={search}
          onChange={e => { setSearch(e.target.value); setOffset(0); }}
          className={pInput}
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
              className={`ml-auto ${pSelect}`}
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

          {gridAndPaging}
        </>
      )}

      {/* Upload modal */}
      {showUpload && (
        <MediaUploadDialog
          onClose={() => setShowUpload(false)}
          dragActive={dragActive}
          handleDrag={handleDrag}
          handleDrop={handleDrop}
          fileInputRef={fileInputRef}
          preview={preview}
          selectedFile={selectedFile}
          selectFile={selectFile}
          brandingProfiles={brandingProfiles}
          uploadProfileId={uploadProfileId}
          setUploadProfileId={setUploadProfileId}
          uploadAlt={uploadAlt}
          setUploadAlt={setUploadAlt}
          uploadCaption={uploadCaption}
          setUploadCaption={setUploadCaption}
          uploading={uploading}
          handleUpload={handleUpload}
        />
      )}

      {/* Detail modal */}
      {!studio && detail && <MediaDetail detail={detail} {...detailProps} />}
    </div>
  );
}
