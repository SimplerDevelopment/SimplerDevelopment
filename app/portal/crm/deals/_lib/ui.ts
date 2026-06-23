/**
 * UI constants/helpers shared across the deals page modules.
 * Visual values are kept identical to the pre-refactor inline definitions —
 * any drift here would shift the page's rendered output.
 */

export const inputClass =
  'w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50';

export const priorityColor: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-red-100 text-red-700',
};

export const statusFilters = [
  { value: 'open', label: 'Open' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
];

export const ARTIFACT_ICONS: Record<string, string> = {
  website: 'language',
  email_campaign: 'campaign',
  pitch_deck: 'slideshow',
  proposal: 'description',
  booking: 'calendar_month',
  survey: 'poll',
  project: 'folder',
};

export const ARTIFACT_LABELS: Record<string, string> = {
  website: 'Website',
  email_campaign: 'Email Campaign',
  pitch_deck: 'Pitch Deck',
  proposal: 'Proposal',
  booking: 'Booking',
  survey: 'Survey',
  project: 'Project',
};

export function artifactUrl(type: string, id: number): string | null {
  switch (type) {
    case 'website':
      return `/portal/websites/${id}`;
    case 'email_campaign':
      return `/portal/email/campaigns/${id}`;
    case 'pitch_deck':
      return `/portal/tools/pitch-decks/${id}`;
    case 'proposal':
      return `/portal/crm/proposals/${id}`;
    case 'booking':
      return `/portal/tools/booking/${id}`;
    case 'survey':
      return `/portal/surveys/${id}`;
    case 'project':
      return `/portal/projects/${id}`;
    default:
      return null;
  }
}

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function formatDateForInput(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toISOString().split('T')[0];
}

/** Shared react-select classNames so dropdowns match the app's design tokens. */
export const rsClassNames = {
  control: (s: { isFocused: boolean; isDisabled: boolean }) =>
    `!bg-background !border !border-border !rounded-lg !min-h-[38px] !text-sm ${s.isFocused ? '!ring-2 !ring-primary/50' : ''} ${s.isDisabled ? '!opacity-60 !cursor-not-allowed' : ''}`,
  menu: () => '!bg-popover !border !border-border !text-foreground !rounded-lg !shadow-lg',
  option: (s: { isFocused: boolean; isSelected: boolean }) =>
    `!text-sm !px-3 !py-2 !cursor-pointer ${s.isSelected ? '!bg-primary !text-primary-foreground' : s.isFocused ? '!bg-accent !text-accent-foreground' : '!text-foreground'}`,
  singleValue: () => '!text-foreground',
  placeholder: () => '!text-muted-foreground',
  input: () => '!text-foreground',
  noOptionsMessage: () => '!text-muted-foreground !text-sm !py-2',
  indicatorSeparator: () => '!bg-border',
};
