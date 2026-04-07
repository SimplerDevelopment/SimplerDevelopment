'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CalendarPost {
  id: number;
  title: string;
  slug: string;
  postType: string;
  published: boolean;
  publishedAt: string | null;
  createdAt: string;
  date: string;
  status: 'draft' | 'scheduled' | 'published';
  coverImage: string | null;
  excerpt: string | null;
}

type ViewMode = 'month' | 'week';

export interface ContentCalendarProps {
  /** Website ID to scope posts to. When omitted, shows all posts. */
  websiteId?: number;
  /** Base path for "New Post" and "Edit" links. e.g. "/portal/websites/5" */
  basePath: string;
  /** Site ID used when creating posts from the calendar. Falls back to websiteId. */
  siteId?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
}

function startOfWeek(d: Date) {
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function endOfWeek(d: Date) {
  const s = startOfWeek(d);
  return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6, 23, 59, 59);
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isToday(d: Date) {
  return isSameDay(d, new Date());
}

function formatMonthYear(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function formatWeekRange(d: Date) {
  const s = startOfWeek(d);
  const e = endOfWeek(d);
  const fmt = (x: Date) =>
    x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(s)} - ${fmt(e)}, ${e.getFullYear()}`;
}

function getDaysInMonthView(d: Date): Date[] {
  const first = startOfMonth(d);
  const last = endOfMonth(d);
  const startDay = first.getDay();

  const calStart = new Date(first);
  calStart.setDate(calStart.getDate() - startDay);
  const totalCells = Math.ceil((startDay + last.getDate()) / 7) * 7;
  const days: Date[] = [];
  for (let i = 0; i < totalCells; i++) {
    const day = new Date(calStart);
    day.setDate(calStart.getDate() + i);
    days.push(day);
  }
  return days;
}

function getDaysInWeekView(d: Date): Date[] {
  const s = startOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(s);
    day.setDate(s.getDate() + i);
    return day;
  });
}

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  published: {
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-800 dark:text-green-300',
    dot: 'bg-green-500',
  },
  scheduled: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-800 dark:text-blue-300',
    dot: 'bg-blue-500',
  },
  draft: {
    bg: 'bg-yellow-100 dark:bg-yellow-900/30',
    text: 'text-yellow-800 dark:text-yellow-300',
    dot: 'bg-yellow-500',
  },
};

const POST_TYPE_ICONS: Record<string, string> = {
  blog: 'article',
  page: 'description',
  'case-study': 'work',
  landing: 'web',
};

// ---------------------------------------------------------------------------
// Schedule Modal
// ---------------------------------------------------------------------------

function ScheduleModal({
  post,
  onClose,
  onSave,
}: {
  post: CalendarPost;
  onClose: () => void;
  onSave: (id: number, date: string | null, publish: boolean) => Promise<void>;
}) {
  const currentDate = post.publishedAt
    ? new Date(post.publishedAt).toISOString().slice(0, 16)
    : '';
  const [dateVal, setDateVal] = useState(currentDate);
  const [publish, setPublish] = useState(post.published);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(post.id, dateVal || null, publish);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Schedule Post</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <span className="material-icons">close</span>
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-4 truncate">{post.title}</p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Publish Date & Time
            </label>
            <input
              type="datetime-local"
              value={dateVal}
              onChange={(e) => setDateVal(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={publish}
              onChange={(e) => setPublish(e.target.checked)}
              className="rounded border-border"
            />
            <span className="text-sm text-foreground">Published</span>
          </label>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="material-icons text-sm">info</span>
            Set a future date with published unchecked to schedule for later.
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border border-border text-foreground hover:bg-accent"
          >
            Cancel
          </button>
          {dateVal && (
            <button
              onClick={async () => {
                setSaving(true);
                await onSave(post.id, null, false);
                setSaving(false);
                onClose();
              }}
              disabled={saving}
              className="px-4 py-2 text-sm rounded-md border border-yellow-300 dark:border-yellow-700 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-50 dark:hover:bg-yellow-900/20"
            >
              Unschedule
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Post Modal (click on empty date)
// ---------------------------------------------------------------------------

function CreatePostModal({
  date,
  basePath,
  websiteId,
  onClose,
  onCreated,
}: {
  date: Date;
  basePath: string;
  websiteId?: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [postType, setPostType] = useState('blog');
  const dateStr = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9, 0).toISOString().slice(0, 16);
  const [scheduledAt, setScheduledAt] = useState(dateStr);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const handleCreate = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    if (!websiteId) { setError('Website ID missing'); return; }
    setSaving(true);
    setError('');

    // 1. Create the post as a draft
    const res = await fetch(`/api/portal/cms/websites/${websiteId}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        slug: slug || `post-${Date.now()}`,
        postType,
        content: JSON.stringify({ blocks: [] }),
        published: false,
      }),
    });
    const json = await res.json();

    if (!json.success) {
      setError(json.message || 'Failed to create post');
      setSaving(false);
      return;
    }

    // 2. Schedule it for the selected date
    await fetch(`/api/posts/${json.data.id}/schedule`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publishedAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        published: false,
      }),
    });

    setSaving(false);
    onCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Schedule New Post</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <span className="material-icons">close</span>
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          {date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>

        {error && (
          <div className="mb-4 px-3 py-2 text-sm rounded-md bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Post title"
              autoFocus
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              onKeyDown={(e) => { if (e.key === 'Enter' && title.trim()) handleCreate(); }}
            />
            {slug && (
              <p className="text-xs text-muted-foreground mt-1">/{slug}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Post Type</label>
            <select
              value={postType}
              onChange={(e) => setPostType(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="blog">Blog Post</option>
              <option value="page">Page</option>
              <option value="case-study">Case Study</option>
              <option value="landing">Landing Page</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Scheduled Date & Time</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        <div className="flex justify-between mt-6">
          <a
            href={`${basePath}/posts/new`}
            className="px-4 py-2 text-sm rounded-md border border-border text-foreground hover:bg-accent inline-flex items-center gap-1"
          >
            <span className="material-icons text-sm">open_in_new</span>
            Full Editor
          </a>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-md border border-border text-foreground hover:bg-accent"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={saving || !title.trim()}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create & Schedule'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Post Card (appears on calendar cells)
// ---------------------------------------------------------------------------

function PostCard({
  post,
  compact,
  editHref,
  onScheduleClick,
  onDragStart,
}: {
  post: CalendarPost;
  compact?: boolean;
  editHref: string;
  onScheduleClick: (post: CalendarPost) => void;
  onDragStart: (e: React.DragEvent, post: CalendarPost) => void;
}) {
  const colors = STATUS_COLORS[post.status];
  const icon = POST_TYPE_ICONS[post.postType] || 'draft';

  if (compact) {
    return (
      <div
        data-post-card
        draggable
        onDragStart={(e) => onDragStart(e, post)}
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium truncate cursor-grab active:cursor-grabbing ${colors.bg} ${colors.text}`}
        title={`${post.title} (${post.status})`}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${colors.dot}`} />
        <span className="truncate">{post.title}</span>
      </div>
    );
  }

  return (
    <div
      data-post-card
      draggable
      onDragStart={(e) => onDragStart(e, post)}
      className={`group flex items-start gap-2 p-2 rounded-md border border-transparent hover:border-border ${colors.bg} cursor-grab active:cursor-grabbing transition-colors`}
    >
      <span className={`material-icons text-base mt-0.5 ${colors.text}`}>{icon}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium truncate ${colors.text}`}>{post.title}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {post.postType} &middot; {post.status}
        </p>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onScheduleClick(post); }}
          className="p-0.5 rounded hover:bg-accent"
          title="Schedule"
        >
          <span className="material-icons text-sm text-muted-foreground">schedule</span>
        </button>
        <Link
          href={editHref}
          onClick={(e) => e.stopPropagation()}
          className="p-0.5 rounded hover:bg-accent"
          title="Edit"
        >
          <span className="material-icons text-sm text-muted-foreground">edit</span>
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Calendar Component
// ---------------------------------------------------------------------------

export default function ContentCalendar({ websiteId, basePath, siteId }: ContentCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewMode>('month');
  const [posts, setPosts] = useState<CalendarPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [schedulePost, setSchedulePost] = useState<CalendarPost | null>(null);
  const [createDate, setCreateDate] = useState<Date | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const draggedPost = useRef<CalendarPost | null>(null);

  // Fetch posts for the visible date range
  const fetchPosts = useCallback(async () => {
    setLoading(true);
    const start =
      view === 'month'
        ? new Date(currentDate.getFullYear(), currentDate.getMonth(), -6)
        : startOfWeek(currentDate);
    const end =
      view === 'month'
        ? new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 7)
        : endOfWeek(currentDate);

    const params = new URLSearchParams({
      start: start.toISOString(),
      end: end.toISOString(),
    });
    if (websiteId) params.set('websiteId', String(websiteId));

    const res = await fetch(`/api/posts/calendar?${params}`);
    const json = await res.json();
    if (json.success) setPosts(json.data);
    setLoading(false);
  }, [currentDate, view, websiteId]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // Navigation
  const navigate = (dir: -1 | 1) => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (view === 'month') d.setMonth(d.getMonth() + dir);
      else d.setDate(d.getDate() + dir * 7);
      return d;
    });
  };

  const goToday = () => setCurrentDate(new Date());

  // Schedule save handler
  const handleScheduleSave = async (id: number, date: string | null, publish: boolean) => {
    await fetch(`/api/posts/${id}/schedule`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publishedAt: date ? new Date(date).toISOString() : null,
        published: publish,
      }),
    });
    await fetchPosts();
  };

  // Drag & drop
  const handleDragStart = (_e: React.DragEvent, post: CalendarPost) => {
    draggedPost.current = post;
  };

  const handleDrop = async (e: React.DragEvent, targetDate: Date) => {
    e.preventDefault();
    const post = draggedPost.current;
    if (!post) return;
    draggedPost.current = null;

    const original = post.publishedAt ? new Date(post.publishedAt) : new Date();
    const newDate = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate(),
      original.getHours(),
      original.getMinutes(),
    );

    await handleScheduleSave(post.id, newDate.toISOString(), post.published);
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  // Filter posts
  const filteredPosts = posts.filter((p) => {
    if (filterStatus !== 'all' && p.status !== filterStatus) return false;
    if (filterType !== 'all' && p.postType !== filterType) return false;
    return true;
  });

  const postTypes = [...new Set(posts.map((p) => p.postType))];

  const postsForDay = (day: Date) =>
    filteredPosts.filter((p) => isSameDay(new Date(p.date), day));

  const days = view === 'month' ? getDaysInMonthView(currentDate) : getDaysInWeekView(currentDate);
  const weekDayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const totalPosts = posts.length;
  const publishedCount = posts.filter((p) => p.status === 'published').length;
  const scheduledCount = posts.filter((p) => p.status === 'scheduled').length;
  const draftCount = posts.filter((p) => p.status === 'draft').length;

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: totalPosts, icon: 'library_books', color: 'text-foreground' },
          { label: 'Published', value: publishedCount, icon: 'check_circle', color: 'text-green-500' },
          { label: 'Scheduled', value: scheduledCount, icon: 'schedule', color: 'text-blue-500' },
          { label: 'Drafts', value: draftCount, icon: 'edit_note', color: 'text-yellow-500' },
        ].map((stat) => (
          <div key={stat.label} className="bg-card border border-border rounded-lg p-3 flex items-center gap-3">
            <span className={`material-icons text-2xl ${stat.color}`}>{stat.icon}</span>
            <div>
              <p className="text-xl font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-card border border-border rounded-lg p-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <span className="material-icons">chevron_left</span>
          </button>
          <h2 className="text-lg font-semibold text-foreground min-w-[200px] text-center">
            {view === 'month' ? formatMonthYear(currentDate) : formatWeekRange(currentDate)}
          </h2>
          <button
            onClick={() => navigate(1)}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <span className="material-icons">chevron_right</span>
          </button>
          <button
            onClick={goToday}
            className="ml-2 px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-accent text-foreground"
          >
            Today
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground"
          >
            <option value="all">All Statuses</option>
            <option value="published">Published</option>
            <option value="scheduled">Scheduled</option>
            <option value="draft">Draft</option>
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground"
          >
            <option value="all">All Types</option>
            {postTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <div className="flex rounded-md border border-border overflow-hidden">
            {(['month', 'week'] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs font-medium capitalize ${
                  view === v
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-foreground hover:bg-accent'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border">
          {weekDayNames.map((name) => (
            <div
              key={name}
              className="px-2 py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider"
            >
              {name}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <span className="material-icons animate-spin mr-2">progress_activity</span>
            Loading calendar...
          </div>
        ) : (
          <div className={`grid grid-cols-7 ${view === 'week' ? 'min-h-[400px]' : ''}`}>
            {days.map((day, i) => {
              const dayPosts = postsForDay(day);
              const isCurrentMonth = day.getMonth() === currentDate.getMonth();
              const today = isToday(day);

              return (
                <div
                  key={i}
                  onDrop={(e) => handleDrop(e, day)}
                  onDragOver={handleDragOver}
                  onClick={(e) => {
                    // Only open create modal if clicking empty space, not a post card
                    if ((e.target as HTMLElement).closest('[data-post-card]')) return;
                    setCreateDate(day);
                  }}
                  className={`border-b border-r border-border cursor-pointer ${
                    view === 'month' ? 'min-h-[110px]' : 'min-h-[400px]'
                  } ${isCurrentMonth ? '' : 'bg-muted/30'} ${
                    today ? 'bg-primary/5' : ''
                  } transition-colors hover:bg-accent/30`}
                >
                  <div className="flex items-center justify-between px-2 pt-1.5">
                    <span
                      className={`text-xs font-medium ${
                        today
                          ? 'bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center'
                          : isCurrentMonth
                            ? 'text-foreground'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {day.getDate()}
                    </span>
                    {dayPosts.length > 0 && view === 'month' && (
                      <span className="text-[10px] text-muted-foreground">
                        {dayPosts.length}
                      </span>
                    )}
                  </div>

                  <div className={`px-1 pb-1 space-y-0.5 ${view === 'month' ? 'mt-0.5' : 'mt-2'}`}>
                    {view === 'month' ? (
                      <>
                        {dayPosts.slice(0, 3).map((post) => (
                          <PostCard
                            key={post.id}
                            post={post}
                            compact
                            editHref={`${basePath}/posts/${post.id}/edit`}
                            onScheduleClick={setSchedulePost}
                            onDragStart={handleDragStart}
                          />
                        ))}
                        {dayPosts.length > 3 && (
                          <p className="text-[10px] text-muted-foreground pl-1">
                            +{dayPosts.length - 3} more
                          </p>
                        )}
                      </>
                    ) : (
                      dayPosts.map((post) => (
                        <PostCard
                          key={post.id}
                          post={post}
                          editHref={`${basePath}/posts/${post.id}/edit`}
                          onScheduleClick={setSchedulePost}
                          onDragStart={handleDragStart}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {Object.entries(STATUS_COLORS).map(([status, colors]) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
            <span className="capitalize">{status}</span>
          </div>
        ))}
        <span className="ml-auto flex items-center gap-1">
          <span className="material-icons text-sm">drag_indicator</span>
          Drag posts to reschedule
        </span>
      </div>

      {/* Schedule Modal */}
      {schedulePost && (
        <ScheduleModal
          post={schedulePost}
          onClose={() => setSchedulePost(null)}
          onSave={handleScheduleSave}
        />
      )}

      {/* Create Post Modal (click on date) */}
      {createDate && (
        <CreatePostModal
          date={createDate}
          basePath={basePath}
          websiteId={siteId ?? websiteId}
          onClose={() => setCreateDate(null)}
          onCreated={fetchPosts}
        />
      )}
    </div>
  );
}
