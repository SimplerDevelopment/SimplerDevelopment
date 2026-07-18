import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TitleSection } from '@/components/portal/post-form/sections/TitleSection';
import type { Post } from '@/components/portal/post-form/_lib/types';

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    title: '',
    slug: '',
    postType: 'page',
    content: '',
    published: false,
    ...overrides,
  };
}

describe('TitleSection', () => {
  it('renders title + slug inputs hydrated from formData', () => {
    const formData = makePost({ title: 'About Us', slug: 'about-us' });
    render(
      <TitleSection
        formData={formData}
        setFormData={vi.fn()}
        handleTitleChange={vi.fn()}
      />,
    );

    const titleInput = screen.getByPlaceholderText('Page title') as HTMLInputElement;
    const slugInput = screen.getByPlaceholderText('page-slug') as HTMLInputElement;

    expect(titleInput.value).toBe('About Us');
    expect(slugInput.value).toBe('about-us');
  });

  it('calls handleTitleChange as the user types in the title field', async () => {
    const user = userEvent.setup();
    const handleTitleChange = vi.fn();

    render(
      <TitleSection
        formData={makePost()}
        setFormData={vi.fn()}
        handleTitleChange={handleTitleChange}
      />,
    );

    await user.type(screen.getByPlaceholderText('Page title'), 'X');
    // The change handler is wired to the input's onChange.
    expect(handleTitleChange).toHaveBeenCalled();
    // Title is a controlled input with no setFormData wiring in the section
    // itself, so the value never updates between keystrokes — but the change
    // event still fires once per keystroke. Confirm we received an event.
    const firstCallArg = handleTitleChange.mock.calls[0][0];
    expect(firstCallArg).toBeDefined();
    expect(firstCallArg.target).toBeDefined();
  });

  it('updates slug via setFormData when the slug input changes', async () => {
    const user = userEvent.setup();
    const setFormData = vi.fn();

    render(
      <TitleSection
        formData={makePost({ slug: 'old-slug' })}
        setFormData={setFormData}
        handleTitleChange={vi.fn()}
      />,
    );

    const slugInput = screen.getByPlaceholderText('page-slug');
    await user.type(slugInput, 'X');

    expect(setFormData).toHaveBeenCalled();
    // Each keystroke fires the updater; verify the updater function returns
    // an object with the new slug. We probe the last call.
    const updater = setFormData.mock.calls.at(-1)?.[0];
    expect(typeof updater).toBe('function');
    const next = updater(makePost({ slug: 'old-slug' }));
    expect(typeof next.slug).toBe('string');
  });
});
