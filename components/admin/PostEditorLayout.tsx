'use client';

import Link from 'next/link';

interface PostEditorLayoutProps {
  children: React.ReactNode;
  postTitle: string;
  onOpenSettings: () => void;
  editorControls: React.ReactNode;
  published: boolean;
  onPublish: () => void;
  onStatusChange: (status: 'draft' | 'published') => void;
}

export function PostEditorLayout({ children, postTitle, onOpenSettings, editorControls, published, onPublish, onStatusChange }: PostEditorLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Custom Navigation for Post Editor */}
      <nav className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4">
          {/* First Row: Back button and Title */}
          <div className="flex h-12 items-center gap-3 border-b border-border/50">
            <Link
              href="/admin/posts"
              className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-accent transition-colors"
              title="Back to Posts"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </Link>

            <h1 className="text-xl font-bold font-heading truncate" data-post-title>
              {postTitle || 'New Post'}
            </h1>
          </div>

          {/* Second Row: Settings, Publish, Status, and Editor Controls */}
          <div className="flex h-14 items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* Edit Details Button */}
              <button
                type="button"
                onClick={onOpenSettings}
                className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-border hover:bg-accent transition-colors"
                title="Edit Post Details"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
                Edit Details
              </button>

              {/* Status Dropdown */}
              <select
                value={published ? 'published' : 'draft'}
                onChange={(e) => onStatusChange(e.target.value as 'draft' | 'published')}
                className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-accent transition-colors bg-background"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>

              {/* Publish/Update Button */}
              <button
                type="button"
                onClick={onPublish}
                className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                {published ? 'Update' : 'Publish'}
              </button>
            </div>

            {/* Editor Controls */}
            {editorControls}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}
