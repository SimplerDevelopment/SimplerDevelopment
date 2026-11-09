// Client-safe portal utilities — no DB or server imports

export function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

/**
 * Deterministic en-US formatting for UI numbers/dates/times. A bare
 * runtime-locale `toLocaleString()` renders differently per machine (es-ES
 * groups 4-digit numbers without separator and uses 24h / "p. m." markers),
 * which broke unit tests on non-en-US boxes and would render inconsistently
 * for users. Pinning en-US matches what production (en-US) already renders,
 * so this changes nothing visible in prod — it only makes output identical
 * everywhere. Prefer these over inline toLocale* calls.
 */
export function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

export function formatDate(value: Date | string | number): string {
  return new Date(value).toLocaleDateString('en-US');
}

export function formatTime(value: Date | string | number, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(value).toLocaleTimeString('en-US', opts);
}

export function invoiceStatusColor(status: string): string {
  const map: Record<string, string> = {
    draft: 'bg-muted text-muted-foreground',
    sent: 'bg-blue-100 text-blue-700',
    paid: 'bg-green-100 text-green-700',
    overdue: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-500',
  };
  return map[status] ?? 'bg-muted text-muted-foreground';
}

export function ticketStatusColor(status: string): string {
  const map: Record<string, string> = {
    open: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-yellow-100 text-yellow-700',
    waiting: 'bg-orange-100 text-orange-700',
    waiting_on_customer: 'bg-orange-100 text-orange-700',
    resolved: 'bg-green-100 text-green-700',
    closed: 'bg-gray-100 text-gray-500',
  };
  return map[status] ?? 'bg-muted text-muted-foreground';
}

export function priorityColor(priority: string): string {
  const map: Record<string, string> = {
    low: 'bg-gray-100 text-gray-600',
    medium: 'bg-blue-100 text-blue-700',
    high: 'bg-orange-100 text-orange-700',
    urgent: 'bg-red-100 text-red-700',
  };
  return map[priority] ?? 'bg-muted text-muted-foreground';
}

export function orderStatusColor(status: string): string {
  const map: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    confirmed: 'bg-blue-100 text-blue-700',
    processing: 'bg-indigo-100 text-indigo-700',
    shipped: 'bg-purple-100 text-purple-700',
    delivered: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
    refunded: 'bg-orange-100 text-orange-700',
  };
  return map[status] ?? 'bg-muted text-muted-foreground';
}

export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/\n{2,}/g, ' ')
    .trim();
}

export function paymentStatusColor(status: string): string {
  const map: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    paid: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    refunded: 'bg-orange-100 text-orange-700',
    partially_refunded: 'bg-amber-100 text-amber-700',
  };
  return map[status] ?? 'bg-muted text-muted-foreground';
}
