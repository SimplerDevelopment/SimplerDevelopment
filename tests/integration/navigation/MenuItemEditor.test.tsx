/** Integration tests for the extracted MenuItemEditor component. */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// MediaPicker hits /api/portal/media in a useEffect; mock it down to a no-op
// so we can render the editor in pure jsdom.
vi.mock('@/components/admin/MediaPicker', () => ({
  __esModule: true,
  default: ({ value, label }: { value?: string; label?: string }) => (
    <div data-testid="media-picker">
      {label}: {value || '(empty)'}
    </div>
  ),
}));

import { MenuItemEditor } from '@/app/portal/websites/[siteId]/navigation/_components/MenuItemEditor';
import type { NavItem } from '@/app/portal/websites/[siteId]/navigation/_lib/types';

const baseItem: NavItem = {
  id: 1,
  label: 'About',
  href: '/about',
  parentId: null,
  sortOrder: 0,
  openInNewTab: false,
  isButton: false,
};

const noop = () => {};

function renderEditor(overrides: Partial<Parameters<typeof MenuItemEditor>[0]> = {}) {
  return render(
    <MenuItemEditor
      item={baseItem}
      editing={false}
      onEdit={noop}
      onUpdate={noop}
      onRemove={noop}
      onMoveUp={noop}
      onMoveDown={noop}
      {...overrides}
    />,
  );
}

describe('MenuItemEditor', () => {
  it('renders the collapsed row with label and href', () => {
    renderEditor();
    expect(screen.getByText('About')).toBeTruthy();
    expect(screen.getByText('/about')).toBeTruthy();
  });

  it('shows the Button badge when isButton is true', () => {
    renderEditor({ item: { ...baseItem, isButton: true } });
    expect(screen.getByText(/Button/i)).toBeTruthy();
  });

  it('fires onMoveUp when the up arrow is clicked', () => {
    const onMoveUp = vi.fn();
    renderEditor({ onMoveUp });
    fireEvent.click(screen.getByTitle('Move up'));
    expect(onMoveUp).toHaveBeenCalledTimes(1);
  });

  it('fires onMoveDown when the down arrow is clicked', () => {
    const onMoveDown = vi.fn();
    renderEditor({ onMoveDown });
    fireEvent.click(screen.getByTitle('Move down'));
    expect(onMoveDown).toHaveBeenCalledTimes(1);
  });

  it('fires onRemove when the delete button is clicked', () => {
    const onRemove = vi.fn();
    renderEditor({ onRemove });
    fireEvent.click(screen.getByTitle('Remove'));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('fires onEdit when the edit button is clicked', () => {
    const onEdit = vi.fn();
    renderEditor({ onEdit });
    fireEvent.click(screen.getByTitle('Edit'));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('shows the inline edit form when editing=true', () => {
    renderEditor({ editing: true });
    // Label + URL inputs are present
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it('fires onUpdate({label}) when the label input changes', () => {
    const onUpdate = vi.fn();
    renderEditor({ editing: true, onUpdate });
    const labelInput = screen.getAllByRole('textbox')[0];
    fireEvent.change(labelInput, { target: { value: 'Pricing' } });
    expect(onUpdate).toHaveBeenCalledWith({ label: 'Pricing' });
  });

  it('fires onUpdate({href}) when the URL input changes', () => {
    const onUpdate = vi.fn();
    renderEditor({ editing: true, onUpdate });
    const urlInput = screen.getAllByRole('textbox')[1];
    fireEvent.change(urlInput, { target: { value: '/pricing' } });
    expect(onUpdate).toHaveBeenCalledWith({ href: '/pricing' });
  });

  it('toggles openInNewTab via the checkbox', () => {
    const onUpdate = vi.fn();
    renderEditor({ editing: true, onUpdate });
    const newTabBox = screen.getByLabelText(/Open in new tab/);
    fireEvent.click(newTabBox);
    expect(onUpdate).toHaveBeenCalledWith({ openInNewTab: true });
  });

  it('toggles isButton via the checkbox', () => {
    const onUpdate = vi.fn();
    renderEditor({ editing: true, onUpdate });
    const buttonBox = screen.getByLabelText(/Display as button/);
    fireEvent.click(buttonBox);
    expect(onUpdate).toHaveBeenCalledWith({ isButton: true });
  });

  it('mega column role: shows Column Heading + Column badge, no URL field', () => {
    renderEditor({
      editing: true,
      isMegaMenu: true,
      depth: 1,
      item: { ...baseItem, label: 'Products', parentId: 99 },
    });
    expect(screen.getByText(/Column Heading/i)).toBeTruthy();
    // URL label is not rendered for column rows
    expect(screen.queryByText(/^URL$/)).toBeNull();
  });

  it('mega-item role: shows Description + Icon fields', () => {
    renderEditor({
      editing: true,
      isMegaMenu: true,
      depth: 2,
      item: { ...baseItem, parentId: 5 },
    });
    expect(screen.getByText(/Description/i)).toBeTruthy();
    expect(screen.getByText(/Icon/i)).toBeTruthy();
  });

  it('top-level + onAddChild: renders "Add dropdown item" (non-mega)', () => {
    renderEditor({ editing: true, onAddChild: noop, depth: 0, isMegaMenu: false });
    expect(screen.getByText(/Add dropdown item/i)).toBeTruthy();
  });

  it('top-level + onAddChild + mega: renders "Add column"', () => {
    renderEditor({ editing: true, onAddChild: noop, depth: 0, isMegaMenu: true });
    expect(screen.getByText(/Add column/i)).toBeTruthy();
  });
});
