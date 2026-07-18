// @vitest-environment jsdom
import React, { useState } from 'react';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks for heavy/child deps
// ---------------------------------------------------------------------------

// MediaPicker — used by FeaturedImageSection. We expose value/onChange/label/
// apiEndpoint as data-* attributes so the test can assert the wiring without
// rendering the real picker (which fetches and renders a modal).
vi.mock('@/components/admin/MediaPicker', () => ({
  __esModule: true,
  default: ({ value, onChange, label, apiEndpoint }: any) =>
    React.createElement(
      'div',
      {
        'data-testid': 'media-picker',
        'data-value': value ?? '',
        'data-label': label ?? '',
        'data-api-endpoint': apiEndpoint ?? '',
      },
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'media-picker-change',
          onClick: () => onChange('https://cdn.example/new.jpg'),
        },
        'pick',
      ),
    ),
}));

// RevisionHistory — slide-over UI used by RevisionsPanel. Surface all props as
// data-attrs and expose buttons that trigger onClose / onRevert.
vi.mock('@/components/portal/RevisionHistory', () => ({
  __esModule: true,
  default: ({ siteId, postId, open, onClose, onRevert }: any) =>
    React.createElement(
      'div',
      {
        'data-testid': 'revision-history',
        'data-site-id': String(siteId),
        'data-post-id': String(postId),
        'data-open': String(open),
      },
      [
        React.createElement(
          'button',
          {
            key: 'close',
            type: 'button',
            'data-testid': 'rh-close',
            onClick: onClose,
          },
          'close',
        ),
        React.createElement(
          'button',
          {
            key: 'revert',
            type: 'button',
            'data-testid': 'rh-revert',
            onClick: onRevert,
          },
          'revert',
        ),
      ],
    ),
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------
import { StatusSection } from '@/components/portal/post-form/sections/StatusSection';
import { ContentTypeSelect } from '@/components/portal/post-form/sections/ContentTypeSelect';
import { FeaturedImageSection } from '@/components/portal/post-form/sections/FeaturedImageSection';
import { RevisionsPanel } from '@/components/portal/post-form/sections/RevisionsPanel';
import type { Post } from '@/components/portal/post-form/_lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    title: 'Hello',
    slug: 'hello',
    postType: 'page',
    content: '',
    published: false,
    ...overrides,
  };
}

/**
 * Tiny harness that gives the section a real useState so updater callbacks
 * (setFormData(prev => ...)) actually mutate observable state and can be
 * asserted via DOM.
 */
function StatusHarness({ initial }: { initial: Post }) {
  const [formData, setFormData] = useState<Post>(initial);
  return (
    <div>
      <StatusSection formData={formData} setFormData={setFormData} />
      <div data-testid="published-flag">{String(formData.published)}</div>
    </div>
  );
}

function FeaturedHarness({ initial, siteId }: { initial: Post; siteId: number }) {
  const [formData, setFormData] = useState<Post>(initial);
  return (
    <div>
      <FeaturedImageSection
        siteId={siteId}
        formData={formData}
        setFormData={setFormData}
      />
      <div data-testid="cover-image">{formData.coverImage ?? ''}</div>
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// StatusSection
// ---------------------------------------------------------------------------
describe('StatusSection', () => {
  it('renders the Status label and the draft + published options', () => {
    const setFormData = vi.fn();
    const { container } = render(
      <StatusSection formData={makePost()} setFormData={setFormData} />,
    );
    expect(container.textContent).toContain('Status');
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select).toBeTruthy();
    const options = Array.from(select.querySelectorAll('option')).map((o) => ({
      value: (o as HTMLOptionElement).value,
      label: o.textContent,
    }));
    expect(options).toEqual([
      { value: 'draft', label: 'Draft' },
      { value: 'published', label: 'Published' },
    ]);
  });

  it('reflects published=false as the "draft" option being selected', () => {
    const { container } = render(
      <StatusSection
        formData={makePost({ published: false })}
        setFormData={vi.fn()}
      />,
    );
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('draft');
  });

  it('reflects published=true as the "published" option being selected', () => {
    const { container } = render(
      <StatusSection
        formData={makePost({ published: true })}
        setFormData={vi.fn()}
      />,
    );
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('published');
  });

  it('flips published to true when the user selects "published"', () => {
    render(<StatusHarness initial={makePost({ published: false })} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'published' } });
    expect(screen.getByTestId('published-flag').textContent).toBe('true');
  });

  it('flips published to false when the user selects "draft"', () => {
    render(<StatusHarness initial={makePost({ published: true })} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'draft' } });
    expect(screen.getByTestId('published-flag').textContent).toBe('false');
  });

  it('preserves other Post fields when toggling published (functional updater)', () => {
    // Verify the change handler issues a functional setState updater, so
    // unrelated fields (title/slug/etc) on the latest snapshot survive the
    // toggle even when concurrent updates have happened between renders.
    const setFormData = vi.fn();
    const { container } = render(
      <StatusSection
        formData={makePost({ title: 'Keep Me', slug: 'keep-me' })}
        setFormData={setFormData}
      />,
    );
    const select = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'published' } });
    expect(setFormData).toHaveBeenCalledTimes(1);
    const updater = setFormData.mock.calls[0][0];
    expect(typeof updater).toBe('function');
    // Feed the updater an arbitrary "current state" snapshot — it should
    // spread that snapshot and only overwrite `published`. The value of
    // `published` in the returned object is whichever boolean the handler
    // computed from e.target.value at fire time; what matters here is that
    // title/slug round-trip through unchanged.
    const snapshot = makePost({
      title: 'Concurrent Title',
      slug: 'concurrent-slug',
      excerpt: 'kept',
    });
    const next = updater(snapshot);
    expect(next.title).toBe('Concurrent Title');
    expect(next.slug).toBe('concurrent-slug');
    expect(next.excerpt).toBe('kept');
    expect(typeof next.published).toBe('boolean');
  });
});

