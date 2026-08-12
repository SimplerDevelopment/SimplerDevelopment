import type { SeoRunStatus } from './types';

const CONFIG: Record<SeoRunStatus, { label: string; classes: string; icon: string; spin?: boolean }> = {
  queued: {
    label: 'Queued',
    classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    icon: 'schedule',
  },
  running: {
    label: 'Running',
    classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    icon: 'progress_activity',
    spin: true,
  },
  succeeded: {
    label: 'Succeeded',
    classes: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    icon: 'check_circle',
  },
  failed: {
    label: 'Failed',
    classes: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    icon: 'error',
  },
  cancelled: {
    label: 'Cancelled',
    classes: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    icon: 'cancel',
  },
};

export function RunStatusPill({ status }: { status: SeoRunStatus }) {
  const c = CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${c.classes}`}>
      <span className={`material-icons text-xs ${c.spin ? 'animate-spin' : ''}`}>{c.icon}</span>
      {c.label}
    </span>
  );
}
