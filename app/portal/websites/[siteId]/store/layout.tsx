import type { ReactNode } from 'react';
import StoreSubNav from './StoreSubNav';

// Wraps every /portal/websites/[siteId]/store/* page with the persistent
// store sub-navigation. StoreSubNav is a client component (active-section
// state); this layout stays a server component.
export default function StoreLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <StoreSubNav />
      {children}
    </>
  );
}
