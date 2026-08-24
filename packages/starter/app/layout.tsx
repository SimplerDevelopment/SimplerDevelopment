/**
 * Root layout — pulls the site's identity, branding and navigation from the CMS.
 *
 * `config.get()` returns name, description, branding, cssVars, navigation and
 * storeEnabled in ONE request, which is why it is used here instead of calling
 * branding and navigation separately.
 *
 * The branding CSS variables are injected as a real stylesheet on :root rather
 * than an inline style on <body>, so they are available to every rule in your
 * own CSS — including media queries and pseudo-elements, which an inline style
 * cannot reach.
 */
import type { Metadata } from 'next';
import { sd } from '@/lib/sd';
import { SiteNav } from '@/components/SiteNav';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const config = await sd.config.get();
  return {
    title: { default: config.name, template: `%s · ${config.name}` },
    description: config.description ?? undefined,
    icons: config.branding.faviconUrl ? { icon: config.branding.faviconUrl } : undefined,
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const config = await sd.config.get();
  const cssVars = Object.entries(config.cssVars)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join('\n');

  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: `:root {\n${cssVars}\n}` }} />
      </head>
      <body>
        <SiteNav items={config.navigation} siteName={config.name} />
        <main>{children}</main>
      </body>
    </html>
  );
}
