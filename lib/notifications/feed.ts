// Pure helpers shared by the notification bell (components/portal/
// NotificationBell.tsx) and its redesign list (StudioNotificationList.tsx).
// Moved out of the bell in PUX-148 so the bell — a pinned god file — shrinks,
// and so "every row deep-links" holds in BOTH flag states.

/** "just now" · "5m ago" · "3h ago" · "2d ago" · "4mo ago" */
export function relativeTime(dateStr: string, now: number = Date.now()): string {
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function pmEntityUrl(cardId: number | null, projectId: number | null): string | null {
  if (cardId && projectId) return `/portal/projects/${projectId}?card=${cardId}`;
  if (projectId) return `/portal/projects/${projectId}`;
  return null;
}

// Where a CRM-feed row goes. Entity-level when the row carries an id, else the
// room the entity lives in — never null, so no row is a dead end (design doc
// screen 04: "every row deep-links"). Before PUX-148 anything outside the six
// CRM types returned null (document_comment_mention rows — post/deck/email —
// always did), and `document` pointed at /portal/brain/notes/, a route that
// does not exist.
const ROOM: Record<string, string> = {
  contact: '/portal/crm/contacts',
  deal: '/portal/crm/deals',
  proposal: '/portal/crm/deals',
  company: '/portal/crm/companies',
  mcp_approval: '/portal/approvals',
  document: '/portal/brain/documents',
  post: '/portal/websites',
  deck: '/portal/tools/pitch-decks',
  email: '/portal/email/campaigns',
  ticket: '/portal/tickets',
  survey: '/portal/surveys',
  booking: '/portal/tools/booking',
};
// Types whose room page can open one record by id in the URL.
const BY_ID: Record<string, (id: number) => string> = {
  contact: (id) => `/portal/crm/contacts/${id}`,
  deal: (id) => `/portal/crm/deals/${id}`,
  proposal: (id) => `/portal/crm/deals/${id}`,
  company: (id) => `/portal/crm/companies/${id}`,
  mcp_approval: (id) => `/portal/approvals?id=${id}`,
  document: (id) => `/portal/brain/documents/${id}`,
  deck: (id) => `/portal/tools/pitch-decks/${id}`,
  email: (id) => `/portal/email/campaigns/${id}`,
  ticket: (id) => `/portal/tickets/${id}`,
  survey: (id) => `/portal/surveys/${id}`,
  // post: a post URL needs its siteId, which the row does not carry → the room.
};
export function crmEntityUrl(entityType: string | null, entityId: number | null): string {
  if (!entityType) return '/portal/notifications';
  const byId = BY_ID[entityType];
  if (entityId && byId) return byId(entityId);
  return ROOM[entityType] ?? '/portal/notifications';
}

/** Same calendar day (local) as `now` → Today; anything older → Earlier. */
export function dayBucket(dateStr: string, now: Date = new Date()): 'Today' | 'Earlier' {
  const d = new Date(dateStr);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
    ? 'Today'
    : 'Earlier';
}

/** "Dana Park replied on #482" with actor "Dana Park" → the actor to bold and the rest. */
export function splitActor(title: string, actor: string | null): { actor: string | null; rest: string } {
  if (actor && title.startsWith(actor)) return { actor, rest: title.slice(actor.length).trim() };
  return { actor: null, rest: title };
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join('');
}
