'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';

interface Post {
  id: number;
  title: string;
  slug: string;
  postType: string;
  published: boolean;
  updatedAt: Date;
}

interface ContentTypeTab {
  slug: string;
  name: string;
  icon: string;
}

const postTypeIcon: Record<string, string> = {
  page: 'article',
  blog: 'rss_feed',
  landing: 'web',
};

export default function ContentList({
  siteId,
  posts,
  contentTypes,
  activeType,
}: {
  siteId: number;
  posts: Post[];
  contentTypes: ContentTypeTab[];
  activeType: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  const setType = (type: string | null) => {
    if (type) {
      router.push(`${pathname}?type=${type}`);
    } else {
      router.push(pathname);
    }
  };

  async function handleDelete(post: Post) {
    if (!confirm(`Delete "${post.title || 'Untitled'}"? This cannot be undone.`)) return;
    setDeleting(post.id);
    try {
      const res = await fetch(`/api/portal/cms/websites/${siteId}/posts/${post.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) {
        alert(data.message || 'Failed to delete entry');
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      alert('Network error while deleting');
    } finally {
      setDeleting(null);
    }
  }

  const filteredPosts = search
    ? posts.filter(p =>
        p.title.toLowerCase().includes(search.toLowerCase()) ||
        p.slug.toLowerCase().includes(search.toLowerCase())
      )
    : posts;

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
        <span className="material-icons text-base text-muted-foreground">search</span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search pages..."
          className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        {search && (
          <button type="button" onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground">
            <span className="material-icons text-sm">close</span>
          </button>
        )}
      </div>

      {/* Content type tabs */}
      {contentTypes.length > 0 && (
        <div className="flex gap-1 border-b border-border overflow-x-auto">
          <button
            onClick={() => setType(null)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              !activeType
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="material-icons text-base mr-1 align-middle">apps</span>
            All
          </button>
          {contentTypes.map(type => (
            <button
              key={type.slug}
              onClick={() => setType(type.slug)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeType === type.slug
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="material-icons text-base mr-1 align-middle">{type.icon}</span>
              {type.name}
            </button>
          ))}
        </div>
      )}

      {/* Post list */}
      {filteredPosts.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 flex flex-col items-center text-center">
          <span className="material-icons text-4xl text-muted-foreground mb-2">{search ? 'search_off' : 'article'}</span>
          <h2 className="font-semibold text-foreground mb-1">
            {search ? 'No results found' : activeType ? `No ${activeType} content yet` : 'No pages yet'}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {search ? `No pages matching "${search}"` : 'Create your first page to start building your website content.'}
          </p>
          {!search && (
            <Link
              href={`/portal/websites/${siteId}/posts/new`}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <span className="material-icons text-base">add</span>
              Create Page
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <ul className="divide-y divide-border">
            {filteredPosts.map(post => (
              <li key={post.id} className="flex items-stretch hover:bg-muted/20 transition-colors group">
                <Link
                  href={`/portal/websites/${siteId}/posts/${post.id}/edit`}
                  className="flex-1 flex items-center gap-4 px-4 py-3 min-w-0"
                >
                  <span className="material-icons text-muted-foreground text-xl shrink-0">
                    {postTypeIcon[post.postType] || 'description'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground group-hover:text-primary transition-colors truncate">
                      {post.title || 'Untitled'}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">/{post.slug}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      post.published
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      <span className="material-icons text-xs">{post.published ? 'check_circle' : 'edit'}</span>
                      {post.published ? 'Published' : 'Draft'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(post.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => handleDelete(post)}
                  disabled={deleting === post.id}
                  className="px-3 flex items-center text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 disabled:opacity-50 transition-opacity"
                  title="Delete entry"
                  aria-label={`Delete ${post.title || 'entry'}`}
                >
                  <span className="material-icons text-base">
                    {deleting === post.id ? 'hourglass_top' : 'delete_outline'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
