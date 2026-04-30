'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface UploadHtmlDeckButtonProps {
  variant?: 'primary' | 'secondary';
}

export default function UploadHtmlDeckButton({ variant = 'secondary' }: UploadHtmlDeckButtonProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/portal/tools/pitch-decks/upload-html', {
        method: 'POST',
        body: fd,
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        alert(`Upload failed: ${json.message || json.error || 'unknown error'}`);
        return;
      }
      router.push(`/portal/tools/pitch-decks/${json.data.id}`);
    } catch (e) {
      alert(`Upload failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setUploading(false);
    }
  }

  const styles =
    variant === 'primary'
      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
      : 'border border-border text-foreground hover:bg-accent';

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".html,.htm,.xhtml,text/html"
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
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${styles}`}
      >
        <span className="material-icons text-base">upload_file</span>
        {uploading ? 'Uploading…' : 'Upload HTML Deck'}
      </button>
    </>
  );
}
