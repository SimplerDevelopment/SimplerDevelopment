// Bare layout for in-iframe widget surfaces — no portal chrome, no nav.
// We deliberately strip the inherited (root) layout's headers / fonts
// because the widget is a self-contained 380x560 iframe on a third-party
// site; loading the full app shell would be wasteful and visually wrong.

import type { ReactNode } from 'react';

export const metadata = {
  title: 'Live chat',
  robots: { index: false, follow: false },
};

export default function WidgetLayout({ children }: { children: ReactNode }) {
  return <div style={{ margin: 0, padding: 0 }}>{children}</div>;
}
