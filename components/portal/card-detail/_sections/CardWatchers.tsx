/**
 * Watch / Unwatch toggle (sidebar).
 */
'use client';

interface Props {
  watching: boolean;
  toggleWatch: () => void;
}

export function CardWatchers({ watching, toggleWatch }: Props) {
  return (
    <div>
      <button
        onClick={toggleWatch}
        className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
          watching
            ? 'bg-primary/10 border-primary text-primary'
            : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
        }`}
      >
        <span className="material-icons text-base">
          {watching ? 'notifications_active' : 'notifications_none'}
        </span>
        {watching ? 'Watching' : 'Watch'}
      </button>
    </div>
  );
}
