// @vitest-environment jsdom
import React from 'react';
import {
  describe,
  it,
  expect,
  vi,
  afterEach,
} from 'vitest';
import { render, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks for downstream render components — these are not under test here, and
// keeping them light keeps the unit specs focused on the wrapper logic.
// ---------------------------------------------------------------------------

vi.mock('@/components/blocks/render/SiteFooterBlockRender', () => ({
  SiteFooterBlockRender: ({ block }: any) =>
    React.createElement(
      'div',
      { 'data-testid': 'site-footer-render' },
      `groups:${(block?.linkGroups ?? []).length}`,
    ),
}));

vi.mock('@/components/blocks/render/TeamFlipGridBlockRender', () => ({
  TeamFlipGridBlockRender: ({ block }: any) =>
    React.createElement(
      'div',
      { 'data-testid': 'team-flip-render' },
      `members:${(block?.members ?? []).length}`,
    ),
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------
import { SurveyInputBlockRender } from '@/components/blocks/render/SurveyInputBlockRender';
import { SiteFooterBlockPreview } from '@/components/blocks/visual/SiteFooterBlockPreview';
import { TeamFlipGridBlockPreview } from '@/components/blocks/visual/TeamFlipGridBlockPreview';
import { StatusSection } from '@/components/portal/post-form/sections/StatusSection';

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// SurveyInputBlockRender — thin wrapper that forwards block fields into the
// shared SurveyInputPreview. We don't mock the previewer here because it is
// the actual rendering target we want exercised.
// ---------------------------------------------------------------------------
describe('SurveyInputBlockRender', () => {
  it('renders a text input for fieldType="text" with the supplied placeholder', () => {
    const block: any = {
      id: 'b1',
      type: 'survey-input',
      fieldType: 'text',
      placeholder: 'Your name',
    };
    const { container } = render(<SurveyInputBlockRender block={block} />);
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.readOnly).toBe(true);
    expect(input.placeholder).toBe('Your name');
  });

  it('falls back to "Enter <fieldType>..." when placeholder is omitted', () => {
    const block: any = {
      id: 'b1',
      type: 'survey-input',
      fieldType: 'email',
    };
    const { container } = render(<SurveyInputBlockRender block={block} />);
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input.placeholder).toBe('Enter email...');
  });

  it('renders a textarea preview for fieldType="textarea"', () => {
    const block: any = {
      id: 'b2',
      type: 'survey-input',
      fieldType: 'textarea',
      placeholder: 'Tell us more',
    };
    const { container } = render(<SurveyInputBlockRender block={block} />);
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(ta).toBeTruthy();
    expect(ta.readOnly).toBe(true);
    expect(ta.placeholder).toBe('Tell us more');
    expect(ta.rows).toBe(3);
  });

  it('renders a date placeholder block with a calendar icon for fieldType="date"', () => {
    const block: any = { id: 'b3', type: 'survey-input', fieldType: 'date' };
    const { container } = render(<SurveyInputBlockRender block={block} />);
    expect(container.textContent).toContain('Select a date...');
    expect(container.querySelector('.material-icons')?.textContent).toBe(
      'calendar_today',
    );
  });

  it('renders a select preview with a dropdown chevron for fieldType="select"', () => {
    const block: any = { id: 'b4', type: 'survey-input', fieldType: 'select' };
    const { container } = render(<SurveyInputBlockRender block={block} />);
    expect(container.textContent).toContain('Select...');
    expect(container.querySelector('.material-icons')?.textContent).toBe(
      'arrow_drop_down',
    );
  });

  it('renders the provided radio options when options are non-empty', () => {
    const block: any = {
      id: 'b5',
      type: 'survey-input',
      fieldType: 'radio',
      options: ['Apple', 'Banana', 'Cherry'],
    };
    const { container } = render(<SurveyInputBlockRender block={block} />);
    expect(container.textContent).toContain('Apple');
    expect(container.textContent).toContain('Banana');
    expect(container.textContent).toContain('Cherry');
  });
});

// ---------------------------------------------------------------------------
// SiteFooterBlockPreview — shows an empty-state when there are no link groups,
// otherwise delegates to SiteFooterBlockRender (mocked above).
// ---------------------------------------------------------------------------
describe('SiteFooterBlockPreview', () => {
  it('renders the empty-state with a hint when isSelected is true', () => {
    const block: any = {
      id: 'sf1',
      type: 'site-footer',
      linkGroups: [],
    };
    const { container } = render(
      <SiteFooterBlockPreview block={block} isSelected={true} onChange={() => {}} />,
    );
    expect(container.textContent).toContain('Site Footer');
    expect(container.textContent).toContain('Add link groups in the side panel.');
    // does NOT delegate to the inner render
    expect(container.querySelector('[data-testid="site-footer-render"]')).toBeNull();
  });

  it('renders the unselected hint when isSelected is false and groups are missing', () => {
    const block: any = {
      id: 'sf2',
      type: 'site-footer',
      // linkGroups intentionally undefined to exercise the !block.linkGroups branch
    };
    const { container } = render(
      <SiteFooterBlockPreview block={block} isSelected={false} onChange={() => {}} />,
    );
    expect(container.textContent).toContain('Site Footer');
    expect(container.textContent).toContain(
      'No link groups yet — click to select and configure.',
    );
  });

  it('delegates to SiteFooterBlockRender when link groups exist', () => {
    const block: any = {
      id: 'sf3',
      type: 'site-footer',
      linkGroups: [{ title: 'Company', links: [] }, { title: 'Support', links: [] }],
    };
    const { container } = render(
      <SiteFooterBlockPreview block={block} isSelected={false} onChange={() => {}} />,
    );
    const inner = container.querySelector('[data-testid="site-footer-render"]');
    expect(inner).toBeTruthy();
    expect(inner?.textContent).toBe('groups:2');
    // empty state must not be present
    expect(container.textContent).not.toContain('Site Footer');
  });
});

// ---------------------------------------------------------------------------
// TeamFlipGridBlockPreview — same empty/delegate pattern as the footer preview.
// ---------------------------------------------------------------------------
describe('TeamFlipGridBlockPreview', () => {
  it('renders the selected empty-state copy when members is empty', () => {
    const block: any = {
      id: 't1',
      type: 'team-flip-grid',
      members: [],
    };
    const { container } = render(
      <TeamFlipGridBlockPreview block={block} isSelected={true} onChange={() => {}} />,
    );
    expect(container.textContent).toContain('Team Flip Grid');
    expect(container.textContent).toContain('Add team members in the side panel.');
  });

  it('renders the unselected hint when members is omitted', () => {
    const block: any = {
      id: 't2',
      type: 'team-flip-grid',
    };
    const { container } = render(
      <TeamFlipGridBlockPreview block={block} isSelected={false} onChange={() => {}} />,
    );
    expect(container.textContent).toContain(
      'No members yet — click to select and add members.',
    );
  });

  it('delegates to TeamFlipGridBlockRender when members has entries', () => {
    const block: any = {
      id: 't3',
      type: 'team-flip-grid',
      members: [
        { name: 'Ada', role: 'CEO' },
        { name: 'Bee', role: 'CTO' },
        { name: 'Cee', role: 'COO' },
      ],
    };
    const { container } = render(
      <TeamFlipGridBlockPreview block={block} isSelected={true} onChange={() => {}} />,
    );
    const inner = container.querySelector('[data-testid="team-flip-render"]');
    expect(inner).toBeTruthy();
    expect(inner?.textContent).toBe('members:3');
    // empty state copy must be absent
    expect(container.textContent).not.toContain('Add team members');
  });
});

// ---------------------------------------------------------------------------
// StatusSection — small controlled <select> bound to formData.published.
// ---------------------------------------------------------------------------
describe('StatusSection', () => {
  function makePost(overrides: Partial<any> = {}): any {
    return {
      title: '',
      slug: '',
      postType: 'page',
      content: '',
      published: false,
      ...overrides,
    };
  }

  it('renders the Status label and both options', () => {
    const setFormData = vi.fn();
    const { container } = render(
      <StatusSection formData={makePost()} setFormData={setFormData} />,
    );
    expect(container.textContent).toContain('Status');
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.value).toBe('draft');
    const options = Array.from(container.querySelectorAll('option')).map(
      (o) => (o as HTMLOptionElement).value,
    );
    expect(options).toEqual(['draft', 'published']);
  });

  it('reflects formData.published === true via the select value', () => {
    const setFormData = vi.fn();
    const { container } = render(
      <StatusSection
        formData={makePost({ published: true })}
        setFormData={setFormData}
      />,
    );
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('published');
  });

  it('calls setFormData with published=true when "published" is selected', () => {
    // We invoke the updater synchronously inside the setFormData mock because
    // the onChange handler reads `e.target.value` lazily inside its updater
    // closure — and React's controlled-select machinery reverts the DOM value
    // back to the formData-derived option AFTER fireEvent.change dispatches.
    // Calling the updater inside the mock captures the value while it's still
    // the one we set on the event.
    const observed: any[] = [];
    const setFormData = vi.fn((arg: any) => {
      if (typeof arg === 'function') {
        observed.push(arg(makePost({ published: false, title: 'Hello' })));
      } else {
        observed.push(arg);
      }
    });
    const { container } = render(
      <StatusSection formData={makePost()} setFormData={setFormData} />,
    );
    const select = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'published' } });
    expect(setFormData).toHaveBeenCalledTimes(1);
    expect(observed[0].published).toBe(true);
    expect(observed[0].title).toBe('Hello');
  });

  it('calls setFormData with published=false when "draft" is selected', () => {
    const observed: any[] = [];
    const setFormData = vi.fn((arg: any) => {
      if (typeof arg === 'function') {
        observed.push(arg(makePost({ published: true, slug: 'foo' })));
      } else {
        observed.push(arg);
      }
    });
    const { container } = render(
      <StatusSection
        formData={makePost({ published: true })}
        setFormData={setFormData}
      />,
    );
    const select = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'draft' } });
    expect(observed[0].published).toBe(false);
    expect(observed[0].slug).toBe('foo');
  });
});
