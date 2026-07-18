import type { ReactNode } from 'react';

interface Props {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  meta?: string;
  href?: string;
  onClick?: () => void;
}

export function EntityCard({ icon, title, subtitle, meta, href, onClick }: Props) {
  const inner = (
    <div className="flex items-start gap-2 rounded-md border border-slate-200 bg-white p-2 hover:border-brand-300 hover:bg-brand-50/40 transition-colors">
      <div className="text-brand-600 mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-900 truncate">{title}</div>
        {subtitle ? (
          <div className="text-xs text-slate-500 truncate">{subtitle}</div>
        ) : null}
      </div>
      {meta ? <div className="text-[10px] uppercase tracking-wide text-slate-400 shrink-0">{meta}</div> : null}
    </div>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="block">
        {inner}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="w-full text-left">
        {inner}
      </button>
    );
  }
  return inner;
}
