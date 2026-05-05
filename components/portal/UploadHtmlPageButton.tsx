'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface UploadHtmlPageButtonProps {
  siteId: number;
}

export default function UploadHtmlPageButton({ siteId }: UploadHtmlPageButtonProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/portal/cms/websites/${siteId}/posts/upload-html`, {
        method: 'POST',
        body: fd,
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        alert(`Upload failed: ${json.message || json.error || 'unknown error'}`);
        return;
      }
      router.push(`/portal/websites/${siteId}/posts/${json.data.id}/edit`);
    } catch (e) {
      alert(`Upload failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".html,.htm,.xhtml,.zip,text/html,application/zip,application/x-zip-compressed"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        title="Upload a single .html file, or a .zip containing the .html plus its sibling assets (images, CSS, fonts)."
        className="flex items-center gap-2 px-4 py-2 border border-border text-foreground rounded-lg text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
      >
        <span className="material-icons text-base">upload_file</span>
        {uploading ? 'Uploading…' : 'Upload HTML / Zip'}
      </button>
    </>
  );
}
