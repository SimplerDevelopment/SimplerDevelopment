import type { Metadata } from 'next';
import { sd } from '@/lib/sd';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const config = await sd.config.get();
  return {
    title: { default: config.name, template: `%s | ${config.name}` },
    description: config.description || undefined,
    icons: config.branding.faviconUrl ? { icon: config.branding.faviconUrl } : undefined,
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const config = await sd.config.get();

  return (
    <html lang="en">
      <head>
        {config.cssVars && <style dangerouslySetInnerHTML={{ __html: config.cssVars }} />}
      </head>
      <body className="min-h-screen flex flex-col bg-[var(--brand-bg,#fff)] text-[var(--brand-text,#111)]">
        <Navigation siteName={config.name} items={config.navigation} branding={config.branding} />
        <main className="flex-1">{children}</main>
        <Footer siteName={config.name} />
      </body>
    </html>
  );
}
