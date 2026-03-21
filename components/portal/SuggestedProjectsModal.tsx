'use client';

import { useState, useEffect, useCallback } from 'react';

interface SuggestedProject {
  id: number;
  title: string;
  description: string | null;
  category: string;
  estimatedPrice: number | null;
  estimatedTimeline: string | null;
  features: string[];
  icon: string;
}

function formatCents(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
}

const categoryLabel: Record<string, string> = {
  website: 'Website',
  ecommerce: 'E-Commerce',
  mobile: 'Mobile App',
  maintenance: 'Maintenance',
  branding: 'Branding',
  development: 'Development',
  other: 'Other',
};

export default function SuggestedProjectsModal() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SuggestedProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const fetchItems = useCallback(async () => {
    if (fetched) return;
    setLoading(true);
    const res = await fetch('/api/portal/suggested-projects');
    const data = await res.json();
    setItems(data.data ?? []);
    setLoading(false);
    setFetched(true);
  }, [fetched]);

  const handleOpen = () => {
    setOpen(true);
    fetchItems();
  };

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <>
      <button
        onClick={handleOpen}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-primary text-primary text-sm font-medium hover:bg-primary hover:text-primary-foreground transition-colors"
      >
        <span className="material-icons text-base">rocket_launch</span>
        Suggested Projects
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Modal */}
          <div className="relative bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
              <div>
                <h2 className="text-xl font-bold text-foreground">Suggested Projects</h2>
                <p className="text-sm text-muted-foreground mt-0.5">Ideas we think would be a great fit for you.</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <span className="material-icons">close</span>
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 p-6">
              {loading ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                  <span className="material-icons animate-spin text-xl">refresh</span>
                  Loading suggestions...
                </div>
              ) : items.length === 0 ? (
                <div className="text-center py-16">
                  <span className="material-icons text-5xl text-muted-foreground">rocket_launch</span>
                  <h3 className="mt-4 font-semibold text-foreground">No suggestions yet</h3>
                  <p className="mt-2 text-sm text-muted-foreground">Check back soon — we&apos;ll add tailored recommendations for you.</p>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                  {items.map(item => (
                    <div key={item.id} className="bg-background border border-border rounded-xl p-5 flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="material-icons text-2xl text-primary">{item.icon}</span>
                        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full capitalize">
                          {categoryLabel[item.category] ?? item.category}
                        </span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">{item.title}</h3>
                        {item.description && (
                          <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                        )}
                      </div>
                      {(item.features ?? []).length > 0 && (
                        <ul className="space-y-1">
                          {(item.features ?? []).map((f, i) => (
                            <li key={i} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <span className="material-icons text-sm text-green-600 flex-shrink-0">check_circle</span>
                              {f}
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-auto pt-2 flex items-center justify-between gap-2 border-t border-border">
                        <div>
                          <p className="text-base font-bold text-foreground">
                            {item.estimatedPrice ? formatCents(item.estimatedPrice) : 'Quote on request'}
                          </p>
                          {item.estimatedTimeline && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <span className="material-icons text-xs">schedule</span>
                              {item.estimatedTimeline}
                            </p>
                          )}
                        </div>
                        <a
                          href="/portal/tickets/new"
                          className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
                        >
                          <span className="material-icons text-sm">chat</span>
                          Get started
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border flex-shrink-0 flex items-center justify-between text-sm text-muted-foreground">
              <p>Interested? Open a support ticket and we&apos;ll get in touch.</p>
              <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg border border-border text-foreground hover:bg-accent transition-colors text-sm">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