// ---------------------------------------------------------------------------
// ContentTypeSelect
// ---------------------------------------------------------------------------
describe('ContentTypeSelect', () => {
  const types = [
    { id: 1, slug: 'page', name: 'Page' },
    { id: 2, slug: 'post', name: 'Blog Post' },
    { id: 3, slug: 'product', name: 'Product' },
  ];

  it('renders one option per content type with slug/name wiring', () => {
    const { container } = render(
      <ContentTypeSelect
        value="post"
        contentTypes={types}
        onChange={vi.fn()}
      />,
    );
    const options = Array.from(
      container.querySelectorAll('option'),
    ) as HTMLOptionElement[];
    expect(options.length).toBe(3);
    expect(options.map((o) => o.value)).toEqual(['page', 'post', 'product']);
    expect(options.map((o) => o.textContent)).toEqual([
      'Page',
      'Blog Post',
      'Product',
    ]);
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('post');
  });

  it('forwards onChange with the chosen slug', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ContentTypeSelect
        value="page"
        contentTypes={types}
        onChange={onChange}
      />,
    );
    const select = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'product' } });
    expect(onChange).toHaveBeenCalledWith('product');
  });

  it('shows the current value as a fallback option when it is not in the list', () => {
    const { container } = render(
      <ContentTypeSelect
        value="ghost-type"
        contentTypes={types}
        onChange={vi.fn()}
      />,
    );
    const options = Array.from(
      container.querySelectorAll('option'),
    ) as HTMLOptionElement[];
    // 3 known + 1 fallback
    expect(options.length).toBe(4);
    expect(options[0].value).toBe('ghost-type');
    expect(options[0].textContent).toBe('ghost-type');
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('ghost-type');
  });

  it('skips the fallback option when the value matches a known type', () => {
    const { container } = render(
      <ContentTypeSelect
        value="page"
        contentTypes={types}
        onChange={vi.fn()}
      />,
    );
    const options = Array.from(
      container.querySelectorAll('option'),
    ) as HTMLOptionElement[];
    expect(options.length).toBe(3);
    expect(options[0].value).toBe('page');
  });

  it('renders a single "Page" fallback when the list is empty AND value is empty', () => {
    const { container } = render(
      <ContentTypeSelect value="" contentTypes={[]} onChange={vi.fn()} />,
    );
    const options = Array.from(
      container.querySelectorAll('option'),
    ) as HTMLOptionElement[];
    expect(options.length).toBe(1);
    expect(options[0].value).toBe('page');
    expect(options[0].textContent).toBe('Page');
  });

  it('renders BOTH the fallback value option AND the "Page" placeholder when list is empty', () => {
    // When contentTypes is empty AND the current value is unknown,
    // ContentTypeSelect renders two fallbacks: the value itself (so the
    // select isn't blank) and a hardcoded "Page" placeholder. The selected
    // option is still the current value.
    const { container } = render(
      <ContentTypeSelect
        value="custom"
        contentTypes={[]}
        onChange={vi.fn()}
      />,
    );
    const options = Array.from(
      container.querySelectorAll('option'),
    ) as HTMLOptionElement[];
    expect(options.length).toBe(2);
    expect(options[0].value).toBe('custom');
    expect(options[0].textContent).toBe('custom');
    expect(options[1].value).toBe('page');
    expect(options[1].textContent).toBe('Page');
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('custom');
  });

  it('applies the optional className to the underlying select', () => {
    const { container } = render(
      <ContentTypeSelect
        value="page"
        contentTypes={types}
        onChange={vi.fn()}
        className="my-select-cls"
      />,
    );
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.className).toBe('my-select-cls');
  });
});

