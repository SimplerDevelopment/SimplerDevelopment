'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

interface PositionMultiSelectProps {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

export default function PositionMultiSelect({
  options,
  selected,
  onChange,
  placeholder = 'Filter by position...',
}: PositionMultiSelectProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = options.filter((o) => !selected.includes(o));
    if (!q) return pool.slice(0, 50);
    return pool.filter((o) => o.toLowerCase().includes(q)).slice(0, 50);
  }, [options, selected, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function addValue(value: string) {
    if (!selected.includes(value)) onChange([...selected, value]);
    setQuery('');
    inputRef.current?.focus();
  }

  function removeValue(value: string) {
    onChange(selected.filter((s) => s !== value));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      if (open && filtered[activeIndex]) {
        e.preventDefault();
        addValue(filtered[activeIndex]);
      }
    } else if (e.key === 'Backspace' && !query && selected.length > 0) {
      removeValue(selected[selected.length - 1]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative min-w-[220px]">
      <div
        onClick={() => {
          setOpen(true);
          inputRef.current?.focus();
        }}
        className="flex flex-wrap items-center gap-1.5 min-h-[38px] px-2 py-1 bg-background border border-border rounded-lg focus-within:ring-2 focus-within:ring-primary/50 cursor-text"
      >
        <span className="material-icons text-base text-muted-foreground pl-1">badge</span>
        {selected.map((s) => (
          <span
            key={s}
            className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-medium"
          >
            {s}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeValue(s);
              }}
              className="flex items-center hover:text-primary/70"
              aria-label={`Remove ${s}`}
            >
              <span className="material-icons text-sm">close</span>
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={selected.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[80px] bg-transparent border-0 outline-none text-sm text-foreground px-1 py-1"
        />
      </div>
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-border bg-popover shadow-lg">
          {filtered.map((opt, i) => (
            <li
              key={opt}
              onMouseDown={(e) => {
                e.preventDefault();
                addValue(opt);
              }}
              onMouseEnter={() => setActiveIndex(i)}
              className={`px-3 py-2 text-sm cursor-pointer ${
                i === activeIndex ? 'bg-accent text-accent-foreground' : 'text-foreground'
              }`}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
      {open && filtered.length === 0 && query && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg px-3 py-2 text-sm text-muted-foreground">
          No matching positions.
        </div>
      )}
    </div>
  );
}
