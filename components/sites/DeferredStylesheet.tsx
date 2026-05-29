'use client';

/**
 * Loads a stylesheet WITHOUT blocking first paint, React-19-safe.
 *
 * React 19 special-cases `<link rel="stylesheet">` (it hoists + manages it and
 * strips the media="print" swap trick). So instead we render `rel="preload"
 * as="style"` — which React treats as an inert resource hint — and flip it to
 * a real stylesheet via onLoad once the file has downloaded. The request still
 * starts early (it's in the SSR HTML) but never sits on the render-blocking
 * critical path. A <noscript> fallback keeps it working with JS disabled.
 *
 * Used for the brand Google-Fonts CSS and Material Icons on public client
 * sites — both were render-blocking <link>s competing with the LCP hero image
 * for the connection. Font files still use display:swap.
 */
export function DeferredStylesheet({ href }: { href: string }) {
  return (
    <>
      <link
        rel="preload"
        as="style"
        href={href}
        // eslint-disable-next-line react/no-unknown-property
        onLoad={(e) => {
          const l = e.currentTarget as HTMLLinkElement;
          l.onload = null;
          l.rel = 'stylesheet';
        }}
      />
      <noscript>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href={href} />
      </noscript>
    </>
  );
}
