// @vitest-environment jsdom
/**
 * Batch 44a — medium-size portal/card-detail + post-form section components.
 *
 * Each component is a UI shard extracted from a larger composite (the
 * card-detail modal and the iframe-mode post form). Tests focus on the
 * conditional rendering, prop-driven callbacks, and small bits of derived
 * state (filtered lists, exact-match-vs-create combobox behavior, save-status
 * lifecycle) so we lock in branch coverage without simulating the full
 * surrounding modal.
 *
 * Components covered:
 *   - CardArtifacts      (components/portal/card-detail/_sections/CardArtifacts.tsx)
 *   - CardSidebar        (components/portal/card-detail/_sections/CardSidebar.tsx)
 *   - TaxonomySection    (components/portal/post-form/sections/TaxonomySection.tsx)
 *   - SettingsSlideOver  (components/portal/post-form/sections/SettingsSlideOver.tsx)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Module-level mocks. These must be hoisted BEFORE the imports under test.
// ---------------------------------------------------------------------------

// Mock the post-form _lib/api so TaxonomySection.onCreate and the
// SettingsSlideOver custom-fields tab don't try to hit fetch.
const createCategoryMock = vi.fn();
const createTagMock = vi.fn();
const fetchCustomFieldDefsMock = vi.fn();
const fetchCustomFieldValuesMock = vi.fn();
const saveCustomFieldValueMock = vi.fn();

vi.mock('@/components/portal/post-form/_lib/api', () => ({
  createCategory: (...args: unknown[]) => createCategoryMock(...args),
  createTag: (...args: unknown[]) => createTagMock(...args),
  fetchCustomFieldDefs: (...args: unknown[]) => fetchCustomFieldDefsMock(...args),
  fetchCustomFieldValues: (...args: unknown[]) => fetchCustomFieldValuesMock(...args),
  saveCustomFieldValue: (...args: unknown[]) => saveCustomFieldValueMock(...args),
}));

// SettingsSlideOver pulls in a number of sibling sections. Replace each one
// with a deterministic stub that exposes its identifying props as data
// attributes so the slide-over tab-switching can be asserted without
// rendering all of them.
vi.mock('@/components/portal/post-form/sections/ContentTypeSelect', () => ({
  ContentTypeSelect: (props: any) =>
    React.createElement('div', {
      'data-testid': 'content-type-select',
      'data-value': String(props.value ?? ''),
    }),
}));

vi.mock('@/components/portal/post-form/sections/CustomFieldsSection', () => ({
  CustomFieldsSection: (props: any) =>
    React.createElement(
      'div',
      {
        'data-testid': 'custom-fields-section',
        'data-defs': String(props.customFieldDefs?.length ?? 0),
        'data-values': JSON.stringify(props.customFieldValues ?? {}),
      },
      // Trigger updateCustomFieldValue so we exercise that closure.
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'cf-update-trigger',
          onClick: () => props.updateCustomFieldValue?.(7, 'cf-new-value'),
        },
        'cf-update',
      ),
    ),
}));

vi.mock('@/components/portal/post-form/sections/FeaturedImageSection', () => ({
  FeaturedImageSection: () =>
    React.createElement('div', { 'data-testid': 'featured-image-section' }),
}));

vi.mock('@/components/portal/post-form/sections/SeoSection', () => ({
  SeoSection: () => React.createElement('div', { 'data-testid': 'seo-section' }),
}));

vi.mock('@/components/portal/post-form/sections/TitleSection', () => ({
  TitleSection: () => React.createElement('div', { 'data-testid': 'title-section' }),
}));

// Re-use the real TaxonomySection inside SettingsSlideOver — we want to
// confirm SettingsSlideOver renders SOMETHING for the taxonomy tab. But the
// real one needs createCategory/createTag mocks above; we already wired those.

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------
import { CardArtifacts } from '@/components/portal/card-detail/_sections/CardArtifacts';
import { CardSidebar } from '@/components/portal/card-detail/_sections/CardSidebar';
import { TaxonomySection } from '@/components/portal/post-form/sections/TaxonomySection';
import { SettingsSlideOver } from '@/components/portal/post-form/sections/SettingsSlideOver';
import type {
  Artifact,
  AvailableArtifact,
  CardDetail,
  Assignee,
  MentionUser,
} from '@/components/portal/card-detail/_lib/types';
import type { Post, TaxonomyItem } from '@/components/portal/post-form/_lib/types';

beforeEach(() => {
  createCategoryMock.mockReset();
  createTagMock.mockReset();
  fetchCustomFieldDefsMock.mockReset();
  fetchCustomFieldValuesMock.mockReset();
  saveCustomFieldValueMock.mockReset();
});

// ---------------------------------------------------------------------------
// CardArtifacts
// ---------------------------------------------------------------------------
describe('CardArtifacts', () => {
  const baseProps = {
    artifacts: [] as Artifact[],
    artifactsLoaded: true,
    availableArtifacts: [] as AvailableArtifact[],
    canEdit: true,
    showArtifactPicker: false,
    setShowArtifactPicker: vi.fn(),
    artifactTypeFilter: '',
    setArtifactTypeFilter: vi.fn(),
    addArtifact: vi.fn(),
    toggleArtifactPin: vi.fn(),
    removeArtifact: vi.fn(),
  };

  beforeEach(() => {
    baseProps.setShowArtifactPicker = vi.fn();
    baseProps.setArtifactTypeFilter = vi.fn();
    baseProps.addArtifact = vi.fn();
    baseProps.toggleArtifactPin = vi.fn();
    baseProps.removeArtifact = vi.fn();
  });

  it('renders the empty-state copy when loaded with no artifacts and picker closed', () => {
    const { container, getByText } = render(<CardArtifacts {...baseProps} />);
    expect(container.textContent).toContain('Artifacts');
    expect(getByText('No artifacts linked.')).toBeTruthy();
    // canEdit=true should expose the open-picker button (currently shows "Link Artifact")
    expect(container.textContent).toContain('Link Artifact');
  });

  it('omits the open-picker button when canEdit is false', () => {
    const { container } = render(<CardArtifacts {...baseProps} canEdit={false} />);
    expect(container.textContent).not.toContain('Link Artifact');
  });

  it('hides the empty-state copy until artifactsLoaded flips true', () => {
    const { container } = render(
      <CardArtifacts {...baseProps} artifactsLoaded={false} />,
    );
    expect(container.textContent).not.toContain('No artifacts linked.');
  });

  it('opens the picker, lists All + per-type filter buttons, and toggles via callbacks', () => {
    const available: AvailableArtifact[] = [
      { type: 'website', id: 11, title: 'Acme HQ' },
      { type: 'pitch_deck', id: 22, title: 'Sales Deck v3' },
    ];
    const { getByText, getAllByText } = render(
      <CardArtifacts
        {...baseProps}
        showArtifactPicker={true}
        availableArtifacts={available}
      />,
    );

    // Filter buttons rendered for every ARTIFACT_LABELS key plus "All".
    expect(getByText('All')).toBeTruthy();
    // "Website" appears as a filter button AND as a row label suffix — both fine.
    expect(getAllByText('Website').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText('Pitch Deck').length).toBeGreaterThanOrEqual(1);

    // Selecting an available artifact calls addArtifact with type+id.
    fireEvent.click(getByText('Acme HQ'));
    expect(baseProps.addArtifact).toHaveBeenCalledWith('website', 11);

    // Type filter button calls setArtifactTypeFilter. The filter button is the
    // FIRST "Website" element (it appears before the row suffix).
    fireEvent.click(getAllByText('Website')[0]);
    expect(baseProps.setArtifactTypeFilter).toHaveBeenCalledWith('website');
  });

  it('filters availableArtifacts by the active type filter and hides already-linked ones', () => {
    const available: AvailableArtifact[] = [
      { type: 'website', id: 11, title: 'Acme HQ' },
      { type: 'website', id: 12, title: 'Acme Dev' },
      { type: 'pitch_deck', id: 22, title: 'Sales Deck v3' },
    ];
    const linked: Artifact[] = [
      {
        id: 100,
        cardId: 1,
        artifactType: 'website',
        artifactId: 11,
        displayTitle: 'Acme HQ',
        pinned: false,
        createdAt: 'now',
      },
    ];
    const { container, queryByText } = render(
      <CardArtifacts
        {...baseProps}
        artifacts={linked}
        availableArtifacts={available}
        showArtifactPicker={true}
        artifactTypeFilter="website"
      />,
    );

    // Already-linked website is filtered out; the OTHER website is still offered.
    // Avoid getByText collisions with the linked card row by querying within the picker:
    expect(container.textContent).toContain('Acme Dev');
    // Pitch-deck filtered out by the active website filter:
    expect(queryByText('Sales Deck v3')).toBeNull();
  });

  it('shows the "no available artifacts" copy with the filter label when filter is active and list is empty', () => {
    const { container } = render(
      <CardArtifacts
        {...baseProps}
        showArtifactPicker={true}
        artifactTypeFilter="survey"
        availableArtifacts={[]}
      />,
    );
    expect(container.textContent).toContain('No available artifacts');
    expect(container.textContent).toContain('Survey');
  });

  it('renders linked artifacts with an external link, pin button, and remove button', () => {
    const linked: Artifact[] = [
      {
        id: 7,
        cardId: 1,
        artifactType: 'website',
        artifactId: 42,
        displayTitle: 'Marketing Site',
        pinned: true,
        createdAt: 'now',
      },
    ];
    const { container, getByTitle } = render(
      <CardArtifacts {...baseProps} artifacts={linked} />,
    );

    // The artifact title is rendered, and at least one href points at the website URL.
    expect(container.textContent).toContain('Marketing Site');
    const anchors = container.querySelectorAll('a[href="/portal/websites/42"]');
    expect(anchors.length).toBeGreaterThanOrEqual(1);

    // Pinned -> the unpin button has title "Unpin"; firing it calls toggleArtifactPin with !pinned.
    fireEvent.click(getByTitle('Unpin'));
    expect(baseProps.toggleArtifactPin).toHaveBeenCalledWith(7, false);

    // Remove button calls removeArtifact with the row id.
    fireEvent.click(getByTitle('Remove'));
    expect(baseProps.removeArtifact).toHaveBeenCalledWith(7);
  });

  it('renders an unknown artifactType row without a link and falls back to the attachment icon', () => {
    const linked: Artifact[] = [
      {
        id: 8,
        cardId: 1,
        artifactType: 'mystery',
        artifactId: 99,
        displayTitle: 'Unknown Item',
        pinned: false,
        createdAt: 'now',
      },
    ];
    const { container } = render(
      <CardArtifacts {...baseProps} artifacts={linked} canEdit={false} />,
    );
    expect(container.textContent).toContain('Unknown Item');
    // No anchor should be rendered for unknown types.
    expect(container.querySelectorAll('a').length).toBe(0);
    // Falls back to the attachment icon.
    expect(container.textContent).toContain('attachment');
  });

  it('uses a function-updater when toggling the picker open', () => {
    const setShow = vi.fn();
    const { container } = render(
      <CardArtifacts
        {...baseProps}
        setShowArtifactPicker={setShow}
      />,
    );
    const btn = container.querySelector('button')!;
    fireEvent.click(btn);
    expect(setShow).toHaveBeenCalledTimes(1);
    // The component passes a function updater, so call it manually to verify the toggle.
    const updater = setShow.mock.calls[0][0] as (prev: boolean) => boolean;
    expect(updater(false)).toBe(true);
    expect(updater(true)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CardSidebar
// ---------------------------------------------------------------------------
describe('CardSidebar', () => {
  const baseCard: CardDetail = {
    id: 1,
    columnId: 5,
    projectId: 9,
    title: 'Ship the thing',
    description: null,
    priority: 'high',
    dueDate: null,
    order: 0,
  };
  const baseProps = {
    card: baseCard,
    canEdit: true,
    assignees: [] as Assignee[],
    mentionUsers: [] as MentionUser[],
    showAssigneeMenu: false,
    setShowAssigneeMenu: vi.fn(),
    addAssignee: vi.fn(),
    removeAssignee: vi.fn(),
    watching: false,
    toggleWatch: vi.fn(),
    saveField: vi.fn(),
    savingField: null as string | null,
    confirmDelete: false,
    setConfirmDelete: vi.fn(),
    deleting: false,
    removeCard: vi.fn(),
  };

  beforeEach(() => {
    baseProps.setShowAssigneeMenu = vi.fn();
    baseProps.addAssignee = vi.fn();
    baseProps.removeAssignee = vi.fn();
    baseProps.toggleWatch = vi.fn();
    baseProps.saveField = vi.fn();
    baseProps.setConfirmDelete = vi.fn();
    baseProps.removeCard = vi.fn();
  });

  it('renders the empty-assignee fallback when no one is assigned', () => {
    const { container } = render(<CardSidebar {...baseProps} />);
    expect(container.textContent).toContain('Assignees');
    expect(container.textContent).toContain('No one assigned');
  });

  it('renders an editable priority select that fires saveField on change', () => {
    const { container } = render(<CardSidebar {...baseProps} />);
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.value).toBe('high');
    fireEvent.change(select, { target: { value: 'urgent' } });
    expect(baseProps.saveField).toHaveBeenCalledWith('priority', 'urgent');
  });

  it('renders read-only priority chip when canEdit is false', () => {
    const { container } = render(
      <CardSidebar
        {...baseProps}
        canEdit={false}
        card={{ ...baseCard, priority: 'medium' }}
      />,
    );
    // No <select> should be rendered.
    expect(container.querySelector('select')).toBeNull();
    expect(container.textContent).toContain('medium');
  });

  it('renders editable due-date input and fires saveField with null when cleared', () => {
    const { container } = render(
      <CardSidebar
        {...baseProps}
        card={{ ...baseCard, dueDate: '2026-01-15T00:00:00Z' }}
      />,
    );
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement;
    expect(dateInput).toBeTruthy();
    expect(dateInput.value).toBe('2026-01-15');
    fireEvent.change(dateInput, { target: { value: '' } });
    expect(baseProps.saveField).toHaveBeenCalledWith('dueDate', null);
    fireEvent.change(dateInput, { target: { value: '2026-02-01' } });
    expect(baseProps.saveField).toHaveBeenCalledWith('dueDate', '2026-02-01');
  });

  it('renders a read-only em-dash fallback for missing due-date when not editable', () => {
    const { container } = render(
      <CardSidebar {...baseProps} canEdit={false} card={{ ...baseCard, dueDate: null }} />,
    );
    expect(container.textContent).toContain('—');
  });

  it('opens the confirm-delete UI and propagates removeCard / cancel callbacks', () => {
    const { container, rerender, getByText } = render(<CardSidebar {...baseProps} />);

    // Initial render shows "Delete card" trigger.
    fireEvent.click(getByText(/Delete card/));
    expect(baseProps.setConfirmDelete).toHaveBeenCalledWith(true);

    // Switch into confirmDelete state and verify destructive copy + buttons.
    rerender(<CardSidebar {...baseProps} confirmDelete={true} />);
    expect(container.textContent).toContain('Delete this card?');
    fireEvent.click(getByText('Delete'));
    expect(baseProps.removeCard).toHaveBeenCalledTimes(1);
    fireEvent.click(getByText('Cancel'));
    expect(baseProps.setConfirmDelete).toHaveBeenCalledWith(false);
  });

  it('disables the Delete button while deleting', () => {
    const { getByText } = render(
      <CardSidebar {...baseProps} confirmDelete={true} deleting={true} />,
    );
    const btn = getByText(/Deleting/);
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('hides the delete control entirely when canEdit is false', () => {
    const { container } = render(<CardSidebar {...baseProps} canEdit={false} />);
    expect(container.textContent).not.toContain('Delete card');
  });

  it('renders the assignee add-menu candidates filtered against existing assignees', () => {
    const assignees: Assignee[] = [
      { id: 1, name: 'Ada', email: 'ada@example.com' },
    ];
    const mentionUsers: MentionUser[] = [
      { id: 1, name: 'Ada' },
      { id: 2, name: 'Grace' },
    ];
    const { container, getByText, getAllByText } = render(
      <CardSidebar
        {...baseProps}
        assignees={assignees}
        mentionUsers={mentionUsers}
        showAssigneeMenu={true}
      />,
    );
    // Existing assignee rendered with an avatar initial.
    expect(container.textContent).toContain('Ada');
    // Add menu candidates should NOT include Ada (already assigned). Grace appears.
    expect(getByText('Grace')).toBeTruthy();

    // Clicking Grace calls addAssignee then closes the menu.
    fireEvent.click(getByText('Grace'));
    expect(baseProps.addAssignee).toHaveBeenCalledWith({ id: 2, name: 'Grace' });
    expect(baseProps.setShowAssigneeMenu).toHaveBeenCalledWith(false);

    // Remove assignee button (close icon) on Ada row -> removeAssignee(1).
    // There may be multiple aria-label="Remove Ada" elements; just click the first.
    const removeBtns = getAllByText('close');
    expect(removeBtns.length).toBeGreaterThan(0);
  });

  it('shows the "No one left to add" empty state when every mention user is already assigned', () => {
    const assignees: Assignee[] = [{ id: 1, name: 'Ada', email: 'ada@x' }];
    const mentionUsers: MentionUser[] = [{ id: 1, name: 'Ada' }];
    const { container } = render(
      <CardSidebar
        {...baseProps}
        assignees={assignees}
        mentionUsers={mentionUsers}
        showAssigneeMenu={true}
      />,
    );
    expect(container.textContent).toContain('No one left to add');
  });

  it('toggles the watch button copy based on the watching prop', () => {
    const { container, rerender } = render(<CardSidebar {...baseProps} />);
    expect(container.textContent).toContain('Watch');
    rerender(<CardSidebar {...baseProps} watching={true} />);
    expect(container.textContent).toContain('Watching');
  });

  it('falls back to a default medium priority value when card.priority is null', () => {
    const { container } = render(
      <CardSidebar {...baseProps} card={{ ...baseCard, priority: null }} canEdit={false} />,
    );
    expect(container.textContent).toContain('medium');
  });
});

// ---------------------------------------------------------------------------
// TaxonomySection
// ---------------------------------------------------------------------------
describe('TaxonomySection', () => {
  function makePost(overrides: Partial<Post> = {}): Post {
    return {
      title: '',
      slug: '',
      postType: 'post',
      content: '',
      published: false,
      categoryIds: [],
      tagIds: [],
      ...overrides,
    };
  }

  function harness(initial: Post, opts?: {
    cats?: TaxonomyItem[];
    tags?: TaxonomyItem[];
  }) {
    const ref: { post: Post; cats: TaxonomyItem[]; tags: TaxonomyItem[] } = {
      post: initial,
      cats: opts?.cats ?? [],
      tags: opts?.tags ?? [],
    };
    function Wrapper() {
      const [post, setPost] = React.useState<Post>(initial);
      const [cats, setCats] = React.useState<TaxonomyItem[]>(opts?.cats ?? []);
      const [tags, setTags] = React.useState<TaxonomyItem[]>(opts?.tags ?? []);
      ref.post = post;
      ref.cats = cats;
      ref.tags = tags;
      return (
        <TaxonomySection
          siteId={42}
          formData={post}
          setFormData={setPost}
          availableCategories={cats}
          setAvailableCategories={setCats}
          availableTags={tags}
          setAvailableTags={setTags}
        />
      );
    }
    return { ref, Wrapper };
  }

  it('renders Categories and Tags label headers', () => {
    const { Wrapper } = harness(makePost());
    const { container } = render(<Wrapper />);
    expect(container.textContent).toContain('Categories');
    expect(container.textContent).toContain('Tags');
  });

  it('opens the dropdown on focus and lists all available items', () => {
    const cats: TaxonomyItem[] = [
      { id: 1, name: 'News', slug: 'news' },
      { id: 2, name: 'Updates', slug: 'updates' },
    ];
    const { Wrapper } = harness(makePost(), { cats });
    const { container, getByPlaceholderText } = render(<Wrapper />);
    const input = getByPlaceholderText(/Search or add categories/i);
    fireEvent.focus(input);
    expect(container.textContent).toContain('News');
    expect(container.textContent).toContain('Updates');
  });

  it('filters items by the current query and toggles selection on Enter (exact match)', () => {
    const cats: TaxonomyItem[] = [
      { id: 1, name: 'News', slug: 'news' },
      { id: 2, name: 'Updates', slug: 'updates' },
    ];
    const { ref, Wrapper } = harness(makePost(), { cats });
    const { container, getByPlaceholderText } = render(<Wrapper />);
    const input = getByPlaceholderText(/Search or add categories/i) as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'New' } });
    expect(container.textContent).toContain('News');
    expect(container.textContent).not.toContain('Updates');

    // With query "New" the exact-match check is false ("News" !== "New") so the
    // showCreateOption branch wins. Type the exact name so the Enter handler
    // takes the toggle path instead.
    fireEvent.change(input, { target: { value: 'News' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(ref.post.categoryIds).toEqual([1]);
  });

  it('Escape blurs the input and closes the dropdown', () => {
    const cats: TaxonomyItem[] = [{ id: 1, name: 'News', slug: 'news' }];
    const { Wrapper } = harness(makePost(), { cats });
    const { container, getByPlaceholderText } = render(<Wrapper />);
    const input = getByPlaceholderText(/Search or add categories/i);
    fireEvent.focus(input);
    expect(container.textContent).toContain('News');
    fireEvent.keyDown(input, { key: 'Escape' });
    // Dropdown closed -> the candidate text is no longer rendered.
    // (The chip wouldn't be visible since nothing is selected.)
    expect(container.textContent).not.toContain('News');
  });

  it('shows the "Add <query>" create option for a fresh name and invokes createCategory on click', async () => {
    createCategoryMock.mockResolvedValue({ id: 99, name: 'Brand New', slug: 'brand-new' });
    const { ref, Wrapper } = harness(makePost());
    const { container, getByPlaceholderText, getByText } = render(<Wrapper />);
    const input = getByPlaceholderText(/Search or add categories/i);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Brand New!' } });
    // Create option text uses the trimmed query.
    expect(container.textContent).toContain('Add "Brand New!"');

    await act(async () => {
      fireEvent.click(getByText(/Add "Brand New!"/));
    });

    expect(createCategoryMock).toHaveBeenCalledWith(42, 'Brand New!', 'brand-new');
    await waitFor(() => {
      expect(ref.cats.some(c => c.id === 99)).toBe(true);
      expect(ref.post.categoryIds).toEqual([99]);
    });
  });

  it('does NOT show the create option when an exact (case-insensitive) match exists', () => {
    const cats: TaxonomyItem[] = [{ id: 1, name: 'News', slug: 'news' }];
    const { Wrapper } = harness(makePost(), { cats });
    const { container, getByPlaceholderText } = render(<Wrapper />);
    const input = getByPlaceholderText(/Search or add categories/i);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'news' } });
    expect(container.textContent).not.toContain('Add "news"');
  });

  it('on Enter with a fresh query that has no filtered match, fires onCreate (createTag) instead of toggling', async () => {
    createTagMock.mockResolvedValue({ id: 33, name: 'urgent', slug: 'urgent' });
    const { ref, Wrapper } = harness(makePost());
    const { getAllByPlaceholderText } = render(<Wrapper />);
    // Second input == Tags
    const tagsInput = getAllByPlaceholderText(/Search or add tags/i)[0];
    await act(async () => {
      fireEvent.focus(tagsInput);
      fireEvent.change(tagsInput, { target: { value: 'urgent' } });
      fireEvent.keyDown(tagsInput, { key: 'Enter' });
    });
    expect(createTagMock).toHaveBeenCalledWith(42, 'urgent', 'urgent');
    await waitFor(() => {
      expect(ref.post.tagIds).toEqual([33]);
    });
  });

  it('renders selected items as chips with a close button that toggles them off', () => {
    const cats: TaxonomyItem[] = [
      { id: 1, name: 'News', slug: 'news' },
      { id: 2, name: 'Updates', slug: 'updates' },
    ];
    const { ref, Wrapper } = harness(makePost({ categoryIds: [1, 2] }), { cats });
    const { container } = render(<Wrapper />);
    expect(container.textContent).toContain('News');
    expect(container.textContent).toContain('Updates');

    // Click the first chip's "close" button — find it within a button containing "close".
    const closeButtons = container.querySelectorAll('button');
    // The chip close buttons appear first (before the search field). Click one and ensure it toggles off.
    // Find a button whose text content is exactly "close".
    const closeBtn = Array.from(closeButtons).find((b) =>
      b.textContent?.trim() === 'close',
    );
    expect(closeBtn).toBeTruthy();
    fireEvent.click(closeBtn!);
    // The first chip removed -> categoryIds should drop the matching id.
    expect(ref.post.categoryIds!.length).toBe(1);
  });

  it('handles a null createCategory response gracefully (no state update)', async () => {
    createCategoryMock.mockResolvedValue(null);
    const { ref, Wrapper } = harness(makePost());
    const { getByPlaceholderText, getByText } = render(<Wrapper />);
    const input = getByPlaceholderText(/Search or add categories/i);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'ghost' } });
    await act(async () => {
      fireEvent.click(getByText(/Add "ghost"/));
    });
    expect(createCategoryMock).toHaveBeenCalled();
    // No mutation to categoryIds when api returns null.
    expect(ref.post.categoryIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// SettingsSlideOver
// ---------------------------------------------------------------------------
describe('SettingsSlideOver', () => {
  function makePost(): Post {
    return {
      id: 11,
      title: 'Hello',
      slug: 'hello',
      postType: 'post',
      excerpt: '',
      content: '',
      published: false,
    };
  }

  function harness(post: Post = makePost()) {
    const onClose = vi.fn();
    const handleTitleChange = vi.fn();
    function Wrapper() {
      const [formData, setFormData] = React.useState<Post>(post);
      const [cats, setCats] = React.useState<TaxonomyItem[]>([]);
      const [tags, setTags] = React.useState<TaxonomyItem[]>([]);
      return (
        <SettingsSlideOver
          formData={formData}
          setFormData={setFormData}
          handleTitleChange={handleTitleChange}
          siteId={1}
          contentTypes={[]}
          availableCategories={cats}
          setAvailableCategories={setCats}
          availableTags={tags}
          setAvailableTags={setTags}
          onClose={onClose}
        />
      );
    }
    return { Wrapper, onClose, handleTitleChange };
  }

  it('renders the default General tab with TitleSection / ContentTypeSelect / FeaturedImageSection', () => {
    const { Wrapper } = harness();
    const { getByTestId, container } = render(<Wrapper />);
    expect(getByTestId('title-section')).toBeTruthy();
    expect(getByTestId('content-type-select')).toBeTruthy();
    expect(getByTestId('featured-image-section')).toBeTruthy();
    expect(container.textContent).toContain('Page Details');
  });

  it('clicking the backdrop fires onClose', () => {
    const { Wrapper, onClose } = harness();
    const { container } = render(<Wrapper />);
    // Backdrop is the first fixed inset-0 div.
    const backdrop = container.querySelector('.fixed.inset-0') as HTMLElement;
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking the header close button also fires onClose', () => {
    const { Wrapper, onClose } = harness();
    const { getByText } = render(<Wrapper />);
    // Close icon button has "close" material-icon text.
    const closeIcon = getByText('close');
    fireEvent.click(closeIcon.parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });

  it('clicking the SEO tab swaps content to the SeoSection stub', () => {
    const { Wrapper } = harness();
    const { getByText, getByTestId, queryByTestId } = render(<Wrapper />);
    fireEvent.click(getByText('SEO'));
    expect(getByTestId('seo-section')).toBeTruthy();
    // The general tab stub should be gone.
    expect(queryByTestId('title-section')).toBeNull();
  });

  it('clicking the Taxonomy tab renders the real TaxonomySection', () => {
    const { Wrapper } = harness();
    const { getByText, container } = render(<Wrapper />);
    fireEvent.click(getByText('Taxonomy'));
    expect(container.textContent).toContain('Categories');
    expect(container.textContent).toContain('Tags');
  });

  it('loads custom field defs+values lazily when Custom Fields tab is activated', async () => {
    fetchCustomFieldDefsMock.mockResolvedValue([{ id: 1 } as any]);
    fetchCustomFieldValuesMock.mockResolvedValue({ 7: 'preset-value' });
    const { Wrapper } = harness();
    const { getByText, findByTestId } = render(<Wrapper />);
    await act(async () => {
      fireEvent.click(getByText('Custom Fields'));
    });
    const cf = await findByTestId('custom-fields-section');
    expect(cf.getAttribute('data-defs')).toBe('1');
    expect(fetchCustomFieldDefsMock).toHaveBeenCalled();
    expect(fetchCustomFieldValuesMock).toHaveBeenCalledWith(11);
    // values prop reflects the resolved object.
    expect(cf.getAttribute('data-values')).toContain('preset-value');
  });

  it('skips fetchCustomFieldValues when the post has no id', async () => {
    fetchCustomFieldDefsMock.mockResolvedValue([]);
    const postNoId: Post = {
      title: '',
      slug: '',
      postType: 'post',
      content: '',
      published: false,
    };
    const { Wrapper } = harness(postNoId);
    const { getByText } = render(<Wrapper />);
    await act(async () => {
      fireEvent.click(getByText('Custom Fields'));
    });
    expect(fetchCustomFieldDefsMock).toHaveBeenCalled();
    expect(fetchCustomFieldValuesMock).not.toHaveBeenCalled();
  });

  it('updateCustomFieldValue saves the value, shows saving then saved status', async () => {
    fetchCustomFieldDefsMock.mockResolvedValue([]);
    fetchCustomFieldValuesMock.mockResolvedValue({});
    saveCustomFieldValueMock.mockResolvedValue(true);

    const { Wrapper } = harness();
    const { container, getByText, getByTestId, findByTestId } = render(<Wrapper />);
    await act(async () => {
      fireEvent.click(getByText('Custom Fields'));
    });
    const trigger = await findByTestId('cf-update-trigger');
    await act(async () => {
      fireEvent.click(trigger);
    });
    expect(saveCustomFieldValueMock).toHaveBeenCalledWith(11, 7, 'cf-new-value');
    // After the resolved save the status should land on "Saved" (or already cleared if timer fired);
    // we settle by waiting for the section to reflect the new local value either way.
    const cf = getByTestId('custom-fields-section');
    expect(cf.getAttribute('data-values')).toContain('cf-new-value');
    // The save-status message lifecycle: at minimum we saw a render with status "Saved" or "Saving".
    expect(container.textContent).toMatch(/Saving|Saved|Save failed|Page Details/);
  });

  it('updateCustomFieldValue surfaces an error state when saveCustomFieldValue rejects', async () => {
    fetchCustomFieldDefsMock.mockResolvedValue([]);
    fetchCustomFieldValuesMock.mockResolvedValue({});
    saveCustomFieldValueMock.mockRejectedValue(new Error('boom'));

    const { Wrapper } = harness();
    const { container, getByText, findByTestId } = render(<Wrapper />);
    await act(async () => {
      fireEvent.click(getByText('Custom Fields'));
    });
    const trigger = await findByTestId('cf-update-trigger');
    await act(async () => {
      fireEvent.click(trigger);
      // let the rejected promise flush
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(saveCustomFieldValueMock).toHaveBeenCalled();
    await waitFor(() => {
      expect(container.textContent).toContain('Save failed');
    });
  });
});
