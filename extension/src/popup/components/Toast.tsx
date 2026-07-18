import { useEffect } from 'react';

export type ToastLevel = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  level: ToastLevel;
  text: string;
  href?: string;
}

interface Props {
  items: ToastItem[];
  onDismiss(id: number): void;
}

export function ToastStack({ items, onDismiss }: Props) {
  return (
    <div className="pointer-events-none fixed top-2 right-2 z-50 flex flex-col gap-2">
      {items.map((t) => (
        <ToastCard key={t.id} item={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss(id: number): void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(item.id), 4000);
    return () => clearTimeout(t);
  }, [item.id, onDismiss]);

  const colors: Record<ToastLevel, string> = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    error: 'bg-rose-50 border-rose-200 text-rose-900',
    info: 'bg-slate-50 border-slate-200 text-slate-900',
  };
  const iconPath: Record<ToastLevel, string> = {
    success: 'M5 13l4 4L19 7',
    error: 'M6 18L18 6M6 6l12 12',
    info: 'M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  };

  return (
    <div
      className={`pointer-events-auto flex items-start gap-2 rounded-md border px-3 py-2 shadow-sm text-sm max-w-[340px] ${colors[item.level]}`}
      role="status"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
        <path d={iconPath[item.level]} />
      </svg>
      <div className="flex-1 leading-snug break-words">
        {item.text}
        {item.href ? (
          <>
            {' '}
            <a
              className="font-medium underline"
              href={item.href}
              target="_blank"
              rel="noreferrer"
            >
              View
            </a>
          </>
        ) : null}
      </div>
      <button
        type="button"
        className="text-current opacity-70 hover:opacity-100"
        onClick={() => onDismiss(item.id)}
        aria-label="Dismiss"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
