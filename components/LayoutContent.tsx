'use client';

import { Navigation } from '@/components/ui/Navigation';
import { Footer } from '@/components/ui/Footer';
import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

export function LayoutContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPetersOutdoor = pathname.startsWith('/p/');
  const isAdminOrPortal = pathname.startsWith('/admin') || pathname.startsWith('/portal');
  const isPitchDeck = pathname.startsWith('/pitch-deck');

  if (isPetersOutdoor || isAdminOrPortal || isPitchDeck) {
    return <>{children}</>;
  }

  return (
    <>
      <Navigation />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
