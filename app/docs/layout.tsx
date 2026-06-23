import type { ReactNode } from 'react';
import './docs.css';
import { NAV } from './_lib/nav';
import { DocsChrome } from './_components/DocsChrome';

export default function DocsLayout({ children }: { children: ReactNode }) {
  return <DocsChrome nav={NAV}>{children}</DocsChrome>;
}
