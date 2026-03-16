'use client';

import { Navigation } from '@/components/ui/Navigation';
import { Footer } from '@/components/ui/Footer';
import { ReactNode } from 'react';

export function LayoutContent({ children }: { children: ReactNode }) {
  return (
    <>
      <Navigation />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
