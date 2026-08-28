'use client';

/**
 * PUX-210 (design doc screen 74): the SEO fields as the search result they
 * produce, instead of two inputs behind a collapsed toggle. Falls back to the
 * product name / description the way a search engine would. Studio-only.
 */

export default function SeoSnippetPreview({ title, description, name, slug, host }: { title?: string | null; description?: string | null; name: string; slug?: string | null; host?: string }) {
  const t = (title || name || 'Untitled product').slice(0, 60);
  const d = (description || '').slice(0, 155);
  return (
    <section className="rounded-2xl border border-border bg-card p-5" aria-label="Search preview">
      <p className="font-display text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground">How it shows up in search</p>
      <div className="mt-3 rounded-xl border border-border bg-background p-4">
        <p className="truncate text-xs text-muted-foreground">{host ?? 'your-site'}{slug ? ` › products › ${slug}` : ''}</p>
        <p className="mt-0.5 truncate text-[17px] text-[#1a0dab] dark:text-[#8ab4f8]">{t}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{d || <span className="italic">Add a meta description — search shows the first 155 characters.</span>}</p>
      </div>
      <p className="mt-2 text-xs text-muted-foreground tabular-nums">{t.length}/60 title · {d.length}/155 description</p>
    </section>
  );
}