// ---------------------------------------------------------------------------
// FeaturedImageSection
// ---------------------------------------------------------------------------
describe('FeaturedImageSection', () => {
  it('renders MediaPicker with siteId-derived endpoint and "Cover Image" label', () => {
    const { getByTestId } = render(
      <FeaturedImageSection
        siteId={42}
        formData={makePost({ coverImage: 'https://x/y.png' })}
        setFormData={vi.fn()}
      />,
    );
    const picker = getByTestId('media-picker');
    expect(picker.getAttribute('data-value')).toBe('https://x/y.png');
    expect(picker.getAttribute('data-label')).toBe('Cover Image');
    expect(picker.getAttribute('data-api-endpoint')).toBe(
      '/api/portal/cms/websites/42/media',
    );
  });

  it('passes an empty value when coverImage is undefined', () => {
    const { getByTestId } = render(
      <FeaturedImageSection
        siteId={7}
        formData={makePost()}
        setFormData={vi.fn()}
      />,
    );
    expect(getByTestId('media-picker').getAttribute('data-value')).toBe('');
  });

  it('updates coverImage when MediaPicker fires onChange', () => {
    render(<FeaturedHarness siteId={3} initial={makePost()} />);
    fireEvent.click(screen.getByTestId('media-picker-change'));
    expect(screen.getByTestId('cover-image').textContent).toBe(
      'https://cdn.example/new.jpg',
    );
  });

  it('forwards a functional updater so other form fields are preserved', () => {
    const setFormData = vi.fn();
    render(
      <FeaturedImageSection
        siteId={11}
        formData={makePost({ title: 'Hi', slug: 'hi' })}
        setFormData={setFormData}
      />,
    );
    fireEvent.click(screen.getByTestId('media-picker-change'));
    expect(setFormData).toHaveBeenCalledTimes(1);
    const updater = setFormData.mock.calls[0][0];
    expect(typeof updater).toBe('function');
    const next = updater(makePost({ title: 'Hi', slug: 'hi' }));
    expect(next).toMatchObject({
      title: 'Hi',
      slug: 'hi',
      coverImage: 'https://cdn.example/new.jpg',
    });
  });
});

// ---------------------------------------------------------------------------
// RevisionsPanel
// ---------------------------------------------------------------------------
describe('RevisionsPanel', () => {
  it('forwards siteId, postId, and open through to RevisionHistory', () => {
    const { getByTestId } = render(
      <RevisionsPanel siteId={9} postId={123} open onClose={vi.fn()} />,
    );
    const rh = getByTestId('revision-history');
    expect(rh.getAttribute('data-site-id')).toBe('9');
    expect(rh.getAttribute('data-post-id')).toBe('123');
    expect(rh.getAttribute('data-open')).toBe('true');
  });

  it('passes open=false through when the panel is closed', () => {
    const { getByTestId } = render(
      <RevisionsPanel
        siteId={1}
        postId={2}
        open={false}
        onClose={vi.fn()}
      />,
    );
    expect(getByTestId('revision-history').getAttribute('data-open')).toBe(
      'false',
    );
  });

  it('invokes the provided onClose when RevisionHistory requests close', () => {
    const onClose = vi.fn();
    const { getByTestId } = render(
      <RevisionsPanel siteId={1} postId={2} open onClose={onClose} />,
    );
    fireEvent.click(getByTestId('rh-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reloads the page when RevisionHistory fires onRevert', () => {
    const reload = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload },
    });
    try {
      const { getByTestId } = render(
        <RevisionsPanel siteId={5} postId={6} open onClose={vi.fn()} />,
      );
      fireEvent.click(getByTestId('rh-revert'));
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
      });
    }
  });
});
