/**
 * PUX-202 (design doc screen 66): the tool catalogue, named plainly for the
 * Connect AI page. One entry per file in lib/mcp/tools/ — mirrored by hand
 * because importing the registry pulls the DB layer into a page. A unit test
 * compares this map to the directory, so it cannot drift silently.
 * `room` is the portal room the tools belong to; `internal` files are
 * plumbing (no user-facing tools) and are listed but not shown.
 */
export type ToolDomain = { label: string; room: string; internal?: boolean };

export const TOOL_DOMAINS: Record<string, ToolDomain> = {
  'agent-flows': { label: 'Agent flows', room: 'Brain' },
  ai: { label: 'AI credits & usage', room: 'Account' },
  approvals: { label: 'Approvals', room: 'Work' },
  'artifact-vocab': { label: 'Artifact vocabulary', room: 'Work', internal: true },
  automations: { label: 'Automations', room: 'Brain' },
  billing: { label: 'Billing', room: 'Account' },
  bookings: { label: 'Bookings', room: 'Grow' },
  brain: { label: 'Company Brain — notes, people, decisions, playbooks', room: 'Brain' },
  branding: { label: 'Branding', room: 'Sites' },
  chat: { label: 'Live chat', room: 'Support' },
  cms: { label: 'Sites & pages', room: 'Sites' },
  crm: { label: 'CRM — contacts, companies, deals', room: 'Grow' },
  email: { label: 'Email campaigns', room: 'Grow' },
  hosting: { label: 'Hosting', room: 'Sites' },
  index: { label: 'Registry', room: 'Plumbing', internal: true },
  integrations: { label: 'Integrations', room: 'Account' },
  'kanban-artifacts': { label: 'Card artifacts', room: 'Work', internal: true },
  'kanban-search': { label: 'Card search', room: 'Work', internal: true },
  kanban: { label: 'Projects & cards', room: 'Work' },
  linkedin: { label: 'LinkedIn posts', room: 'Grow' },
  meta: { label: 'Who am I', room: 'Plumbing', internal: true },
  notifications: { label: 'Notifications', room: 'Account' },
  'pathviz-coordination': { label: 'Pathviz coordination', room: 'Plumbing', internal: true },
  'pathviz-shared': { label: 'Pathviz shared', room: 'Plumbing', internal: true },
  pathviz: { label: 'Path charts', room: 'Work' },
  'pitch-decks': { label: 'Pitch decks', room: 'Grow' },
  'post-types': { label: 'Content types', room: 'Sites' },
  profile: { label: 'Profile', room: 'Account' },
  'project-custom-fields': { label: 'Project fields', room: 'Work' },
  projects: { label: 'Projects', room: 'Work' },
  prompts: { label: 'Prompts', room: 'Plumbing', internal: true },
  resources: { label: 'Resources', room: 'Plumbing', internal: true },
  seo: { label: 'SEO', room: 'Grow' },
  services: { label: 'Services', room: 'Account' },
  'site-redirects': { label: 'Redirects', room: 'Sites' },
  sprints: { label: 'Sprints', room: 'Work' },
  storefront: { label: 'Store — products, orders, discounts', room: 'Sites' },
  surveys: { label: 'Surveys', room: 'Grow' },
  team: { label: 'Team', room: 'Account' },
  tickets: { label: 'Tickets', room: 'Support' },
  workflows: { label: 'Workflows & trigger links', room: 'Brain' },
};

export const ROOM_ORDER = ['Work', 'Grow', 'Sites', 'Brain', 'Support', 'Account'] as const;

export function toolDomainsByRoom(): [string, ToolDomain[]][] {
  const by = new Map<string, ToolDomain[]>();
  for (const d of Object.values(TOOL_DOMAINS)) {
    if (d.internal) continue;
    by.set(d.room, [...(by.get(d.room) ?? []), d]);
  }
  return ROOM_ORDER.filter((r) => by.has(r)).map((r) => [r, by.get(r)!]);
}
