'use client';

import { usePathname } from 'next/navigation';
import { Navigation } from '@/components/ui/Navigation';
import { Footer } from '@/components/ui/Footer';
import { ReactNode } from 'react';

export function LayoutContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // Hide header and footer on coming soon page (home)
  const isComingSoonPage = pathname === '/';

  return (
    <>
      {!isComingSoonPage && <Navigation />}
      <main className="flex-1">{children}</main>
      {!isComingSoonPage && <Footer />}
    </>
  );
}
