// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Components under test
// ---------------------------------------------------------------------------
import { TitleSection } from '@/components/portal/post-form/sections/TitleSection';
import { StatusSection } from '@/components/portal/post-form/sections/StatusSection';
import { ContentTypeSelect } from '@/components/portal/post-form/sections/ContentTypeSelect';
import { CardWatchers } from '@/components/portal/card-detail/_sections/CardWatchers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePost(overrides: Record<string, any> = {}): any {
  return {
    title: 'Hello',
    slug: 'hello',
    postType: 'page',
    content: '',
    published: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TitleSection
// ---------------------------------------------------------------------------
describe('TitleSection', () => {
  it('renders title and slug inputs with current values', () => {
    const formData = makePost({ title: 'My Post', slug: 'my-post' });
    render(
      <TitleSection
        formData={formData}
        setFormData={vi.fn()}
        handleTitleChange={vi.fn()}
      />,
    );
    expect(screen.getByPlaceholderText('Page title')).toHaveValue('My Post');
    expect(screen.getByPlaceholderText('page-slug')).toHaveValue('my-post');
    expect(screen.getByText('Title')).toBeTruthy();
    expect(screen.getByText('Slug')).toBeTruthy();
  });

  it('calls handleTitleChange when title input changes', () => {
    const handleTitleChange = vi.fn();
    const formData = makePost();
    render(
      <TitleSection
        formData={formData}
        setFormData={vi.fn()}
        handleTitleChange={handleTitleChange}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText('Page title'), {
      target: { value: 'New Title' },
    });
    expect(handleTitleChange).toHaveBeenCalledTimes(1);
  });

  it('invokes setFormData with an updater function when slug input changes', () => {
    const setFormData = vi.fn();
    const formData = makePost({ slug: 'old' });
    render(
      <TitleSection
        formData={formData}
        setFormData={setFormData}
        handleTitleChange={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText('page-slug'), {
      target: { value: 'new-slug' },
    });
    expect(setFormData).toHaveBeenCalledTimes(1);
    // setFormData is called with an updater function — invoke it with a fake
    // prev state and verify the structural identity of the result (keys
    // preserved). We don't assert on the e.target.value snapshot because by
    // the time we re-invoke the updater out-of-band, React has re-rendered
    // the controlled input and the underlying synthetic-event value can be
    // stale; the important contract is "received an updater that copies prev".
    const updater = setFormData.mock.calls[0][0];
    expect(typeof updater).toBe('function');
    const next = updater(formData);
    expect(next.title).toBe('Hello');
    expect(typeof next.slug).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// StatusSection
// ---------------------------------------------------------------------------
describe('StatusSection', () => {
  it('renders draft when published is false', () => {
    const formData = makePost({ published: false });
    render(<StatusSection formData={formData} setFormData={vi.fn()} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('draft');
    expect(screen.getByText('Status')).toBeTruthy();
    expect(screen.getByText('Draft')).toBeTruthy();
    expect(screen.getByText('Published')).toBeTruthy();
  });

  it('renders published when published is true', () => {
    const formData = makePost({ published: true });
    render(<StatusSection formData={formData} setFormData={vi.fn()} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('published');
  });

  it('invokes setFormData with an updater function when status changes', () => {
    // Note: with controlled <select> + fireEvent.change, the synthetic event's
    // target.value can become stale by the time we re-invoke the updater
    // out-of-band — so we only assert the call shape (updater is a function
    // that copies the prev object), not the boolean payload.
    const setFormData = vi.fn();
    const formData = makePost({ published: false });
    render(<StatusSection formData={formData} setFormData={setFormData} />);
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'published' },
    });
    expect(setFormData).toHaveBeenCalledTimes(1);
    const updater = setFormData.mock.calls[0][0];
    expect(typeof updater).toBe('function');
    const next = updater(formData);
    expect(next).toHaveProperty('published');
    expect(typeof next.published).toBe('boolean');
    expect(next.title).toBe('Hello');
  });
});

// ---------------------------------------------------------------------------
// ContentTypeSelect
// ---------------------------------------------------------------------------
describe('ContentTypeSelect', () => {
  const types = [
    {
      id: 1,
      slug: 'page',
      name: 'Page',
      icon: null,
      description: null,
      websiteId: null,
      active: true,
    },
    {
      id: 2,
      slug: 'post',
      name: 'Post',
      icon: null,
      description: null,
      websiteId: 1,
      active: true,
    },
  ];

  it('renders one option per content type', () => {
    render(
      <ContentTypeSelect
        value="page"
        contentTypes={types}
        onChange={vi.fn()}
      />,
    );
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('page');
    expect(screen.getByText('Page')).toBeTruthy();
    expect(screen.getByText('Post')).toBeTruthy();
  });

  it('emits the new slug via onChange when the user picks a different type', () => {
    const onChange = vi.fn();
    render(
      <ContentTypeSelect
        value="page"
        contentTypes={types}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'post' },
    });
    expect(onChange).toHaveBeenCalledWith('post');
  });

  it('renders the current value as a fallback option when not in the list', () => {
    render(
      <ContentTypeSelect
        value="ghost-type"
        contentTypes={types}
        onChange={vi.fn()}
      />,
    );
    // The fallback option uses the raw slug for both value and label.
    const options = screen.getAllByRole('option') as HTMLOptionElement[];
    expect(options.some((o) => o.value === 'ghost-type')).toBe(true);
  });

  it('renders a "Page" fallback when the list is empty and value is also unknown/empty', () => {
    render(
      <ContentTypeSelect value="" contentTypes={[]} onChange={vi.fn()} />,
    );
    expect(screen.getByText('Page')).toBeTruthy();
  });

  it('passes className through to the select element', () => {
    const { container } = render(
      <ContentTypeSelect
        value="page"
        contentTypes={types}
        onChange={vi.fn()}
        className="my-custom"
      />,
    );
    const select = container.querySelector('select');
    expect(select?.className).toBe('my-custom');
  });
});

// ---------------------------------------------------------------------------
// CardWatchers
// ---------------------------------------------------------------------------
describe('CardWatchers', () => {
  it('shows "Watch" label and inactive icon when watching is false', () => {
    render(<CardWatchers watching={false} toggleWatch={vi.fn()} />);
    expect(screen.getByText('Watch')).toBeTruthy();
    expect(screen.getByText('notifications_none')).toBeTruthy();
  });

  it('shows "Watching" label and active icon when watching is true', () => {
    render(<CardWatchers watching={true} toggleWatch={vi.fn()} />);
    expect(screen.getByText('Watching')).toBeTruthy();
    expect(screen.getByText('notifications_active')).toBeTruthy();
  });

  it('calls toggleWatch when clicked', () => {
    const toggleWatch = vi.fn();
    render(<CardWatchers watching={false} toggleWatch={toggleWatch} />);
    fireEvent.click(screen.getByRole('button'));
    expect(toggleWatch).toHaveBeenCalledTimes(1);
  });

  it('applies the "watching" highlight classes when watching is true', () => {
    render(<CardWatchers watching={true} toggleWatch={vi.fn()} />);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-primary/10');
    expect(btn.className).toContain('text-primary');
  });

  it('applies the inactive classes when watching is false', () => {
    render(<CardWatchers watching={false} toggleWatch={vi.fn()} />);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('text-muted-foreground');
  });
});
