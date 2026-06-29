import type { ReactNode } from 'react';
import Link from 'next/link';

/**
 * Shared chrome for the public legal pages (`/privacy`, `/terms`) so the two
 * documents stay visually identical. Presentational + RSC-safe.
 */
export function LegalLayout({
  title,
  updated,
  intro,
  children,
  crossLink,
}: {
  title: string;
  updated: string;
  intro: string;
  children: ReactNode;
  crossLink: { href: string; label: string };
}) {
  return (
    <div className="container mx-auto px-4 py-20">
      <div className="mx-auto max-w-3xl">
        <p className="mb-3 text-sm font-semibold text-primary">Legal</p>
        <h1 className="font-display mb-3 text-4xl font-bold md:text-5xl">{title}</h1>
        <p className="mb-2 text-sm text-muted-foreground">Last updated: {updated}</p>
        <p className="mb-12 text-lg text-muted-foreground">{intro}</p>

        <article className="space-y-10">{children}</article>

        <div className="mt-16 border-t border-border pt-8 text-sm text-muted-foreground">
          <p className="mb-2">
            Questions about this document? Contact us at{' '}
            <a href="mailto:info@simplerdevelopment.com" className="text-primary hover:underline">
              info@simplerdevelopment.com
            </a>
            .
          </p>
          <p>
            See also our{' '}
            <Link href={crossLink.href} className="text-primary hover:underline">
              {crossLink.label}
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

/** A titled section of a legal document, with consistent prose styling for its
 *  paragraphs, lists, links, and emphasis. */
export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold text-foreground">{heading}</h2>
      <div className="space-y-3 leading-relaxed text-muted-foreground [&_a]:text-primary [&_a:hover]:underline [&_li]:mb-1 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6">
        {children}
      </div>
    </section>
  );
}
