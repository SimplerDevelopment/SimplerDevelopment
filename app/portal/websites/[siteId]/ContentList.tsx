'use client';

import { useMemo, useState, useTransition } from 'react';
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

type SortKey = 'title' | 'slug' | 'published' | 'updatedAt';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

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
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const setType = (type: string | null) => {
    setPage(1);
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

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'updatedAt' ? 'desc' : 'asc');
    }
    setPage(1);
  };

  const filteredPosts = useMemo(() => {
    if (!search) return posts;
    const q = search.toLowerCase();
    return posts.filter(p =>
      p.title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q)
    );
  }, [posts, search]);

  const sortedPosts = useMemo(() => {
    const copy = [...filteredPosts];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'title':
          cmp = (a.title || '').localeCompare(b.title || '');
          break;
        case 'slug':
          cmp = a.slug.localeCompare(b.slug);
          break;
        case 'published':
          cmp = Number(a.published) - Number(b.published);
          break;
        case 'updatedAt':
          cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [filteredPosts, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedPosts.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedPosts = sortedPosts.slice((safePage - 1) * pageSize, safePage * pageSize);

  const startIdx = sortedPosts.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIdx = Math.min(safePage * pageSize, sortedPosts.length);

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return 'unfold_more';
    return sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward';
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
        <span className="material-icons text-base text-muted-foreground">search</span>
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search pages..."
          className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        {search && (
          <button type="button" onClick={() => { setSearch(''); setPage(1); }} className="text-muted-foreground hover:text-foreground">
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

      {/* Table */}
      {sortedPosts.length === 0 ? (
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <SortableHeader label="Title" sortKey="title" current={sortKey} icon={sortIcon('title')} onClick={toggleSort} />
                  <SortableHeader label="Slug" sortKey="slug" current={sortKey} icon={sortIcon('slug')} onClick={toggleSort} />
                  <SortableHeader label="Status" sortKey="published" current={sortKey} icon={sortIcon('published')} onClick={toggleSort} className="w-32" />
                  <SortableHeader label="Updated" sortKey="updatedAt" current={sortKey} icon={sortIcon('updatedAt')} onClick={toggleSort} className="w-36" />
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pagedPosts.map(post => (
                  <tr key={post.id} className="group hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 min-w-0">
                      <Link
                        href={`/portal/websites/${siteId}/posts/${post.id}/edit`}
                        className="font-medium text-foreground group-hover:text-primary transition-colors truncate block"
                      >
                        {post.title || 'Untitled'}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono truncate">
                      /{post.slug}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        post.published
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        <span className="material-icons text-xs">{post.published ? 'check_circle' : 'edit'}</span>
                        {post.published ? 'Published' : 'Draft'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(post.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="px-2 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(post)}
                        disabled={deleting === post.id}
                        className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 disabled:opacity-50 transition-opacity"
                        title="Delete entry"
                        aria-label={`Delete ${post.title || 'entry'}`}
                      >
                        <span className="material-icons text-base">
                          {deleting === post.id ? 'hourglass_top' : 'delete_outline'}
                        </span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 bg-muted/10">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                {startIdx}–{endIdx} of {sortedPosts.length}
              </span>
              <span className="mx-1">&middot;</span>
              <label className="flex items-center gap-1">
                Rows
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="bg-card border border-border rounded px-1.5 py-0.5 text-xs text-foreground"
                >
                  {PAGE_SIZE_OPTIONS.map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex items-center gap-1">
              <PagerButton
                disabled={safePage === 1}
                onClick={() => setPage(1)}
                icon="first_page"
                label="First page"
              />
              <PagerButton
                disabled={safePage === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                icon="chevron_left"
                label="Previous page"
              />
              <span className="text-xs text-muted-foreground px-2">
                Page {safePage} of {totalPages}
              </span>
              <PagerButton
                disabled={safePage === totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                icon="chevron_right"
                label="Next page"
              />
              <PagerButton
                disabled={safePage === totalPages}
                onClick={() => setPage(totalPages)}
                icon="last_page"
                label="Last page"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  current,
  icon,
  onClick,
  className = '',
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  icon: string;
  onClick: (key: SortKey) => void;
  className?: string;
}) {
  const active = current === sortKey;
  return (
    <th className={`text-left font-semibold ${className}`}>
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={`flex items-center gap-1 px-4 py-2.5 w-full text-left hover:text-foreground transition-colors ${
          active ? 'text-foreground' : ''
        }`}
      >
        {label}
        <span className={`material-icons text-sm ${active ? 'text-foreground' : 'text-muted-foreground/50'}`}>
          {icon}
        </span>
      </button>
    </th>
  );
}

function PagerButton({
  disabled,
  onClick,
  icon,
  label,
}: {
  disabled: boolean;
  onClick: () => void;
  icon: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
    >
      <span className="material-icons text-base">{icon}</span>
    </button>
  );
}
