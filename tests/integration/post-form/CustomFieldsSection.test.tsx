import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// MediaPicker is rendered for `image`-type fields; mock it to avoid pulling
// in upload-component dependencies during the unit/integration test.
vi.mock('@/components/admin/MediaPicker', () => ({
  default: ({ label, value, onChange }: { label?: string; value?: string; onChange: (v: string) => void }) => (
    <div data-testid={`media-picker-${(label || 'untitled').toLowerCase().replace(/\s+/g, '-')}`}>
      <input
        aria-label={label || 'media-picker'}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  ),
}));

import { CustomFieldsSection } from '@/components/portal/post-form/sections/CustomFieldsSection';
import type { CustomFieldDef } from '@/components/portal/post-form/_lib/types';

const FIELDS: CustomFieldDef[] = [
  {
    id: 1,
    parentId: null,
    name: 'Author',
    slug: 'author',
    fieldType: 'text',
    options: null,
    required: false,
    defaultValue: null,
    helpText: 'Byline for the article',
  },
  {
    id: 2,
    parentId: null,
    name: 'Pinned',
    slug: 'pinned',
    fieldType: 'checkbox',
    options: null,
    required: false,
    defaultValue: null,
    helpText: null,
  },
];

describe('CustomFieldsSection', () => {
  it('renders one input per top-level field def with the field name as a label', () => {
    render(
      <CustomFieldsSection
        customFieldDefs={FIELDS}
        customFieldValues={{ 1: 'Jane Doe' }}
        updateCustomFieldValue={vi.fn()}
        siteId={1}
        postType="blog"
        showManageFieldsModal={false}
        setShowManageFieldsModal={vi.fn()}
        setCustomFieldsLoaded={vi.fn()}
      />,
    );

    // Field labels render
    expect(screen.getByText('Author')).toBeInTheDocument();
    expect(screen.getByText('Byline for the article')).toBeInTheDocument();

    // Existing value hydrates into the input
    const authorInput = screen.getAllByRole('textbox')[0] as HTMLInputElement;
    expect(authorInput.value).toBe('Jane Doe');

    // Manage Fields button is exposed for opening the management modal
    expect(screen.getByRole('button', { name: /Manage Fields/ })).toBeInTheDocument();
  });

  it('fires updateCustomFieldValue when the user edits a text field', async () => {
    const user = userEvent.setup();
    const updateCustomFieldValue = vi.fn();

    render(
      <CustomFieldsSection
        customFieldDefs={FIELDS}
        customFieldValues={{ 1: '' }}
        updateCustomFieldValue={updateCustomFieldValue}
        siteId={1}
        postType="blog"
        showManageFieldsModal={false}
        setShowManageFieldsModal={vi.fn()}
        setCustomFieldsLoaded={vi.fn()}
      />,
    );

    const authorInput = screen.getAllByRole('textbox')[0];
    await user.type(authorInput, 'A');

    // Each keystroke fires once with the field id + new value
    expect(updateCustomFieldValue).toHaveBeenCalledWith(1, 'A');
  });

  it('shows the empty-state message when no fields are defined', () => {
    render(
      <CustomFieldsSection
        customFieldDefs={[]}
        customFieldValues={{}}
        updateCustomFieldValue={vi.fn()}
        siteId={1}
        postType="page"
        showManageFieldsModal={false}
        setShowManageFieldsModal={vi.fn()}
        setCustomFieldsLoaded={vi.fn()}
      />,
    );

    expect(screen.getByText(/No custom fields defined yet/i)).toBeInTheDocument();
  });

  it('opens the manage-fields modal when the Manage Fields button is clicked', () => {
    const setShowManageFieldsModal = vi.fn();
    render(
      <CustomFieldsSection
        customFieldDefs={[]}
        customFieldValues={{}}
        updateCustomFieldValue={vi.fn()}
        siteId={1}
        postType="page"
        showManageFieldsModal={false}
        setShowManageFieldsModal={setShowManageFieldsModal}
        setCustomFieldsLoaded={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Manage Fields/ }));
    expect(setShowManageFieldsModal).toHaveBeenCalledWith(true);
  });
});
