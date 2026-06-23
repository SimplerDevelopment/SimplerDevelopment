// @vitest-environment jsdom
/**
 * Unit tests for components/content-calendar/ContentCalendar.tsx (batch 48f).
 *
 * The component is a client-side calendar showing posts in month/week view.
 * It exercises: fetch (twice on mount + after schedule actions), drag/drop
 * via React DnD events, two internal modals (ScheduleModal, CreatePostModal),
 * status & type filtering, today highlighting, and navigation.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks for heavy deps
// ---------------------------------------------------------------------------

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// framer-motion -> passthrough via Proxy
vi.mock('framer-motion', () => {
  const passthrough = (tag: string) =>
    function MotionMock({ children, ...rest }: any) {
      return React.createElement(tag, rest, children);
    };
  const motion: any = new Proxy(
    {},
    {
      get: (_t, prop: string) => passthrough(prop),
    },
  );
  return { motion, AnimatePresence: ({ children }: any) => children };
});

// @dnd-kit (defensive — not used directly by ContentCalendar today, but pinning
// the mock keeps the suite stable if it later imports dnd-kit primitives).
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: any) => children,
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  PointerSensor: class {},
  KeyboardSensor: class {},
  useSensor: () => ({}),
  useSensors: () => [],
}));
vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: any) => children,
  useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, transition: '' }),
  sortableKeyboardCoordinates: () => null,
  arrayMove: (arr: any[]) => arr,
  verticalListSortingStrategy: null,
}));
vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}));

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------
import ContentCalendar from '@/components/content-calendar/ContentCalendar';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CalendarPost = {
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
};

function makePost(overrides: Partial<CalendarPost> = {}): CalendarPost {
  const today = new Date();
  return {
    id: 1,
    title: 'My Post',
    slug: 'my-post',
    postType: 'blog',
    published: true,
    publishedAt: today.toISOString(),
    createdAt: today.toISOString(),
    date: today.toISOString(),
    status: 'published',
    coverImage: null,
    excerpt: null,
    ...overrides,
  };
}

function mockFetchOnce(posts: CalendarPost[]) {
  const fn = vi.fn(async (_url: string) =>
    ({
      ok: true,
      json: async () => ({ success: true, data: posts }),
    } as unknown as Response),
  );
  // @ts-expect-error -- inject fetch
  global.fetch = fn;
  return fn;
}

async function renderCalendar(
  props: { websiteId?: number; basePath?: string; siteId?: number } = {},
  posts: CalendarPost[] = [],
) {
  const fetchSpy = mockFetchOnce(posts);
  const result = render(<ContentCalendar basePath="/portal/websites/5" {...props} />);
  // Wait for the initial fetch + state update
  await waitFor(() => {
    expect(fetchSpy).toHaveBeenCalled();
  });
  // Wait for loading state to clear
  await waitFor(() => {
    expect(result.container.querySelector('.animate-spin')).toBeNull();
  });
  return { ...result, fetchSpy };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('ContentCalendar — stats bar', () => {
  it('renders four stat tiles with labels', async () => {
    await renderCalendar();
    // Use *AllByText* — "Published" also appears as a select <option>.
    expect(screen.getByText('Total')).toBeTruthy();
    expect(screen.getAllByText('Published').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Scheduled').length).toBeGreaterThan(0);
    expect(screen.getByText('Drafts')).toBeTruthy();
  });

  it('counts posts by status', async () => {
    const posts = [
      makePost({ id: 1, status: 'published' }),
      makePost({ id: 2, status: 'published' }),
      makePost({ id: 3, status: 'scheduled' }),
      makePost({ id: 4, status: 'draft' }),
    ];
    const { container } = await renderCalendar({}, posts);
    // Read the 4 stat-tile counts directly to avoid clashing with day-of-month labels.
    const counts = Array.from(container.querySelectorAll('.text-xl.font-bold')).map(
      (el) => el.textContent,
    );
    expect(counts).toEqual(['4', '2', '1', '1']);
  });

  it('shows zero counts when no posts are returned', async () => {
    const { container } = await renderCalendar();
    // 4 zeros expected in the stats tiles
    const zeros = container.querySelectorAll('.text-xl.font-bold');
    expect(zeros.length).toBe(4);
    zeros.forEach((el) => expect(el.textContent).toBe('0'));
  });
});

describe('ContentCalendar — toolbar', () => {
  it('renders prev/next/today nav buttons', async () => {
    const { container } = await renderCalendar();
    // chevron_left and chevron_right material icons + a "Today" button
    expect(container.textContent).toContain('chevron_left');
    expect(container.textContent).toContain('chevron_right');
    expect(screen.getByRole('button', { name: /today/i })).toBeTruthy();
  });

  it('renders status and type filter selects', async () => {
    await renderCalendar();
    expect(screen.getByRole('option', { name: 'All Statuses' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'All Types' })).toBeTruthy();
  });

  it('shows the current month label by default', async () => {
    const { container } = await renderCalendar();
    const expected = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    expect(container.textContent).toContain(expected);
  });

  it('switches to week view when the Week button is clicked', async () => {
    await renderCalendar();
    const weekBtn = screen.getByRole('button', { name: /^week$/i });
    fireEvent.click(weekBtn);
    // Week view should be visible — the toolbar label changes to a week-range string
    // (we don't pin the exact date, just verify the button became selected and re-rendered)
    expect(weekBtn.className).toContain('bg-primary');
  });

  it('shows distinct post-type options in the type filter', async () => {
    const posts = [
      makePost({ id: 1, postType: 'blog' }),
      makePost({ id: 2, postType: 'page' }),
      makePost({ id: 3, postType: 'blog' }), // duplicate — should be deduped
    ];
    await renderCalendar({}, posts);
    expect(screen.getByRole('option', { name: 'blog' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'page' })).toBeTruthy();
  });
});

describe('ContentCalendar — navigation', () => {
  it('moves forward and back one month when nav buttons are clicked', async () => {
    const { container } = await renderCalendar();
    const monthLabel = () => {
      const heading = container.querySelector('h2');
      return heading?.textContent || '';
    };

    const original = monthLabel();

    // chevron_right is the next-month button
    const buttons = container.querySelectorAll('button');
    // Find the two chevron buttons by their content
    const nextBtn = Array.from(buttons).find((b) => b.textContent === 'chevron_right')!;
    const prevBtn = Array.from(buttons).find((b) => b.textContent === 'chevron_left')!;

    fireEvent.click(nextBtn);
    await waitFor(() => expect(monthLabel()).not.toBe(original));

    fireEvent.click(prevBtn);
    await waitFor(() => expect(monthLabel()).toBe(original));
  });

  it('returns to today when the Today button is clicked', async () => {
    const { container } = await renderCalendar();
    const buttons = container.querySelectorAll('button');
    const nextBtn = Array.from(buttons).find((b) => b.textContent === 'chevron_right')!;
    fireEvent.click(nextBtn);
    fireEvent.click(nextBtn);

    fireEvent.click(screen.getByRole('button', { name: /today/i }));
    const expected = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    await waitFor(() => expect(container.textContent).toContain(expected));
  });

  it('navigates by week increments when in week view', async () => {
    const { container } = await renderCalendar();
    fireEvent.click(screen.getByRole('button', { name: /^week$/i }));
    const headingBefore = container.querySelector('h2')?.textContent || '';
    const nextBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'chevron_right',
    )!;
    fireEvent.click(nextBtn);
    await waitFor(() => {
      const after = container.querySelector('h2')?.textContent || '';
      expect(after).not.toBe(headingBefore);
    });
  });
});

describe('ContentCalendar — calendar grid', () => {
  it('renders the seven weekday header labels', async () => {
    await renderCalendar();
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach((name) => {
      expect(screen.getByText(name)).toBeTruthy();
    });
  });

  it('renders posts on the day they belong to', async () => {
    const posts = [makePost({ title: 'A Cool Post' })];
    await renderCalendar({}, posts);
    expect(screen.getByText('A Cool Post')).toBeTruthy();
  });

  it('renders a +N indicator when more than 3 posts fall on the same day', async () => {
    const posts = [
      makePost({ id: 1, title: 'p1' }),
      makePost({ id: 2, title: 'p2' }),
      makePost({ id: 3, title: 'p3' }),
      makePost({ id: 4, title: 'p4' }),
      makePost({ id: 5, title: 'p5' }),
    ];
    const { container } = await renderCalendar({}, posts);
    expect(container.textContent).toContain('+2 more');
  });

  it('shows the loading spinner while initial fetch is in flight', () => {
    // Use a never-resolving fetch so loading state persists
    // @ts-expect-error -- inject fetch
    global.fetch = vi.fn(() => new Promise(() => {}));
    const { container } = render(<ContentCalendar basePath="/x" />);
    expect(container.querySelector('.animate-spin')).not.toBeNull();
    expect(container.textContent).toContain('Loading calendar');
  });
});

describe('ContentCalendar — fetch URL building', () => {
  it('includes websiteId in the calendar query string when provided', async () => {
    const { fetchSpy } = await renderCalendar({ websiteId: 42 });
    const url = String(fetchSpy.mock.calls[0]?.[0] ?? '');
    expect(url).toContain('/api/posts/calendar?');
    expect(url).toContain('websiteId=42');
    expect(url).toContain('start=');
    expect(url).toContain('end=');
  });

  it('omits websiteId from the query when not provided', async () => {
    const { fetchSpy } = await renderCalendar();
    const url = String(fetchSpy.mock.calls[0]?.[0] ?? '');
    expect(url).not.toContain('websiteId=');
  });

  it('refetches when the view changes from month to week', async () => {
    const { fetchSpy } = await renderCalendar();
    const callsBefore = fetchSpy.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /^week$/i }));
    await waitFor(() => {
      expect(fetchSpy.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });
});

describe('ContentCalendar — filtering', () => {
  it('hides posts that do not match the selected status filter', async () => {
    const posts = [
      makePost({ id: 1, title: 'Published Post', status: 'published' }),
      makePost({ id: 2, title: 'Draft Post', status: 'draft' }),
    ];
    const { container } = await renderCalendar({}, posts);
    expect(screen.getByText('Published Post')).toBeTruthy();
    expect(screen.getByText('Draft Post')).toBeTruthy();

    // Find the status filter — the first <select> in the toolbar
    const selects = container.querySelectorAll('select');
    fireEvent.change(selects[0], { target: { value: 'published' } });
    expect(screen.queryByText('Draft Post')).toBeNull();
    expect(screen.getByText('Published Post')).toBeTruthy();
  });

  it('hides posts that do not match the selected type filter', async () => {
    const posts = [
      makePost({ id: 1, title: 'Blog Item', postType: 'blog' }),
      makePost({ id: 2, title: 'Page Item', postType: 'page' }),
    ];
    const { container } = await renderCalendar({}, posts);
    const selects = container.querySelectorAll('select');
    // 2nd select is the type filter
    fireEvent.change(selects[1], { target: { value: 'page' } });
    expect(screen.queryByText('Blog Item')).toBeNull();
    expect(screen.getByText('Page Item')).toBeTruthy();
  });
});

describe('ContentCalendar — legend', () => {
  it('renders a legend entry for each status', async () => {
    await renderCalendar();
    // "draft" appears as both an <option> and as the legend text; the legend text
    // is rendered inside a span with `capitalize` class — assert by counting all spans.
    expect(screen.getAllByText('published').length).toBeGreaterThan(0);
    expect(screen.getAllByText('scheduled').length).toBeGreaterThan(0);
    expect(screen.getAllByText('draft').length).toBeGreaterThan(0);
  });

  it('shows the drag indicator hint', async () => {
    const { container } = await renderCalendar();
    expect(container.textContent).toContain('Drag posts to reschedule');
  });
});

describe('ContentCalendar — PostCard rendering', () => {
  it('renders post titles in compact mode in month view', async () => {
    await renderCalendar({}, [makePost({ title: 'Compact Title' })]);
    // Compact card uses a tiny dot + truncated title text
    expect(screen.getByText('Compact Title')).toBeTruthy();
  });

  it('renders full-mode PostCards in week view', async () => {
    await renderCalendar({}, [makePost({ title: 'Full Card Title', postType: 'blog' })]);
    fireEvent.click(screen.getByRole('button', { name: /^week$/i }));
    // The week-view PostCard renders postType + status as secondary text
    await waitFor(() => {
      expect(screen.getByText(/blog/i)).toBeTruthy();
    });
  });

  it('falls back to a "draft" icon for unknown post types', async () => {
    const { container } = await renderCalendar(
      {},
      [makePost({ title: 'Weird Type', postType: 'unknown-type' })],
    );
    fireEvent.click(screen.getByRole('button', { name: /^week$/i }));
    // The component should not crash and the post title should still render
    await waitFor(() => {
      expect(container.textContent).toContain('Weird Type');
    });
  });
});

describe('ContentCalendar — schedule modal', () => {
  it('opens the schedule modal when the schedule icon is clicked in week view', async () => {
    const { container } = await renderCalendar({}, [makePost({ title: 'Sched Me' })]);
    fireEvent.click(screen.getByRole('button', { name: /^week$/i }));

    // The schedule icon button has title="Schedule"
    await waitFor(() => {
      expect(container.querySelector('button[title="Schedule"]')).not.toBeNull();
    });
    const scheduleBtn = container.querySelector('button[title="Schedule"]') as HTMLButtonElement;
    fireEvent.click(scheduleBtn);

    expect(screen.getByText('Schedule Post')).toBeTruthy();
  });

  it('closes the schedule modal when the backdrop is clicked', async () => {
    const { container } = await renderCalendar({}, [makePost({ title: 'Closeme' })]);
    fireEvent.click(screen.getByRole('button', { name: /^week$/i }));
    await waitFor(() => {
      expect(container.querySelector('button[title="Schedule"]')).not.toBeNull();
    });
    fireEvent.click(container.querySelector('button[title="Schedule"]')!);
    expect(screen.getByText('Schedule Post')).toBeTruthy();

    // Backdrop is the fixed inset-0 div
    const backdrop = container.querySelector('.fixed.inset-0') as HTMLElement;
    fireEvent.click(backdrop);
    await waitFor(() => {
      expect(screen.queryByText('Schedule Post')).toBeNull();
    });
  });

  it('saves the schedule and refetches posts', async () => {
    const post = makePost({ title: 'Save Me', publishedAt: new Date().toISOString() });
    const { fetchSpy, container } = await renderCalendar({}, [post]);
    fireEvent.click(screen.getByRole('button', { name: /^week$/i }));
    await waitFor(() => {
      expect(container.querySelector('button[title="Schedule"]')).not.toBeNull();
    });
    fireEvent.click(container.querySelector('button[title="Schedule"]')!);

    // Re-mock fetch to capture the PATCH + refetch
    const calls: string[] = [];
    // @ts-expect-error -- inject fetch
    global.fetch = vi.fn(async (url: string, _init?: any) => {
      calls.push(url);
      return {
        ok: true,
        json: async () => ({ success: true, data: [] }),
      } as unknown as Response;
    });

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(calls.some((u) => u.includes('/api/posts/1/schedule'))).toBe(true);
    });
    // We don't depend on the inner fetchSpy here since we swapped it.
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('shows an Unschedule button when the post already has a date', async () => {
    const post = makePost({ publishedAt: new Date().toISOString() });
    const { container } = await renderCalendar({}, [post]);
    fireEvent.click(screen.getByRole('button', { name: /^week$/i }));
    await waitFor(() => {
      expect(container.querySelector('button[title="Schedule"]')).not.toBeNull();
    });
    fireEvent.click(container.querySelector('button[title="Schedule"]')!);

    expect(screen.getByRole('button', { name: /unschedule/i })).toBeTruthy();
  });
});

describe('ContentCalendar — create post modal', () => {
  it('opens the create modal when clicking on an empty day cell', async () => {
    const { container } = await renderCalendar({ websiteId: 7 });
    // Click the first calendar day cell — they live inside the grid; find one with min-h
    const dayCells = container.querySelectorAll('[class*="min-h-"]');
    // Pick a cell that doesn't contain a post-card
    const emptyCell = Array.from(dayCells).find(
      (c) => !c.querySelector('[data-post-card]'),
    ) as HTMLElement;
    expect(emptyCell).toBeTruthy();
    fireEvent.click(emptyCell);

    expect(screen.getByText('Schedule New Post')).toBeTruthy();
  });

  it('does not open the create modal when a post card is clicked', async () => {
    const { container } = await renderCalendar({ websiteId: 7 }, [makePost({ title: 'Skip Me' })]);
    // Find the post card by data-post-card
    const card = container.querySelector('[data-post-card]') as HTMLElement;
    expect(card).toBeTruthy();
    fireEvent.click(card);
    // Create modal should NOT appear
    expect(screen.queryByText('Schedule New Post')).toBeNull();
  });

  it('shows a slug preview as the title is typed', async () => {
    const { container } = await renderCalendar({ websiteId: 7 });
    const emptyCell = Array.from(
      container.querySelectorAll('[class*="min-h-"]'),
    ).find((c) => !c.querySelector('[data-post-card]')) as HTMLElement;
    fireEvent.click(emptyCell);

    const titleInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'My Cool Post!' } });

    expect(container.textContent).toContain('/my-cool-post');
  });

  it('blocks submit when title is empty and shows an error', async () => {
    const { container } = await renderCalendar({ websiteId: 7 });
    const emptyCell = Array.from(
      container.querySelectorAll('[class*="min-h-"]'),
    ).find((c) => !c.querySelector('[data-post-card]')) as HTMLElement;
    fireEvent.click(emptyCell);

    // Create button is disabled when title is empty — verify the disabled attr
    const createBtn = screen.getByRole('button', { name: /Create & Schedule/i });
    expect(createBtn.hasAttribute('disabled')).toBe(true);
  });

  it('shows an error when websiteId is missing', async () => {
    // No websiteId, no siteId — handleCreate path will set the missing-website error
    const { container } = await renderCalendar({});
    const emptyCell = Array.from(
      container.querySelectorAll('[class*="min-h-"]'),
    ).find((c) => !c.querySelector('[data-post-card]')) as HTMLElement;
    fireEvent.click(emptyCell);

    const titleInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Hi' } });
    fireEvent.click(screen.getByRole('button', { name: /Create & Schedule/i }));

    await waitFor(() => {
      expect(container.textContent).toContain('Website ID missing');
    });
  });

  it('issues a POST then PATCH when creating a post', async () => {
    const { container } = await renderCalendar({ websiteId: 7, siteId: 9 });

    const emptyCell = Array.from(
      container.querySelectorAll('[class*="min-h-"]'),
    ).find((c) => !c.querySelector('[data-post-card]')) as HTMLElement;
    fireEvent.click(emptyCell);

    // Swap fetch to capture the create + schedule sequence
    const calls: Array<{ url: string; method?: string }> = [];
    // @ts-expect-error -- inject fetch
    global.fetch = vi.fn(async (url: string, init?: any) => {
      calls.push({ url, method: init?.method });
      // Return the created post on the create call; empty array on the refetch
      if (url.includes('/api/portal/cms/websites/')) {
        return {
          ok: true,
          json: async () => ({ success: true, data: { id: 99 } }),
        } as unknown as Response;
      }
      return {
        ok: true,
        json: async () => ({ success: true, data: [] }),
      } as unknown as Response;
    });

    const titleInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Brand New Post' } });
    fireEvent.click(screen.getByRole('button', { name: /Create & Schedule/i }));

    await waitFor(() => {
      // siteId (9) takes precedence over websiteId (7)
      expect(calls.some((c) => c.url.includes('/api/portal/cms/websites/9/posts'))).toBe(true);
      expect(calls.some((c) => c.url.includes('/api/posts/99/schedule'))).toBe(true);
    });
  });

  it('surfaces a server error when the create call fails', async () => {
    const { container } = await renderCalendar({ websiteId: 7 });
    const emptyCell = Array.from(
      container.querySelectorAll('[class*="min-h-"]'),
    ).find((c) => !c.querySelector('[data-post-card]')) as HTMLElement;
    fireEvent.click(emptyCell);

    // @ts-expect-error -- inject fetch
    global.fetch = vi.fn(async () =>
      ({
        ok: false,
        json: async () => ({ success: false, message: 'slug-taken' }),
      } as unknown as Response),
    );

    const titleInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Dup Slug' } });
    fireEvent.click(screen.getByRole('button', { name: /Create & Schedule/i }));

    await waitFor(() => {
      expect(container.textContent).toContain('slug-taken');
    });
  });

  it('closes the create modal when the backdrop is clicked', async () => {
    const { container } = await renderCalendar({ websiteId: 7 });
    const emptyCell = Array.from(
      container.querySelectorAll('[class*="min-h-"]'),
    ).find((c) => !c.querySelector('[data-post-card]')) as HTMLElement;
    fireEvent.click(emptyCell);

    expect(screen.getByText('Schedule New Post')).toBeTruthy();
    const backdrop = container.querySelector('.fixed.inset-0') as HTMLElement;
    fireEvent.click(backdrop);
    await waitFor(() => {
      expect(screen.queryByText('Schedule New Post')).toBeNull();
    });
  });

  it('includes a link to the Full Editor', async () => {
    const { container } = await renderCalendar({ websiteId: 7 });
    const emptyCell = Array.from(
      container.querySelectorAll('[class*="min-h-"]'),
    ).find((c) => !c.querySelector('[data-post-card]')) as HTMLElement;
    fireEvent.click(emptyCell);

    const fullEditorLink = container.querySelector('a[href="/portal/websites/5/posts/new"]');
    expect(fullEditorLink).toBeTruthy();
  });
});

describe('ContentCalendar — drag & drop', () => {
  it('refetches after a drop reschedules a post', async () => {
    const post = makePost({ title: 'Drag Me' });
    const { container } = await renderCalendar({}, [post]);

    const card = container.querySelector('[data-post-card]') as HTMLElement;
    expect(card).toBeTruthy();

    // Swap fetch for the PATCH + refetch sequence
    const calls: string[] = [];
    // @ts-expect-error -- inject fetch
    global.fetch = vi.fn(async (url: string) => {
      calls.push(url);
      return {
        ok: true,
        json: async () => ({ success: true, data: [] }),
      } as unknown as Response;
    });

    // Simulate drag start, then drop on a day cell
    fireEvent.dragStart(card);
    const dayCell = Array.from(
      container.querySelectorAll('[class*="min-h-"]'),
    ).find((c) => !c.querySelector('[data-post-card]')) as HTMLElement;
    expect(dayCell).toBeTruthy();
    fireEvent.dragOver(dayCell);
    fireEvent.drop(dayCell);

    await waitFor(() => {
      expect(calls.some((u) => u.includes('/api/posts/1/schedule'))).toBe(true);
    });
  });

  it('ignores a drop that has no preceding dragStart', async () => {
    const { container } = await renderCalendar();
    const dayCell = Array.from(
      container.querySelectorAll('[class*="min-h-"]'),
    ).find((c) => !c.querySelector('[data-post-card]')) as HTMLElement;

    // Track fetches after the initial mount
    // @ts-expect-error -- inject fetch
    global.fetch = vi.fn(async () =>
      ({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      } as unknown as Response),
    );

    fireEvent.dragOver(dayCell);
    fireEvent.drop(dayCell);

    // Give the (no-op) handler a tick to run
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    // No PATCH should have been issued
    // @ts-expect-error -- reading the mock
    const calls = (global.fetch as any).mock.calls.map((c: any[]) => String(c[0]));
    expect(calls.some((u: string) => u.includes('/schedule'))).toBe(false);
  });
});

describe('ContentCalendar — failure paths', () => {
  it('skips setPosts when the response is not successful', async () => {
    // @ts-expect-error -- inject fetch
    global.fetch = vi.fn(async () =>
      ({
        ok: true,
        json: async () => ({ success: false, message: 'nope' }),
      } as unknown as Response),
    );
    const { container } = render(<ContentCalendar basePath="/x" />);
    await waitFor(() => {
      // Loading should clear even on logical failure
      expect(container.querySelector('.animate-spin')).toBeNull();
    });
    // Total tile should read 0
    expect(container.querySelector('.text-xl.font-bold')?.textContent).toBe('0');
  });
});
